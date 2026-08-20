import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { calculateRisk, type EstablishmentCategory, type RiskBreakdown } from '@aman/shared';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { Complaint } from '../complaints/complaint.entity';
import { RiskSnapshot, type RiskTrigger } from './risk-snapshot.entity';

/**
 * Statuses representing a complaint the municipality still treats as real.
 * REJECTED and DUPLICATE are excluded on purpose: if a rejected complaint kept
 * pushing an establishment up the queue, rejecting spam would still reward the
 * spammer, and duplicates are counted once by the shared engine anyway (§6.2).
 */
const LIVE_COMPLAINT_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'INSPECTED', 'CLOSED'];

@Injectable()
export class RiskService {
  constructor(
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    @InjectRepository(Violation) private violations: Repository<Violation>,
    @InjectRepository(Complaint) private complaints: Repository<Complaint>,
    @InjectRepository(RiskSnapshot) private snapshots: Repository<RiskSnapshot>,
  ) {}

  async recalculate(establishmentId: string, trigger: RiskTrigger): Promise<RiskBreakdown> {
    const establishment = await this.establishments.findOne({ where: { id: establishmentId } });
    if (!establishment) throw new NotFoundException('المنشأة غير موجودة.');

    const violations = await this.violations.find({ where: { establishmentId } });
    const complaints = await this.complaints.find({
      where: { establishmentId, status: In(LIVE_COMPLAINT_STATUSES) },
    });

    const breakdown = calculateRisk({
      category: establishment.category as EstablishmentCategory,
      lastInspectionAt: establishment.lastInspectionAt,
      violations: violations.map((v) => ({
        severity: v.severity,
        // Rows written before occurredAt existed fall back to the deadline —
        // imprecise, but the alternative is dropping real history entirely.
        occurredAt: v.occurredAt ?? v.deadlineAt ?? new Date(),
      })),
      complaints: complaints.map((c) => ({
        category: c.category,
        documented: c.hasEvidence,
        submittedAt: c.createdAt,
      })),
    });

    await this.snapshots.save({
      establishmentId,
      total: breakdown.total,
      factorsJson: JSON.stringify(breakdown.factors),
      trigger,
      calculatedAt: new Date(),
    });

    await this.establishments.update(establishmentId, { currentRiskScore: breakdown.total });

    return breakdown;
  }

  /**
   * Spec §6.2 asks for a nightly pass. A prototype does not need a scheduler:
   * recalculation already fires on every triggering event, and this backs an
   * admin "refresh rankings" button.
   * ponytail: wire to cron only if a real pilot needs it.
   */
  async recalculateAll(): Promise<number> {
    const all = await this.establishments.find({ where: { status: 'ACTIVE' } });
    for (const establishment of all) {
      await this.recalculate(establishment.id, 'MANUAL');
    }
    return all.length;
  }

  async latestSnapshot(establishmentId: string): Promise<RiskSnapshot | null> {
    return this.snapshots.findOne({
      where: { establishmentId },
      order: { calculatedAt: 'DESC' },
    });
  }

  /** One query for a whole list — the queue and the planning table both need
   *  every establishment's derivation at once. */
  async latestSnapshots(establishmentIds: string[]): Promise<Map<string, RiskSnapshot>> {
    if (establishmentIds.length === 0) return new Map();

    const rows = await this.snapshots.find({
      where: { establishmentId: In(establishmentIds) },
      order: { calculatedAt: 'DESC' },
    });

    const latest = new Map<string, RiskSnapshot>();
    for (const row of rows) {
      if (!latest.has(row.establishmentId)) latest.set(row.establishmentId, row);
    }
    return latest;
  }
}
