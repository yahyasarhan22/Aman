import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import {
  arabicCount,
  calculateScore,
  DAY_FORMS,
  DEADLINE_DAYS,
  deadlineFor,
  missingCriticalPhotos,
  renderRecommendation,
  OPEN_VIOLATION_FORMS,
  scoreToGrade,
  type ChecklistItemDef,
} from '@aman/shared';
import { Establishment } from '../establishments/establishment.entity';
import { Inspection } from '../establishments/inspection.entity';
import { InspectionItem } from '../establishments/inspection-item.entity';
import { Violation } from '../establishments/violation.entity';
import { ChecklistVersion } from '../checklist/checklist-version.entity';
import { ChecklistItem } from '../checklist/checklist-item.entity';
import type {
  EstablishmentBundleDto,
  QueueEntryDto,
  SubmitInspectionDto,
  SubmitInspectionResultDto,
} from './inspector.dto';

const CATEGORY_AR: Record<string, string> = {
  BUTCHER: 'ملحمة',
  RESTAURANT: 'مطعم',
  BAKERY: 'مخبز',
  CAFE: 'مقهى',
  RETAIL: 'بيع مواد معلّبة',
};

const NEVER_INSPECTED_DAYS = 365;

function daysSince(date: Date | null): number {
  if (!date) return NEVER_INSPECTED_DAYS;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

@Injectable()
export class InspectorService {
  constructor(
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    @InjectRepository(Inspection) private inspections: Repository<Inspection>,
    @InjectRepository(Violation) private violations: Repository<Violation>,
    @InjectRepository(ChecklistVersion) private versions: Repository<ChecklistVersion>,
    @InjectRepository(ChecklistItem) private checklistItems: Repository<ChecklistItem>,
    private dataSource: DataSource,
  ) {}

  async getQueue(): Promise<QueueEntryDto[]> {
    const establishments = await this.establishments.find({ where: { status: 'ACTIVE' } });
    const open = await this.violations.find({
      where: { status: In(['OPEN', 'OWNER_RESPONDED', 'OVERDUE']) },
    });

    const openByEstablishment = new Map<string, number>();
    for (const v of open) {
      openByEstablishment.set(v.establishmentId, (openByEstablishment.get(v.establishmentId) ?? 0) + 1);
    }

    return establishments
      .map((e) => {
        const days = daysSince(e.lastInspectionAt);
        const openCount = openByEstablishment.get(e.id) ?? 0;

        // ponytail: Week 2 ranks on time-since-inspection plus open violations.
        // The weighted §6.2 Risk Score (prior violations, complaint pressure,
        // category risk) lands in Week 3 and replaces this function only —
        // the DTO and the queue UI already speak in risk + reasons.
        const risk = Math.min(100, Math.round((days / 180) * 100) + openCount * 10);

        const reasons: string[] = [];
        reasons.push(
          e.lastInspectionAt
            ? `آخر تفتيش قبل ${arabicCount(days, DAY_FORMS)}`
            : 'لم يسبق تفتيش هذه المنشأة',
        );
        if (openCount > 0) reasons.push(arabicCount(openCount, OPEN_VIOLATION_FORMS));
        reasons.push(`التصنيف: ${CATEGORY_AR[e.category] ?? e.category}`);

        return {
          establishmentId: e.id,
          slug: e.slug,
          nameAr: e.nameAr,
          category: e.category,
          address: e.address,
          currentGrade: e.currentGrade,
          risk,
          reasons,
        };
      })
      .sort((a, b) => b.risk - a.risk);
  }

  async getBundle(establishmentId: string): Promise<EstablishmentBundleDto> {
    const establishment = await this.establishments.findOne({ where: { id: establishmentId } });
    if (!establishment) throw new NotFoundException('المنشأة غير موجودة.');

    const { version, items } = await this.activeChecklist();

    const openViolations = await this.violations.find({
      where: { establishmentId, status: Not(In(['CLOSED', 'VERIFIED'])) },
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

    return this.dataSource.transaction(async (manager) => {
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

      return {
        inspectionId: inspection.id,
        score,
        grade,
        previousGrade,
        violationCount: failures.length,
        duplicate: false,
      };
    });
  }
}
