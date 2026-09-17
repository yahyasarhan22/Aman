import type { ItemResult, Severity } from './grading';
import { DAY_FORMS, arabicCount, isolateLtr } from './arabic';

/** A checklist item as stored in `checklist_items` and shipped to the offline app. */
export interface ChecklistItemDef {
  id: string;
  /** 1-5, groups items into the five sections of spec §5.5. */
  section: number;
  sectionNameAr: string;
  /** Human code shown in the UI, e.g. "2.1". */
  code: string;
  labelAr: string;
  severity: Severity;
  /** True for items where the inspector records a reading (temperatures). */
  requiresMeasurement: boolean;
  unit: string | null;
  /** Threshold substituted into the recommendation template. */
  threshold: string | null;
  recommendationTemplate: string;
  sortOrder: number;
}

/** One answer to one checklist item. */
export interface InspectionAnswer {
  checklistItemId: string;
  result: ItemResult;
  measuredValue?: string | null;
  note?: string | null;
  photoIds?: string[];
}

/** Spec §5.6: critical 48h, major 14 days, minor 30 days. */
export const DEADLINE_DAYS: Record<Severity, number> = {
  CRITICAL: 2,
  MAJOR: 14,
  MINOR: 30,
};

export function deadlineFor(severity: Severity, from: Date): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + DEADLINE_DAYS[severity]);
  return due;
}

/**
 * Spec §6.5: template substitution, deliberately not AI — deterministic,
 * reviewable, and incapable of inventing a regulatory instruction.
 * Unknown placeholders are left in place rather than silently blanked, so a
 * broken template is visible to the inspector who has to approve the text.
 */
export function renderRecommendation(
  template: string,
  vars: { measured?: string | null; threshold?: string | null; deadline?: number | null },
): string {
  return template.replace(/\{(measured|threshold|deadline)\}/g, (match, key: string) => {
    const value = vars[key as keyof typeof vars];
    if (value === undefined || value === null || value === '') return match;
    // A deadline is a count, and Arabic counts inflect the noun — the templates
    // say "خلال {deadline}", not "خلال {deadline} يوماً", so that "2" can
    // become "يومان" rather than the wrong "2 يوماً".
    if (key === 'deadline') return arabicCount(Number(value), DAY_FORMS);
    return isolateLtr(String(value));
  });
}

/**
 * Spec §5.5: a FAIL on a CRITICAL item must carry a photo. Enforced on the
 * client to block progress and again on the server, because the client is the
 * side an inspector could work around.
 */
export function missingCriticalPhotos(
  answers: InspectionAnswer[],
  items: Pick<ChecklistItemDef, 'id' | 'severity'>[],
): string[] {
  const severityById = new Map(items.map((i) => [i.id, i.severity]));
  return answers
    .filter(
      (a) =>
        a.result === 'FAIL' &&
        severityById.get(a.checklistItemId) === 'CRITICAL' &&
        (a.photoIds?.length ?? 0) === 0,
    )
    .map((a) => a.checklistItemId);
}
