import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import {
  calculateScore,
  DEADLINE_DAYS,
  deadlineFor,
  missingCriticalPhotos,
  renderRecommendation,
  scoreToGrade,
  type ChecklistItemDef,
} from '@aman/shared';
import { Establishment } from '../establishments/establishment.entity';
import { Inspection } from '../establishments/inspection.entity';
import { InspectionItem } from '../establishments/inspection-item.entity';
import { Violation } from '../establishments/violation.entity';
import { ChecklistVersion } from '../checklist/checklist-version.entity';
import { ChecklistItem } from '../checklist/checklist-item.entity';
import { Complaint } from '../complaints/complaint.entity';
import { RiskService } from '../risk/risk.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-log.entity';
import type {
  CompletedTodayEntryDto,
  EstablishmentBundleDto,
  InspectionDetailDto,
  QueueEntryDto,
  RiskFactorDto,
  SubmitInspectionDto,
  SubmitInspectionResultDto,
} from './inspector.dto';

@Injectable()
export class InspectorService {
  constructor(
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    @InjectRepository(Inspection) private inspections: Repository<Inspection>,
    @InjectRepository(InspectionItem) private inspectionItems: Repository<InspectionItem>,
    @InjectRepository(Violation) private violations: Repository<Violation>,
    @InjectRepository(ChecklistVersion) private versions: Repository<ChecklistVersion>,
    @InjectRepository(ChecklistItem) private checklistItems: Repository<ChecklistItem>,
    @InjectRepository(Complaint) private complaints: Repository<Complaint>,
    private dataSource: DataSource,
    private risk: RiskService,
    private audit: AuditService,
  ) {}

  private startOfToday(): Date {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }

  /** Inspections this inspector already submitted today — spec follow-up:
   *  once visited, a place drops off today's queue and shows here instead. */
  async getCompletedToday(inspectorId: string): Promise<CompletedTodayEntryDto[]> {
    const rows = await this.inspections.find({
      where: { inspectorId, submittedAt: MoreThanOrEqual(this.startOfToday()) },
      relations: { establishment: true },
      order: { submittedAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      establishmentId: r.establishmentId,
      nameAr: r.establishment.nameAr,
      grade: r.grade,
      previousGrade: r.previousGrade,
      submittedAt: r.submittedAt.toISOString(),
    }));
  }

  /** An inspector reviewing the sheet they just submitted — read-only, and
   *  scoped to their own inspections so one inspector can't browse another's. */
  async getInspectionDetail(inspectionId: string, inspectorId: string): Promise<InspectionDetailDto> {
    const inspection = await this.inspections.findOne({
      where: { id: inspectionId },
      relations: { establishment: true },
    });
    if (!inspection) throw new NotFoundException('التفتيش غير موجود.');
    if (inspection.inspectorId !== inspectorId) {
      throw new ForbiddenException('لا يمكنك الاطلاع على تفتيش مفتّش آخر.');
    }

    const [items, violations, definitions] = await Promise.all([
      this.inspectionItems.find({ where: { inspectionId } }),
      this.violations.find({ where: { inspectionId } }),
      this.checklistItems.find({
        where: { checklistVersionId: inspection.checklistVersionId ?? '' },
      }),
    ]);
    const byId = new Map(definitions.map((d) => [d.id, d]));

    return {
      id: inspection.id,
      establishmentId: inspection.establishmentId,
      establishmentNameAr: inspection.establishment.nameAr,
      establishmentSlug: inspection.establishment.slug,
      score: inspection.score,
      grade: inspection.grade,
      previousGrade: inspection.previousGrade,
      submittedAt: inspection.submittedAt.toISOString(),
      inspectorSignature: inspection.inspectorSignature,
      items: [...items]
        .sort((a, b) => (byId.get(a.checklistItemId)?.sortOrder ?? 0) - (byId.get(b.checklistItemId)?.sortOrder ?? 0))
        .map((i) => {
          const def = byId.get(i.checklistItemId);
          return {
            checklistItemId: i.checklistItemId,
            code: def?.code ?? '',
            labelAr: def ? renderRecommendation(def.labelAr, { threshold: def.threshold }) : i.checklistItemId,
            sectionNameAr: def?.sectionNameAr ?? '',
            severity: def?.severity ?? '',
            unit: def?.unit ?? null,
            result: i.result,
            measuredValue: i.measuredValue,
            note: i.note,
            photoIds: i.photoIds ? i.photoIds.split(',') : [],
          };
        }),
      violations: violations.map((v) => ({
        id: v.id,
        category: v.category,
        severity: v.severity,
        recommendation: v.recommendation,
        status: v.status,
        deadlineAt: v.deadlineAt?.toISOString() ?? null,
      })),
    };
  }

