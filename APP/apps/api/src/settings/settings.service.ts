import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RISK_WEIGHTS, type RiskWeights } from '@aman/shared';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-log.entity';
import { RiskWeightsRow } from './risk-weights.entity';

const ROW_ID = 'current';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(RiskWeightsRow) private rows: Repository<RiskWeightsRow>,
    private audit: AuditService,
  ) {}

  async getWeights(): Promise<RiskWeights> {
    const row = await this.rows.findOne({ where: { id: ROW_ID } });
    if (!row) return RISK_WEIGHTS;
    return {
      PRIOR_VIOLATIONS: row.priorViolations,
      COMPLAINT_PRESSURE: row.complaintPressure,
      TIME_SINCE_INSPECTION: row.timeSinceInspection,
      CATEGORY: row.category,
    };
  }

  /** Spec §5.10: must sum to 100, and every change is logged with who and
   *  when. Silent tuning of the formula would destroy the system's
   *  credibility — the whole point of a stated formula is that it can be
   *  checked, including checking who last touched it. */
  async updateWeights(weights: RiskWeights, actorId: string): Promise<RiskWeights> {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.round(sum) !== 100) {
      throw new BadRequestException(`مجموع الأوزان يجب أن يساوي 100، والمجموع الحالي ${sum}.`);
    }

    const before = await this.getWeights();

    await this.rows.save({
      id: ROW_ID,
      priorViolations: weights.PRIOR_VIOLATIONS,
      complaintPressure: weights.COMPLAINT_PRESSURE,
      timeSinceInspection: weights.TIME_SINCE_INSPECTION,
      category: weights.CATEGORY,
      updatedAt: new Date(),
      updatedBy: actorId,
    });

    await this.audit.record({
      actorId,
      action: AUDIT_ACTIONS.RISK_WEIGHTS_CHANGED,
      entityType: 'risk_weights',
      entityId: ROW_ID,
      before,
      after: weights,
    });

    return weights;
  }
}
