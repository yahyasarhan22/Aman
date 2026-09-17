import { SEVERITY_POINTS, type Severity } from './grading';
import { DAY_FORMS, arabicCount, isolateLtr, type ArabicNounForms } from './arabic';

export type EstablishmentCategory = 'BUTCHER' | 'RESTAURANT' | 'BAKERY' | 'CAFE' | 'RETAIL';

export type RiskFactorKey =
  | 'PRIOR_VIOLATIONS'
  | 'COMPLAINT_PRESSURE'
  | 'TIME_SINCE_INSPECTION'
  | 'CATEGORY';

export type RiskWeights = Record<RiskFactorKey, number>;

/** Spec §6.2. Percentages, so the admin settings screen can validate sum = 100. */
export const RISK_WEIGHTS: RiskWeights = {
  PRIOR_VIOLATIONS: 40,
  COMPLAINT_PRESSURE: 30,
  TIME_SINCE_INSPECTION: 20,
  CATEGORY: 10,
};

export const CATEGORY_RISK: Record<EstablishmentCategory, number> = {
  BUTCHER: 100,
  RESTAURANT: 80,
  BAKERY: 60,
  CAFE: 40,
  RETAIL: 20,
};

const CATEGORY_AR: Record<EstablishmentCategory, string> = {
  BUTCHER: 'ملحمة',
  RESTAURANT: 'مطعم',
  BAKERY: 'مخبز',
  CAFE: 'مقهى',
  RETAIL: 'بيع مواد معلّبة',
};

/** Noun forms used only inside risk explanations, kept here so this module
 *  does not reach into the UI-facing table in arabic.ts. */
const VIOLATION_FORMS: ArabicNounForms = {
  none: 'بلا مخالفات',
  one: 'مخالفة واحدة',
  two: 'مخالفتان',
  few: 'مخالفات',
  many: 'مخالفة',
};

const COMPLAINT_FORMS: ArabicNounForms = {
  none: 'بلا شكاوى',
  one: 'شكوى واحدة',
  two: 'شكويان',
  few: 'شكاوى',
  many: 'شكوى',
};

/**
 * Days per month for the decay curve. A fixed 30 keeps the arithmetic
 * something an inspector can reproduce on paper, which is the whole point of
 * choosing a transparent formula over a model (§1.3).
 */
const DAYS_PER_MONTH = 30;
const VIOLATION_WINDOW_MONTHS = 12;
const COMPLAINT_WINDOW_DAYS = 90;
const DUPLICATE_WINDOW_HOURS = 72;
const NEVER_INSPECTED_DAYS = 365;
const INSPECTION_SATURATION_DAYS = 180;

/** Scale factors from §6.2 — they map raw sums onto the 0-100 band. */
const PRIOR_VIOLATION_SCALE = 4;
const COMPLAINT_SCALE = 8;
const DOCUMENTED_COMPLAINT_WEIGHT = 3;
const UNDOCUMENTED_COMPLAINT_WEIGHT = 1;

export interface RiskViolationInput {
  severity: Severity;
  /** When the violation was recorded — the inspection's submission date. */
  occurredAt: Date;
}

export interface RiskComplaintInput {
  /** Complaint category, used for duplicate grouping. */
  category: string;
  /** True when a photo or receipt is attached (§6.2). */
  documented: boolean;
  submittedAt: Date;
}

export interface RiskInput {
  category: EstablishmentCategory;
  lastInspectionAt: Date | null;
  violations: RiskViolationInput[];
  complaints: RiskComplaintInput[];
  /** Injectable for deterministic tests. Defaults to now. */
  now?: Date;
}

export interface RiskFactor {
  key: RiskFactorKey;
  /** 0-100, rounded — this is the number shown to a human. */
  normalized: number;
  /** Percentage weight, 0-100. */
  weight: number;
  /** normalized × weight / 100, unrounded. */
  contribution: number;
  labelAr: string;
  /** The "why" line shown under a queue entry (§5.4). */
  detailAr: string;
}

export interface RiskBreakdown {
  /** 0-100, rounded. */
  total: number;
  factors: RiskFactor[];
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const daysBetween = (later: Date, earlier: Date) =>
  Math.max(0, (later.getTime() - earlier.getTime()) / 86_400_000);

/**
 * Spec §6.2. Returns the total together with every factor's contribution,
 * because the queue must be able to say why an establishment ranks where it
 * does, and a number without its derivation has no place in a regulatory
 * system.
 *
 * Note: §6.2's worked example table states PriorViolations = 66 and a total of
 * 51 for الفرن الذهبي. Its own formula, implemented here, gives 45 and 42. The
 * formula is normative and is what an inspector would be asked to justify, so
 * it wins. See risk.test.ts.
 */
export function calculateRisk(input: RiskInput, weights: RiskWeights = RISK_WEIGHTS): RiskBreakdown {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.round(sum) !== 100) {
    throw new Error(`Risk weights must sum to 100, received ${sum}`);
  }

  const now = input.now ?? new Date();