  async getQueue(inspectorId: string): Promise<QueueEntryDto[]> {
    const establishments = await this.establishments.find({ where: { status: 'ACTIVE' } });
    const doneToday = new Set(
      (
        await this.inspections.find({
          where: { inspectorId, submittedAt: MoreThanOrEqual(this.startOfToday()) },
          select: { establishmentId: true },
        })
      ).map((r) => r.establishmentId),
    );
    const snapshots = await this.risk.latestSnapshots(establishments.map((e) => e.id));

    const entries: QueueEntryDto[] = [];
    for (const e of establishments) {
      if (doneToday.has(e.id)) continue;
      // No snapshot means nothing has happened to this establishment since it
      // was registered. Compute one now rather than ranking it at zero and
      // hiding a never-inspected place at the bottom of the queue.
      const snapshot = snapshots.get(e.id);
      const breakdown = snapshot
        ? { total: snapshot.total, factors: JSON.parse(snapshot.factorsJson) as RiskFactorDto[] }
        : await this.risk.recalculate(e.id, 'MANUAL');

      entries.push({
        establishmentId: e.id,
        slug: e.slug,
        nameAr: e.nameAr,
        category: e.category,
        address: e.address,
        currentGrade: e.currentGrade,
        risk: breakdown.total,
        // Spec §5.4: two or three reasons, strongest first. An inspector reads
        // a couple of lines standing in a doorway, not a four-row table.
        reasons: [...breakdown.factors]
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3)
          .map((f) => f.detailAr),
        factors: breakdown.factors,
      });
    }

