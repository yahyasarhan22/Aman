import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Complaint,
  REJECTION_REASONS,
  type RejectionReason,
} from '../complaints/complaint.entity';
import { decryptContact } from '../complaints/contact';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { User } from '../auth/user.entity';
import { RiskService } from '../risk/risk.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-log.entity';
import { SettingsService } from '../settings/settings.service';
import type {
  AdminComplaintDto,
  ComplaintFilter,
  DashboardDto,
  InspectorOptionDto,
  PlanningRowDto,
  RiskWeightsDto,
} from './admin.dto';

const DUPLICATE_WINDOW_MS = 72 * 3_600_000;
const HIGH_RISK_THRESHOLD = 70;
const STALE_COMPLAINT_DAYS = 7;
const UNINSPECTED_DAYS = 90;
const CHART_WEEKS = 10;
const SETTLED_STATUSES = ['CLOSED', 'DUPLICATE', 'REJECTED'];

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Complaint) private complaints: Repository<Complaint>,
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    @InjectRepository(Violation) private violationsRepo: Repository<Violation>,
    @InjectRepository(User) private users: Repository<User>,
    private risk: RiskService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  async getRiskWeights(): Promise<RiskWeightsDto> {
    const weights = await this.settings.getWeights();
    return { weights, updatedAt: null, updatedByLabel: 'admin@nablus.ps' };
  }

  async updateRiskWeights(
    weights: RiskWeightsDto['weights'],
    actorId: string,
  ): Promise<RiskWeightsDto> {
    const saved = await this.settings.updateWeights(weights, actorId);
    // Every establishment's cached snapshot was computed under the old
    // formula. Without this, the queue would keep showing yesterday's numbers
    // until something else happened to trigger a recalculation — an admin who
    // just adjusted the weights would have no way to see the effect.
    await this.risk.recalculateAll();
    return { weights: saved, updatedAt: new Date().toISOString(), updatedByLabel: actorId };
  }

  async listComplaints(filter: ComplaintFilter): Promise<AdminComplaintDto[]> {
    const where: Record<string, unknown> = {};
    if (filter.status) where['status'] = filter.status;
    if (filter.category) where['category'] = filter.category;
    if (filter.hasEvidence !== undefined) where['hasEvidence'] = filter.hasEvidence;
    if (filter.establishmentId) where['establishmentId'] = filter.establishmentId;

    const rows = await this.complaints.find({ where });
    const establishments = await this.establishments.find();
    const inspectors = await this.users.find({ where: { role: 'INSPECTOR' } });

    const nameById = new Map(establishments.map((e) => [e.id, e.nameAr]));
    const inspectorById = new Map(inspectors.map((u) => [u.id, u.displayNameAr]));
    const groups = this.groupDuplicates(rows);
    const now = Date.now();

    const dtos = rows.map((c) => ({
      id: c.id,
      reference: c.reference,
      establishmentId: c.establishmentId,
      establishmentNameAr: nameById.get(c.establishmentId) ?? '',
      category: c.category,
      description: c.description,
      hasEvidence: c.hasEvidence,
      photoIds: c.photoIds ? c.photoIds.split(',') : [],
      contactPhone: c.contactPhoneEncrypted ? decryptContact(c.contactPhoneEncrypted) : null,
      ageDays: Math.floor((now - c.createdAt.getTime()) / 86_400_000),
      status: c.status,
      assignedInspectorId: c.assignedInspectorId,
      assignedInspectorNameAr: c.assignedInspectorId
        ? (inspectorById.get(c.assignedInspectorId) ?? null)
        : null,
      rejectionReason: c.rejectionReason,
      duplicateOfId: c.duplicateOfId,
      duplicateGroupId: groups.get(c.id)!.groupId,
      duplicateGroupSize: groups.get(c.id)!.size,
      createdAt: c.createdAt.toISOString(),
    }));

    // Spec §5.9: age descending, with photo-backed complaints pinned above
    // photo-less ones of the same age. "Same age" means the same day — a
    // two-hour gap is not a meaningful ordering signal to a triage clerk, and
    // treating it as one would bury evidence under noise.
    return dtos.sort((a, b) => {
      if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays;
      if (a.hasEvidence !== b.hasEvidence) return a.hasEvidence ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  /**
   * Spec §5.9: same establishment, same category, within 72 hours. Grouped
   * visually here; the shared risk engine counts the same cluster once.
   */
  private groupDuplicates(rows: Complaint[]): Map<string, { groupId: string; size: number }> {
    const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const assignment = new Map<string, string>();
    const anchors: Complaint[] = [];

    for (const row of ordered) {
      const anchor = anchors.find(
        (a) =>
          a.establishmentId === row.establishmentId &&
          a.category === row.category &&
          row.createdAt.getTime() - a.createdAt.getTime() <= DUPLICATE_WINDOW_MS,
      );
      if (anchor) {
        assignment.set(row.id, assignment.get(anchor.id)!);
      } else {
        anchors.push(row);
        assignment.set(row.id, row.id);
      }
    }

    const sizes = new Map<string, number>();
    for (const groupId of assignment.values()) {
      sizes.set(groupId, (sizes.get(groupId) ?? 0) + 1);
    }

    return new Map(
      [...assignment].map(([id, groupId]) => [id, { groupId, size: sizes.get(groupId)! }]),
    );
  }

  async assign(complaintId: string, inspectorId: string, actorId: string): Promise<void> {
    const complaint = await this.require(complaintId);
    const inspector = await this.users.findOne({ where: { id: inspectorId, role: 'INSPECTOR' } });
    if (!inspector) throw new BadRequestException('المفتش غير معروف.');

    await this.transition(complaint, actorId, AUDIT_ACTIONS.COMPLAINT_ASSIGNED, {
      status: 'ASSIGNED',
      assignedInspectorId: inspectorId,
    });
  }

  async markDuplicate(complaintId: string, originalId: string, actorId: string): Promise<void> {
    if (complaintId === originalId) {
      throw new BadRequestException('لا يمكن اعتبار الشكوى مكرّرة عن نفسها.');
    }
    const complaint = await this.require(complaintId);
    await this.require(originalId);

    await this.transition(complaint, actorId, AUDIT_ACTIONS.COMPLAINT_MARKED_DUPLICATE, {
      status: 'DUPLICATE',
      duplicateOfId: originalId,
    });
  }

  async reject(complaintId: string, reason: RejectionReason, actorId: string): Promise<void> {
    if (!REJECTION_REASONS.includes(reason)) {
      throw new BadRequestException('سبب الرفض غير معروف.');
    }
    const complaint = await this.require(complaintId);

    await this.transition(complaint, actorId, AUDIT_ACTIONS.COMPLAINT_REJECTED, {
      status: 'REJECTED',
      rejectionReason: reason,
    });
  }

  async close(complaintId: string, actorId: string): Promise<void> {
    const complaint = await this.require(complaintId);
    await this.transition(complaint, actorId, AUDIT_ACTIONS.COMPLAINT_CLOSED, {
      status: 'CLOSED',
    });
  }

  private async require(complaintId: string): Promise<Complaint> {
    const complaint = await this.complaints.findOne({ where: { id: complaintId } });
    if (!complaint) throw new NotFoundException('الشكوى غير موجودة.');
    return complaint;
  }

  /**
   * One path for every status change, so every one of them is audited and
   * every one refreshes the risk score. A rejected or duplicated complaint
   * must stop counting — otherwise rejecting spam still rewards the spammer.
   */
  private async transition(
    complaint: Complaint,
    actorId: string,
    action: string,
    patch: Partial<Complaint>,
  ): Promise<void> {
    const before = {
      status: complaint.status,
      assignedInspectorId: complaint.assignedInspectorId,
      duplicateOfId: complaint.duplicateOfId,
      rejectionReason: complaint.rejectionReason,
    };

    await this.complaints.update(complaint.id, { ...patch, updatedAt: new Date() });

    await this.audit.record({
      actorId,
      action,
      entityType: 'complaint',
      entityId: complaint.id,
      before,
      after: patch,
    });

    await this.risk.recalculate(complaint.establishmentId, 'COMPLAINT');
  }

  async planning(): Promise<PlanningRowDto[]> {
    const establishments = await this.establishments.find({ where: { status: 'ACTIVE' } });
    const snapshots = await this.risk.latestSnapshots(establishments.map((e) => e.id));

    return establishments
      .map((e) => {
        const snapshot = snapshots.get(e.id);
        return {
          establishmentId: e.id,
          slug: e.slug,
          nameAr: e.nameAr,
          category: e.category,
          currentGrade: e.currentGrade,
          lastInspectionAt: e.lastInspectionAt?.toISOString() ?? null,
          risk: snapshot?.total ?? e.currentRiskScore,
          factors: snapshot ? JSON.parse(snapshot.factorsJson) : [],
        };
      })
      .sort((a, b) => b.risk - a.risk);
  }

  async inspectors(): Promise<InspectorOptionDto[]> {
    const rows = await this.users.find({ where: { role: 'INSPECTOR' } });
    return rows.map((u) => ({ id: u.id, displayNameAr: u.displayNameAr }));
  }

  /** Spec §5.8: numbers first, then "what is falling through the cracks" —
   *  the needs-attention block is the one an admin actually opens the
   *  dashboard for daily, so every figure here is a real query, not a mock. */
  async dashboard(): Promise<DashboardDto> {
    const establishments = await this.establishments.find({ where: { status: 'ACTIVE' } });
    const complaints = await this.complaints.find();
    const violations = await this.violationsRepo.find();
    const now = Date.now();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const gradeCounts: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const e of establishments) {
      if (e.currentGrade) gradeCounts[e.currentGrade as 'A' | 'B' | 'C' | 'D']++;
    }

    const weeks: { weekStart: string; count: number }[] = [];
    for (let i = CHART_WEEKS - 1; i >= 0; i--) {
      const end = now - i * 7 * 86_400_000;
      const start = end - 7 * 86_400_000;
      const count = complaints.filter(
        (c) => c.createdAt.getTime() >= start && c.createdAt.getTime() < end,
      ).length;
      weeks.push({ weekStart: new Date(start).toISOString().slice(0, 10), count });
    }

    const closed = complaints.filter((c) => SETTLED_STATUSES.includes(c.status));
    const closeDurations = closed.map(
      (c) => (c.updatedAt.getTime() - c.createdAt.getTime()) / 86_400_000,
    );
    const avgCloseDays =
      closeDurations.length === 0
        ? null
        : Math.round((closeDurations.reduce((a, b) => a + b, 0) / closeDurations.length) * 10) / 10;

    return {
      kpis: {
        registeredCount: establishments.length,
        highRiskCount: establishments.filter((e) => e.currentRiskScore >= HIGH_RISK_THRESHOLD)
          .length,
        complaintsThisMonth: complaints.filter(
          (c) => c.createdAt.getTime() >= monthStart.getTime(),
        ).length,
        avgCloseDays,
      },
      gradeDistribution: (['A', 'B', 'C', 'D'] as const).map((grade) => ({
        grade,
        count: gradeCounts[grade],
      })),
      complaintsOverTime: weeks,
      needsAttention: {
        staleComplaints: complaints.filter(
          (c) =>
            !SETTLED_STATUSES.includes(c.status) &&
            now - c.createdAt.getTime() > STALE_COMPLAINT_DAYS * 86_400_000,
        ).length,
        overdueViolations: violations.filter(
          (v) =>
            v.status !== 'VERIFIED' &&
            v.status !== 'CLOSED' &&
            v.deadlineAt !== null &&
            v.deadlineAt.getTime() < now,
        ).length,
        uninspectedEstablishments: establishments.filter(
          (e) =>
            !e.lastInspectionAt || now - e.lastInspectionAt.getTime() > UNINSPECTED_DAYS * 86_400_000,
        ).length,
      },
    };
  }
}