  const factors: RiskFactor[] = [
    priorViolations(input, now, weights.PRIOR_VIOLATIONS),
    complaintPressure(input, now, weights.COMPLAINT_PRESSURE),
    timeSinceInspection(input, now, weights.TIME_SINCE_INSPECTION),
    categoryRisk(input, weights.CATEGORY),
  ];

  const total = Math.round(factors.reduce((acc, f) => acc + f.contribution, 0));
  return { total: clamp100(total), factors };
}

function makeFactor(
  key: RiskFactorKey,
  normalized: number,
  weight: number,
  labelAr: string,
  detailAr: string,
): RiskFactor {
  const rounded = Math.round(clamp100(normalized));
  return {
    key,
    normalized: rounded,
    weight,
    contribution: (rounded * weight) / 100,
    labelAr,
    detailAr,
  };
}

function priorViolations(input: RiskInput, now: Date, weight: number): RiskFactor {
  let raw = 0;
  let counted = 0;

  for (const violation of input.violations) {
    const monthsAgo = daysBetween(now, violation.occurredAt) / DAYS_PER_MONTH;
    const timeDecay = Math.max(0, 1 - monthsAgo / VIOLATION_WINDOW_MONTHS);
    if (timeDecay === 0) continue;
    raw += SEVERITY_POINTS[violation.severity] * timeDecay;
    counted++;
  }

  return makeFactor(
    'PRIOR_VIOLATIONS',
    raw * PRIOR_VIOLATION_SCALE,
    weight,
    'مخالفات سابقة',
    counted === 0
      ? 'لا مخالفات خلال آخر اثني عشر شهراً'
      : `${arabicCount(counted, VIOLATION_FORMS)} خلال آخر اثني عشر شهراً`,
  );
}

/**
 * Deduplication (§6.2, §5.9): complaints on the same establishment and the
 * same category within 72 hours count once. When a group is collapsed the
 * survivor keeps the strongest evidence in the group — dropping a photo
 * because a duplicate arrived first would let a spammer dilute a real report.
 */
export function dedupeComplaints(complaints: RiskComplaintInput[]): RiskComplaintInput[] {
  const ordered = [...complaints].sort(
    (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime(),
  );
  const kept: RiskComplaintInput[] = [];

  for (const complaint of ordered) {
    const group = kept.find(
      (k) =>
        k.category === complaint.category &&
        Math.abs(complaint.submittedAt.getTime() - k.submittedAt.getTime()) <=
          DUPLICATE_WINDOW_HOURS * 3_600_000,
    );
    if (group) {
      if (complaint.documented) group.documented = true;
      continue;
    }
    kept.push({ ...complaint });
  }

  return kept;
}

function complaintPressure(input: RiskInput, now: Date, weight: number): RiskFactor {
  const recent = input.complaints.filter(
    (c) => daysBetween(now, c.submittedAt) <= COMPLAINT_WINDOW_DAYS,
  );
  const unique = dedupeComplaints(recent);

  const documented = unique.filter((c) => c.documented).length;
  const undocumented = unique.length - documented;
  const raw =
    documented * DOCUMENTED_COMPLAINT_WEIGHT + undocumented * UNDOCUMENTED_COMPLAINT_WEIGHT;

  const detailAr =
    unique.length === 0
      ? 'لا شكاوى خلال آخر تسعين يوماً'
      : documented > 0
        ? `${arabicCount(unique.length, COMPLAINT_FORMS)} خلال تسعين يوماً، منها ${arabicCount(documented, COMPLAINT_FORMS)} بأدلة مرفقة`
        : `${arabicCount(unique.length, COMPLAINT_FORMS)} خلال تسعين يوماً بلا أدلة مرفقة`;

  return makeFactor('COMPLAINT_PRESSURE', raw * COMPLAINT_SCALE, weight, 'ضغط الشكاوى', detailAr);
}

function timeSinceInspection(input: RiskInput, now: Date, weight: number): RiskFactor {
  const days = input.lastInspectionAt
    ? Math.floor(daysBetween(now, input.lastInspectionAt))
    : NEVER_INSPECTED_DAYS;

  return makeFactor(
    'TIME_SINCE_INSPECTION',
    (days / INSPECTION_SATURATION_DAYS) * 100,
    weight,
    'المدة منذ آخر تفتيش',
    input.lastInspectionAt
      ? `آخر تفتيش قبل ${arabicCount(days, DAY_FORMS)}`
      : 'لم يسبق تفتيش هذه المنشأة',
  );
}

function categoryRisk(input: RiskInput, weight: number): RiskFactor {
  return makeFactor(
    'CATEGORY',
    CATEGORY_RISK[input.category] ?? 0,
    weight,
    'خطورة النشاط',
    `التصنيف: ${CATEGORY_AR[input.category] ?? input.category}`,
  );
}

/** Band thresholds from §5.4: 70+ high, 40-69 medium, below 40 low. */
export function riskBand(total: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (total >= 70) return 'HIGH';
  return total >= 40 ? 'MEDIUM' : 'LOW';
}

/** Convenience for logs and tooltips — never used as the only display. */
export function describeRisk(breakdown: RiskBreakdown): string {
  return breakdown.factors
    .map((f) => `${f.labelAr} ${isolateLtr(String(f.normalized))}`)
    .join(' · ');
}