    return entries.sort((a, b) => b.risk - a.risk);
  }

  async getBundle(establishmentId: string): Promise<EstablishmentBundleDto> {
    const establishment = await this.establishments.findOne({ where: { id: establishmentId } });
    if (!establishment) throw new NotFoundException('المنشأة غير موجودة.');

    const { version, items } = await this.activeChecklist();

    const openViolations = await this.violations.find({
      where: { establishmentId, status: Not(In(['CLOSED', 'VERIFIED'])) },
    });

    // Rejected and duplicate complaints carry no signal for a visit — everything
    // else is a citizen report this inspector should go verify in person.
    const complaints = await this.complaints.find({
      where: { establishmentId, status: Not(In(['REJECTED', 'DUPLICATE'])) },
      order: { createdAt: 'DESC' },
    });

    return {
      establishment: {
        id: establishment.id,
        slug: establishment.slug,
        nameAr: establishment.nameAr,
        category: establishment.category,
        address: establishment.address,
        currentGrade: establishment.currentGrade,
        currentScore: establishment.currentScore,
        lastInspectionAt: establishment.lastInspectionAt?.toISOString() ?? null,
      },
      checklistVersionId: version.id,
      checklistVersion: version.version,
      items,
      openViolations: openViolations.map((v) => ({
        id: v.id,
        category: v.category,
        severity: v.severity,
        deadlineAt: v.deadlineAt?.toISOString() ?? null,
        status: v.status,
      })),
      // No contact info here (§11) — that stays admin-only, same as the
      // owner-facing view.
      complaints: complaints.map((c) => ({
        reference: c.reference,
        category: c.category,
        description: c.description,
        hasEvidence: c.hasEvidence,
        photoIds: c.photoIds ? c.photoIds.split(',') : [],
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  private async activeChecklist(): Promise<{ version: ChecklistVersion; items: ChecklistItemDef[] }> {
    const version = await this.versions.findOne({ where: { isActive: true } });
    if (!version) throw new NotFoundException('لا توجد نسخة قائمة تفتيش فعّالة.');

    const rows = await this.checklistItems.find({
      where: { checklistVersionId: version.id },
      order: { sortOrder: 'ASC' },
    });

    const items = rows.map((r) => ({
      id: r.id,
      section: r.section,
      sectionNameAr: r.sectionNameAr,
      code: r.code,
      // Labels carry {threshold} so a wording change and a threshold change are
      // one edit, not two — same substitution the recommendations use.
      labelAr: renderRecommendation(r.labelAr, { threshold: r.threshold }),
      severity: r.severity,
      requiresMeasurement: r.requiresMeasurement,
      unit: r.unit,
      threshold: r.threshold,
      recommendationTemplate: r.recommendationTemplate,
      sortOrder: r.sortOrder,
    }));

    return { version, items };
  }

  /**
   * The single place in the system that writes a grade (spec §3.1, §6.3, §11).
   * No admin path, no complaint path, no owner path may set
   * `establishment.currentGrade` — `inspector.service.spec.ts` covers it.
   */
  async submitInspection(
    dto: SubmitInspectionDto,
    inspectorId: string,
  ): Promise<SubmitInspectionResultDto> {
    if (!dto?.clientId) throw new BadRequestException('معرّف التفتيش مطلوب.');

    const existing = await this.inspections.findOne({ where: { clientId: dto.clientId } });
    if (existing) {
      const count = await this.violations.count({ where: { inspectionId: existing.id } });
      return {
        inspectionId: existing.id,
        score: existing.score,
        grade: existing.grade,
        previousGrade: existing.previousGrade,
        violationCount: count,
        duplicate: true,
      };
    }

    const establishment = await this.establishments.findOne({
      where: { id: dto.establishmentId },
    });
    if (!establishment) throw new NotFoundException('المنشأة غير موجودة.');

    const definitions = await this.checklistItems.find({
      where: { checklistVersionId: dto.checklistVersionId },
    });
    if (definitions.length === 0) {
      throw new BadRequestException('نسخة قائمة التفتيش غير معروفة.');
    }
    const byId = new Map(definitions.map((d) => [d.id, d]));

    const answers = dto.answers ?? [];
    const unknown = answers.filter((a) => !byId.has(a.checklistItemId));
    if (unknown.length > 0) {
      throw new BadRequestException('التفتيش يحتوي بنوداً لا تنتمي إلى نسخة القائمة المرسلة.');
    }
    if (answers.length !== definitions.length) {
      throw new BadRequestException('يجب الإجابة على جميع بنود القائمة قبل الإرسال.');
    }

    // Re-run the client-side rule server-side: a critical failure without a
    // photo has no evidence trail, and the client is the side that can be
    // worked around.
    const missing = missingCriticalPhotos(
      answers,
      definitions.map((d) => ({ id: d.id, severity: d.severity })),
    );
    if (missing.length > 0) {
      throw new BadRequestException('كل مخالفة حرجة تتطلب صورة مرفقة.');
    }

    const score = calculateScore(
      answers.map((a) => ({ severity: byId.get(a.checklistItemId)!.severity, result: a.result })),
    );
    if (score === null) {
      throw new BadRequestException('لا يمكن احتساب نتيجة: جميع البنود غير منطبقة.');
    }
    const grade = scoreToGrade(score);
    const previousGrade = establishment.currentGrade;
    const submittedAt = new Date();

    const result = await this.dataSource.transaction(async (manager) => {
      const inspection = await manager.save(Inspection, {
        clientId: dto.clientId,
        establishmentId: establishment.id,
        inspectorId,
        checklistVersionId: dto.checklistVersionId,
        type: 'ROUTINE',
        score,
        grade,
        previousGrade,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : submittedAt,
        submittedAt,
        inspectorSignature: dto.inspectorSignature ?? null,
        isOfflineSubmission: dto.isOfflineSubmission ?? false,
      });

      await manager.save(
        InspectionItem,
        answers.map((a) => ({
          inspectionId: inspection.id,
          checklistItemId: a.checklistItemId,
          result: a.result,
          measuredValue: a.measuredValue ?? null,
          note: a.note ?? null,
          photoIds: a.photoIds?.length ? a.photoIds.join(',') : null,
        })),
      );

      const failures = answers.filter((a) => a.result === 'FAIL');
      for (const failure of failures) {
        const def = byId.get(failure.checklistItemId)!;
        await manager.save(Violation, {
          inspectionId: inspection.id,
          establishmentId: establishment.id,
          checklistItemId: def.id,
          category: renderRecommendation(def.labelAr, { threshold: def.threshold }),
          severity: def.severity,
          measuredValue: failure.measuredValue ?? null,
          recommendation:
            dto.recommendations?.[def.id]?.trim() ||
            renderRecommendation(def.recommendationTemplate, {
              measured: failure.measuredValue,
              threshold: def.threshold,
              deadline: DEADLINE_DAYS[def.severity],
            }),
          occurredAt: submittedAt,
          deadlineAt: deadlineFor(def.severity, submittedAt),
          photoIds: failure.photoIds?.length ? failure.photoIds.join(',') : null,
          status: 'OPEN',
        });
      }

      await manager.update(Establishment, establishment.id, {
        currentGrade: grade,
        currentScore: score,
        lastInspectionAt: submittedAt,
      });

      // A visit answers every complaint that was waiting on it — not just the
      // one(s) that ranked this establishment to the top of the queue.
      await manager.update(
        Complaint,
        { establishmentId: establishment.id, status: 'ASSIGNED' },
        { status: 'INSPECTED', inspectionId: inspection.id, updatedAt: submittedAt },
      );

      return {
        inspectionId: inspection.id,
        score,
        grade,
        previousGrade,
        violationCount: failures.length,
        duplicate: false,
      };
    });

    // A completed inspection resets time-since-inspection and may add new
    // violations, so the ranking is stale the moment it commits (§6.2).
    await this.risk.recalculate(establishment.id, 'INSPECTION');

    return result;
  }

  /**
   * Spec §6.4: verifying a fix closes the violation but does NOT raise the
   * grade. Grades must always trace back to an inspection event, so the score
   * changes at the next visit and not a moment earlier. This method writes to
   * the violation only — there is no establishment update in it, and a test
   * asserts there never is.
   */
  async verifyViolation(violationId: string, inspectorId: string): Promise<{ ok: true }> {
    const violation = await this.violations.findOne({ where: { id: violationId } });
    if (!violation) throw new NotFoundException('المخالفة غير موجودة.');

    await this.violations.update(violationId, {
      status: 'VERIFIED',
      verifiedById: inspectorId,
      verifiedAt: new Date(),
    });

    await this.audit.record({
      actorId: inspectorId,
      action: AUDIT_ACTIONS.VIOLATION_VERIFIED,
      entityType: 'violation',
      entityId: violationId,
      before: { status: violation.status },
      after: { status: 'VERIFIED' },
    });

    // A closed violation stops feeding prior-violations pressure, so the queue
    // reorders — but the grade is untouched.
    await this.risk.recalculate(violation.establishmentId, 'VERIFICATION');

    return { ok: true };
  }
}
