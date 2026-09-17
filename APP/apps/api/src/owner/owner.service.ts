import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-log.entity';
import { uploadExists } from '../uploads/uploads.controller';
import type { OwnerOverviewDto, OwnerViolationDto, RespondDto } from './owner.dto';

const OPEN_STATUSES = ['OPEN', 'OWNER_RESPONDED', 'OVERDUE'];
const MAX_EVIDENCE = 4;

@Injectable()
export class OwnerService {
  constructor(
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    @InjectRepository(Violation) private violations: Repository<Violation>,
    private audit: AuditService,
  ) {}

  async overview(establishmentId: string): Promise<OwnerOverviewDto> {
    const establishment = await this.establishments.findOne({ where: { id: establishmentId } });
    if (!establishment) throw new NotFoundException('المنشأة غير موجودة.');

    const rows = await this.violations.find({ where: { establishmentId } });
    const now = Date.now();

    const toDto = (v: Violation): OwnerViolationDto => ({
      id: v.id,
      category: v.category,
      severity: v.severity,
      recommendation: v.recommendation,
      deadlineAt: v.deadlineAt?.toISOString() ?? null,
      status: v.status,
      ownerResponse: v.ownerResponse,
      respondedAt: v.respondedAt?.toISOString() ?? null,
      verifiedAt: v.verifiedAt?.toISOString() ?? null,
      overdue: v.status === 'OPEN' && v.deadlineAt !== null && v.deadlineAt.getTime() < now,
    });

    return {
      establishment: {
        nameAr: establishment.nameAr,
        slug: establishment.slug,
        currentGrade: establishment.currentGrade,
        currentScore: establishment.currentScore,
        lastInspectionAt: establishment.lastInspectionAt?.toISOString() ?? null,
      },
      // Nothing about who complained reaches this response (§3.1, §11) — the
      // owner sees violations, which are the municipality's findings, not
      // reports, which are somebody's.
      openViolations: rows.filter((v) => OPEN_STATUSES.includes(v.status)).map(toDto),
      resolvedViolations: rows
        .filter((v) => v.status === 'VERIFIED' || v.status === 'CLOSED')
        .map(toDto),
    };
  }

  /**
   * The owner's response appears on the public page immediately as "owner
   * responded" — but the grade does not change until an inspector verifies,
   * and even then only the next inspection re-scores (§5.7, §6.4). This method
   * writes to the violation and to nothing else.
   */
  async respond(violationId: string, dto: RespondDto, establishmentId: string): Promise<void> {
    const violation = await this.violations.findOne({ where: { id: violationId } });
    if (!violation) throw new NotFoundException('المخالفة غير موجودة.');
    // Scope from the token, never from a parameter (§11). Owner A must not be
    // able to reach establishment B by editing a URL.
    if (violation.establishmentId !== establishmentId) {
      throw new ForbiddenException('هذه المخالفة لا تخص منشأتك.');
    }

    const claimed = (dto.photoIds ?? []).slice(0, MAX_EVIDENCE);
    const photoIds: string[] = [];
    for (const id of claimed) {
      if (await uploadExists(id)) photoIds.push(id);
    }

    await this.violations.update(violationId, {
      status: 'OWNER_RESPONDED',
      ownerResponse: dto.note?.trim() || null,
      evidencePhotoIds: photoIds.length ? photoIds.join(',') : null,
      respondedAt: new Date(),
    });

    await this.audit.record({
      actorId: `owner:${establishmentId}`,
      action: AUDIT_ACTIONS.VIOLATION_OWNER_RESPONDED,
      entityType: 'violation',
      entityId: violationId,
      before: { status: violation.status },
      after: { status: 'OWNER_RESPONDED' },
    });
  }
}
