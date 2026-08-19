# Aman — Week 3: The Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the core loop — a citizen files a complaint, the Risk Score rises, the establishment climbs the inspection queue, an inspector visits, the grade changes, and the public page reflects it. The complaint never touches the grade.

**Architecture:** The weighted Risk Score (spec §6.2) goes in `packages/shared` as a pure function alongside the existing grading algorithm, so the server and any future offline client run identical code. Each calculation persists its per-factor breakdown to `risk_score_snapshots`, because a number without its derivation is not auditable. Complaints, admin triage, and the owner portal are three thin vertical slices on top of that engine. Recalculation is event-driven (new complaint, submitted inspection, verified fix) plus one on-demand endpoint — no scheduler infrastructure for a 4-week prototype.

**Tech Stack:** Unchanged — npm workspaces, TypeScript, NestJS 10 + TypeORM + MySQL 8, Angular 22 (standalone, signals, zoneless), Jest.

---

## ⚠️ Decision required before Task 1

**The spec's §6.2 worked example contradicts its own formula.** For الفرن الذهبي with 1 critical violation 2 months ago and 1 major 5 months ago:

| | PriorViolations normalized | Total risk |
|---|---|---|
| §6.2 formula as written | **45** | **42** |
| §6.2 worked-example table | **66** | **51** |

The other three factors (ComplaintPressure 56, TimeSinceInspection 7, CategoryRisk 60) match the formula exactly. Only PriorViolations diverges.

`raw = 10 × (1 − 2/12) + 5 × (1 − 5/12) = 8.333 + 2.917 = 11.25`, and `min(100, 11.25 × 4) = 45`.

**This plan implements the formula, not the example**, because the formula is the normative text and the explainability requirement (§6.2: "an inspector must be able to justify a visit and an owner must be able to understand their ranking") depends on the stated arithmetic being the real arithmetic. Task 1 asserts 45/42 and carries a test that documents the discrepancy so nobody later "fixes" the code to chase a broken example.

**Consequence:** §13.1 wants الفرن الذهبي seeded at risk 82. The formula cannot reach 82 from the example's inputs. Task 7 tunes the seed data — more recent violations and complaints — so the *real* formula produces a demo-worthy number. We change the inputs, never the number.

If the team decides the example is authoritative instead, the only change is the `PRIOR_VIOLATION_SCALE` constant in Task 1, and Task 1's expected values.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Aman never issues a grade. The municipality does.** Every public page carries the attribution line (§0, §5.1).
- **Only a submitted inspection may write a grade** (§3.1, §6.3, §11). A complaint changes the *queue order*, never the grade. `apps/api/src/establishments/grade-integrity.spec.ts` already enforces this; do not weaken it.
- **When a violation is verified as fixed, do not raise the grade** (§6.4). Grades change only at the next inspection.
- **Complainant identity is never exposed to owners or inspectors** (§3.1, §11). Admin-only. Never store a raw IP — store `ipHash` only.
- **Strip EXIF from every uploaded photo** (§11). Already handled by `POST /api/uploads`; reuse it, do not add a second upload path.
- **Public URLs use a slug, never a database id** (§4).
- **Rate limits** (§11): complaints — 3 per IP per establishment per 24h, and 10 per IP per day overall. Login — 5 attempts then 15-minute lockout (already built).
- **No CAPTCHA** (§5.2). Use an invisible honeypot field instead.
- **Complaint description max 300 characters** (§5.2, §7.1).
- **Rejecting a complaint requires a reason from a fixed list, and is audited** (§5.9, §7.1).
- **`audit_log` is append-only** (§11). No update or delete path, even for admins.
- **Risk weights must sum to 100** (§8.3).
- **`<html dir="rtl" lang="ar">` is the default.** Use CSS logical properties (`margin-inline-start`, never `margin-left`).
- **Numbers, dates and Latin identifiers stay LTR** inside Arabic text — use the `.ltr` class in templates, or `isolateLtr()` from `@aman/shared` for strings built server-side.
- **Arabic counts inflect.** Use `arabicCount()` from `@aman/shared` for any count shown to a user. Never write `1 مخالفة`.
- **No Arabic string literals in components.** All UI copy lives in `apps/web/src/app/core/strings.ts` (§12.1).
- **Grade colours (`--grade-a/b/c/d`) are for grade badges only** (§10.2). Risk uses `--risk-high/mid/low`; "needs attention" uses `--attention`.
- **Minimum touch target 44×44px; never below 14px type on the inspector app** (§10.3).
- **Definition of done per feature** (§12.1): works in RTL at 375px, has empty + loading + error states, core logic unit-tested, no console errors, sensitive actions written to the audit log.
- **Out of scope — push back if asked** (§1.3): no ML risk model, no public star ratings or free-text reviews, no payments, no multi-municipality tenancy, no heat maps, no certificate under the Aman brand.

**If you fall behind, cut in this order** (§12): 1) admin charts, 2) owner portal, 3) complaint tracking page, 4) offline sync. Never cut the public QR page, the inspector checklist, or the Risk Score queue.

---

## File Structure

**`packages/shared`** — pure, no framework imports, runs identically on server and client.
- Create `src/risk.ts` — the §6.2 engine and its types.
- Create `src/risk.test.ts`.
- Modify `src/index.ts` — export the new module.

**`apps/api`**
- Create `src/risk/` — `risk-snapshot.entity.ts`, `risk.service.ts`, `risk.module.ts`, `risk.service.spec.ts`. Owns persistence and recalculation triggers.
- Create `src/complaints/` — `complaint.entity.ts`, `reference.ts`, `complaints.service.ts`, `complaints.controller.ts` (public), `complaints.module.ts`, `complaints.service.spec.ts`.
- Create `src/audit/` — `audit-log.entity.ts`, `audit.service.ts`, `audit.module.ts`.
- Create `src/admin/` — `admin.controller.ts`, `admin.service.ts`, `admin.module.ts`, `admin.service.spec.ts`.
- Create `src/owner/` — `owner.controller.ts`, `owner.service.ts`, `owner.module.ts`, `owner.service.spec.ts`.
- Modify `src/establishments/establishment.entity.ts` — add `currentRiskScore`.
- Modify `src/establishments/violation.entity.ts` — add `ownerResponse`, `evidencePhotoIds`, `verifiedById`, `verifiedAt`.
- Modify `src/establishments/inspection.entity.ts` — add `triggeredByComplaintId`.
- Modify `src/inspector/inspector.service.ts` — replace the Week 2 proxy ranking with `RiskService`; add `verifyViolation`.
- Modify `src/inspector/inspector.controller.ts`, `src/app.module.ts`, `src/seed.ts`.

**`apps/web`**
- Create `src/app/public/complaint-form.component.{ts,html,css}`, `complaint-track.component.ts`, `complaint.service.ts`.
- Create `src/app/ui/status-stepper.component.ts`, `src/app/ui/risk-factors.component.ts`.
- Create `src/app/admin/` — `admin-shell.component.ts`, `complaints.component.{ts,html,css}`, `planning.component.ts`, `admin.service.ts`.
- Create `src/app/owner/` — `portal.component.{ts,html,css}`, `violation-detail.component.ts`, `owner.service.ts`.
- Modify `src/app/public/establishment.component.html` — enable the complaint CTA.
- Modify `src/app/core/strings.ts`, `src/app/app.routes.ts`, `src/app/ui/risk-badge.component.ts`.

---

## Task 1: Risk Score engine in `@aman/shared`

Pure functions, no persistence, no framework. This is the most consequential logic added this week — every queue ordering and every "why is this ranked here" answer derives from it.

**Files:**
- Create: `packages/shared/src/risk.ts`
- Create: `packages/shared/src/risk.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `Severity` from `./grading`.
- Produces: `calculateRisk(input: RiskInput): RiskBreakdown`, `RISK_WEIGHTS`, `CATEGORY_RISK`, and types `RiskInput`, `RiskBreakdown`, `RiskFactor`, `RiskFactorKey`, `RiskViolationInput`, `RiskComplaintInput`, `EstablishmentCategory`. Tasks 2, 5 and 6 depend on these exact names.

---

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/risk.test.ts`:

```typescript
import { CATEGORY_RISK, RISK_WEIGHTS, calculateRisk } from './risk';
import type { RiskComplaintInput, RiskInput, RiskViolationInput } from './risk';

const NOW = new Date('2026-08-19T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
/** The engine converts days to months at 30 days per month — see risk.ts. */
const monthsAgo = (n: number) => daysAgo(n * 30);

const base = (over: Partial<RiskInput> = {}): RiskInput => ({
  category: 'BAKERY',
  lastInspectionAt: daysAgo(12),
  violations: [],
  complaints: [],
  now: NOW,
  ...over,
});

const factor = (result: ReturnType<typeof calculateRisk>, key: string) =>
  result.factors.find((f) => f.key === key)!;

describe('RISK_WEIGHTS', () => {
  it('sums to 100, which the admin settings screen will validate against', () => {
    const total = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('matches the §6.2 split', () => {
    expect(RISK_WEIGHTS.PRIOR_VIOLATIONS).toBe(40);
    expect(RISK_WEIGHTS.COMPLAINT_PRESSURE).toBe(30);
    expect(RISK_WEIGHTS.TIME_SINCE_INSPECTION).toBe(20);
    expect(RISK_WEIGHTS.CATEGORY).toBe(10);
  });
});

describe('prior violations factor', () => {
  const violation = (severity: RiskViolationInput['severity'], months: number) => ({
    severity,
    occurredAt: monthsAgo(months),
  });

  it('decays severity points linearly over twelve months', () => {
    // critical 2 months ago: 10 × (1 − 2/12) = 8.3333
    // major 5 months ago:     5 × (1 − 5/12) = 2.9167
    // raw 11.25 → ×4 → 45
    const result = calculateRisk(
      base({ violations: [violation('CRITICAL', 2), violation('MAJOR', 5)] }),
    );
    expect(factor(result, 'PRIOR_VIOLATIONS').normalized).toBe(45);
  });

  it('ignores violations older than twelve months', () => {
    const result = calculateRisk(base({ violations: [violation('CRITICAL', 13)] }));
    expect(factor(result, 'PRIOR_VIOLATIONS').normalized).toBe(0);
  });

  it('caps at 100 however bad the history is', () => {
    const many = Array.from({ length: 20 }, () => violation('CRITICAL', 0));
    const result = calculateRisk(base({ violations: many }));
    expect(factor(result, 'PRIOR_VIOLATIONS').normalized).toBe(100);
  });
});

describe('complaint pressure factor', () => {
  const complaint = (
    over: Partial<RiskComplaintInput> = {},
  ): RiskComplaintInput => ({
    category: 'HYGIENE',
    documented: false,
    submittedAt: daysAgo(1),
    ...over,
  });

  it('weights documented complaints three times an undocumented one', () => {
    // (2 documented × 3) + (1 undocumented × 1) = 7 → ×8 → 56
    const result = calculateRisk(
      base({
        complaints: [
          complaint({ documented: true, category: 'HYGIENE' }),
          complaint({ documented: true, category: 'PESTS' }),
          complaint({ documented: false, category: 'EXPIRED' }),
        ],
      }),
    );
    expect(factor(result, 'COMPLAINT_PRESSURE').normalized).toBe(56);
  });

  it('ignores complaints older than ninety days', () => {
    const result = calculateRisk(
      base({ complaints: [complaint({ submittedAt: daysAgo(91) })] }),
    );
    expect(factor(result, 'COMPLAINT_PRESSURE').normalized).toBe(0);
  });

  it('counts same-category complaints within 72 hours once', () => {
    const result = calculateRisk(
      base({
        complaints: [
          complaint({ category: 'PESTS', submittedAt: daysAgo(3) }),
          complaint({ category: 'PESTS', submittedAt: daysAgo(2) }),
          complaint({ category: 'PESTS', submittedAt: daysAgo(1) }),
        ],
      }),
    );
    // one undocumented complaint survives: raw 1 → ×8 → 8
    expect(factor(result, 'COMPLAINT_PRESSURE').normalized).toBe(8);
  });

  it('keeps a duplicate group documented if any member carried evidence', () => {
    const result = calculateRisk(
      base({
        complaints: [
          complaint({ category: 'PESTS', submittedAt: daysAgo(3), documented: false }),
          complaint({ category: 'PESTS', submittedAt: daysAgo(2), documented: true }),
        ],
      }),
    );
    // counted once, but as documented: raw 3 → ×8 → 24
    expect(factor(result, 'COMPLAINT_PRESSURE').normalized).toBe(24);
  });

  it('does not merge different categories inside the same 72 hours', () => {
    const result = calculateRisk(
      base({
        complaints: [
          complaint({ category: 'PESTS', submittedAt: daysAgo(2) }),
          complaint({ category: 'HYGIENE', submittedAt: daysAgo(2) }),
        ],
      }),
    );
    expect(factor(result, 'COMPLAINT_PRESSURE').normalized).toBe(16);
  });
});

describe('time since inspection factor', () => {
  it('reaches 100 at 180 days', () => {
    const result = calculateRisk(base({ lastInspectionAt: daysAgo(180) }));
    expect(factor(result, 'TIME_SINCE_INSPECTION').normalized).toBe(100);
  });

  it('treats never inspected as 365 days, which saturates the factor', () => {
    const result = calculateRisk(base({ lastInspectionAt: null }));
    expect(factor(result, 'TIME_SINCE_INSPECTION').normalized).toBe(100);
  });

  it('scales linearly below 180 days', () => {
    const result = calculateRisk(base({ lastInspectionAt: daysAgo(12) }));
    expect(factor(result, 'TIME_SINCE_INSPECTION').normalized).toBe(7);
  });
});

describe('category factor', () => {
  it('ranks raw meat highest and packaged goods lowest', () => {
    expect(CATEGORY_RISK.BUTCHER).toBe(100);
    expect(CATEGORY_RISK.RESTAURANT).toBe(80);
    expect(CATEGORY_RISK.BAKERY).toBe(60);
    expect(CATEGORY_RISK.CAFE).toBe(40);
    expect(CATEGORY_RISK.RETAIL).toBe(20);
  });
});

describe('calculateRisk — the §6.2 worked example (الفرن الذهبي)', () => {
  const result = calculateRisk(
    base({
      category: 'BAKERY',
      lastInspectionAt: daysAgo(12),
      violations: [
        { severity: 'CRITICAL', occurredAt: monthsAgo(2) },
        { severity: 'MAJOR', occurredAt: monthsAgo(5) },
      ],
      complaints: [
        { category: 'HYGIENE', documented: true, submittedAt: daysAgo(10) },
        { category: 'PESTS', documented: true, submittedAt: daysAgo(20) },
        { category: 'EXPIRED', documented: false, submittedAt: daysAgo(30) },
      ],
    }),
  );

  it('produces the four factors the spec names', () => {
    expect(result.factors.map((f) => f.key)).toEqual([
      'PRIOR_VIOLATIONS',
      'COMPLAINT_PRESSURE',
      'TIME_SINCE_INSPECTION',
      'CATEGORY',
    ]);
  });

  it('matches the spec table on three of four factors', () => {
    expect(factor(result, 'COMPLAINT_PRESSURE').normalized).toBe(56);
    expect(factor(result, 'TIME_SINCE_INSPECTION').normalized).toBe(7);
    expect(factor(result, 'CATEGORY').normalized).toBe(60);
  });

  /**
   * The spec's §6.2 example table states PriorViolations = 66 and a total of
   * 51. Its own formula gives 45 and 42. The formula is normative and is what
   * an inspector would be shown, so the code follows the formula. This test
   * exists so the divergence stays visible instead of being "fixed" later by
   * someone matching the example.
   */
  it('follows the stated formula rather than the inconsistent example table', () => {
    expect(factor(result, 'PRIOR_VIOLATIONS').normalized).toBe(45);
    expect(result.total).toBe(42);
  });

  it('contributions are the normalized value times its weight', () => {
    expect(factor(result, 'PRIOR_VIOLATIONS').contribution).toBeCloseTo(18.0, 5);
    expect(factor(result, 'COMPLAINT_PRESSURE').contribution).toBeCloseTo(16.8, 5);
    expect(factor(result, 'TIME_SINCE_INSPECTION').contribution).toBeCloseTo(1.4, 5);
    expect(factor(result, 'CATEGORY').contribution).toBeCloseTo(6.0, 5);
  });

  it('every factor carries an Arabic reason an inspector can read aloud', () => {
    for (const f of result.factors) {
      expect(f.labelAr.length).toBeGreaterThan(0);
      expect(f.detailAr.length).toBeGreaterThan(0);
    }
  });
});

describe('calculateRisk — bounds', () => {
  it('returns 0 for a spotless, freshly inspected packaged-goods shop', () => {
    const result = calculateRisk(
      base({ category: 'RETAIL', lastInspectionAt: NOW, violations: [], complaints: [] }),
    );
    // only the category factor contributes: 0.10 × 20 = 2
    expect(result.total).toBe(2);
  });

  it('never exceeds 100', () => {
    const result = calculateRisk(
      base({
        category: 'BUTCHER',
        lastInspectionAt: null,
        violations: Array.from({ length: 40 }, () => ({
          severity: 'CRITICAL' as const,
          occurredAt: NOW,
        })),
        complaints: Array.from({ length: 40 }, (_, i) => ({
          category: `C${i}`,
          documented: true,
          submittedAt: daysAgo(1),
        })),
      }),
    );
    expect(result.total).toBe(100);
  });

  it('accepts overridden weights so the admin settings screen can retune it', () => {
    const result = calculateRisk(
      base({ category: 'BUTCHER' }),
      { PRIOR_VIOLATIONS: 0, COMPLAINT_PRESSURE: 0, TIME_SINCE_INSPECTION: 0, CATEGORY: 100 },
    );
    expect(result.total).toBe(100);
  });

  it('rejects weights that do not sum to 100', () => {
    expect(() =>
      calculateRisk(base(), {
        PRIOR_VIOLATIONS: 50,
        COMPLAINT_PRESSURE: 30,
        TIME_SINCE_INSPECTION: 20,
        CATEGORY: 10,
      }),
    ).toThrow(/sum to 100/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:shared
```

Expected: FAIL — `Cannot find module './risk'`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/risk.ts`:

```typescript
import { SEVERITY_POINTS, type Severity } from './grading';
import { DAY_FORMS, arabicCount, isolateLtr } from './arabic';

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

/** Days per month for the decay curve. A fixed 30 keeps the arithmetic
 *  something an inspector can reproduce on paper, which is the whole point of
 *  choosing a transparent formula over a model (§1.3). */
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
      : `${arabicCount(counted, VIOLATION_FORMS_LOCAL)} خلال آخر اثني عشر شهراً`,
  );
}

/** Local copy so risk.ts does not depend on the UI-facing forms table. */
const VIOLATION_FORMS_LOCAL = {
  none: 'بلا مخالفات',
  one: 'مخالفة واحدة',
  two: 'مخالفتان',
  few: 'مخالفات',
  many: 'مخالفة',
};

const COMPLAINT_FORMS_LOCAL = {
  none: 'بلا شكاوى',
  one: 'شكوى واحدة',
  two: 'شكويان',
  few: 'شكاوى',
  many: 'شكوى',
};

/**
 * Deduplication (§6.2, §5.9): complaints on the same establishment and the
 * same category within 72 hours count once. When a group is collapsed the
 * survivor keeps the strongest evidence in the group — dropping a photo
 * because a duplicate arrived first would let a spammer dilute a real report.
 */
export function dedupeComplaints(
  complaints: RiskComplaintInput[],
): RiskComplaintInput[] {
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
        ? `${arabicCount(unique.length, COMPLAINT_FORMS_LOCAL)} خلال تسعين يوماً، منها ${arabicCount(documented, COMPLAINT_FORMS_LOCAL)} بأدلة مرفقة`
        : `${arabicCount(unique.length, COMPLAINT_FORMS_LOCAL)} خلال تسعين يوماً بلا أدلة مرفقة`;

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
```

- [ ] **Step 4: Export it from the package barrel**

Modify `packages/shared/src/index.ts` to read exactly:

```typescript
export * from './grading';
export * from './checklist';
export * from './arabic';
export * from './risk';
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run test:shared
```

Expected: PASS, all suites. If `PRIOR_VIOLATIONS` asserts 45 and you get something else, do **not** change the test — re-read the decision block at the top of this plan.

- [ ] **Step 6: Verify the whole workspace still builds**

```bash
npm run build:shared && npm test
```

Expected: shared builds, 49 existing tests plus the new risk tests all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/risk.ts packages/shared/src/risk.test.ts packages/shared/src/index.ts
git commit -m "feat: risk score engine per spec 6.2, with per-factor breakdown"
```

---

## Task 2: Persist risk and re-rank the inspector queue

The queue currently ranks on a time-since-inspection proxy with a `ponytail:` comment marking it for replacement. This task replaces it with the real engine and persists every calculation's breakdown.

**Files:**
- Create: `apps/api/src/risk/risk-snapshot.entity.ts`
- Create: `apps/api/src/risk/risk.service.ts`
- Create: `apps/api/src/risk/risk.module.ts`
- Create: `apps/api/src/risk/risk.service.spec.ts`
- Modify: `apps/api/src/establishments/establishment.entity.ts`
- Modify: `apps/api/src/inspector/inspector.service.ts`
- Modify: `apps/api/src/inspector/inspector.dto.ts`
- Modify: `apps/api/src/inspector/inspector.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/seed.ts`

**Interfaces:**
- Consumes: `calculateRisk`, `RiskBreakdown`, `RiskFactor`, `EstablishmentCategory` from `@aman/shared` (Task 1).
- Produces: `RiskService.recalculate(establishmentId: string): Promise<RiskBreakdown>`, `RiskService.recalculateAll(): Promise<number>`, `RiskService.latestSnapshot(establishmentId: string): Promise<RiskSnapshot | null>`, and the extended `QueueEntryDto.factors: RiskFactorDto[]`. Tasks 5, 6 and 7 depend on these.

---

- [ ] **Step 1: Add the denormalized column to the establishment entity**

In `apps/api/src/establishments/establishment.entity.ts`, add this property after `lastInspectionAt`:

```typescript
  /** Denormalized for fast list reads (spec §7.1). Authoritative derivation
   *  lives in risk_score_snapshots — never treat this column as the record. */
  @Column({ type: 'int', default: 0 })
  currentRiskScore!: number;
```

- [ ] **Step 2: Create the snapshot entity**

Create `apps/api/src/risk/risk-snapshot.entity.ts`:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Spec §6.2: persist each factor's contribution alongside the total. The
 * queue must be able to display why an establishment ranks where it does, and
 * the history is what defends the formula to a judge, an owner, or a court.
 */
@Entity('risk_score_snapshots')
export class RiskSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  establishmentId!: string;

  @Column({ type: 'int' })
  total!: number;

  /** Serialized RiskFactor[] — the full derivation, not just the number. */
  @Column({ type: 'text' })
  factorsJson!: string;

  /** What triggered the recalculation: COMPLAINT, INSPECTION, VERIFICATION, MANUAL. */
  @Column({ type: 'varchar' })
  trigger!: string;

  @Column({ type: 'datetime' })
  calculatedAt!: Date;
}
```

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/risk/risk.service.spec.ts`:

```typescript
import { RiskService } from './risk.service';
import { Establishment } from '../establishments/establishment.entity';

const NOW = new Date('2026-08-19T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function build(overrides: { establishment?: any; violations?: any[]; complaints?: any[] } = {}) {
  const establishment = {
    id: 'est-1',
    category: 'BAKERY',
    lastInspectionAt: daysAgo(12),
    ...overrides.establishment,
  };

  const saved: any[] = [];
  const updates: any[] = [];

  const service = new RiskService(
    {
      findOne: jest.fn(async () => establishment),
      find: jest.fn(async () => [establishment]),
      update: jest.fn(async (_e: unknown, id: string, patch: unknown) =>
        updates.push({ id, patch }),
      ),
    } as any,
    { find: jest.fn(async () => overrides.violations ?? []) } as any,
    { find: jest.fn(async () => overrides.complaints ?? []) } as any,
    {
      save: jest.fn(async (row: any) => {
        saved.push(row);
        return { id: 'snap-1', ...row };
      }),
      findOne: jest.fn(async () => saved[saved.length - 1] ?? null),
    } as any,
  );

  return { service, saved, updates, establishment };
}

describe('RiskService.recalculate', () => {
  it('writes a snapshot carrying the full factor derivation', async () => {
    const { service, saved } = build();

    await service.recalculate('est-1', 'MANUAL');

    expect(saved).toHaveLength(1);
    const factors = JSON.parse(saved[0].factorsJson);
    expect(factors.map((f: any) => f.key)).toEqual([
      'PRIOR_VIOLATIONS',
      'COMPLAINT_PRESSURE',
      'TIME_SINCE_INSPECTION',
      'CATEGORY',
    ]);
    expect(saved[0].trigger).toBe('MANUAL');
  });

  it('denormalizes the total onto the establishment for fast list reads', async () => {
    const { service, updates } = build();

    const result = await service.recalculate('est-1', 'MANUAL');

    const write = updates.find((u) => u.id === 'est-1');
    expect(write.patch.currentRiskScore).toBe(result.total);
  });

  it('raises the score when a documented complaint arrives', async () => {
    const without = build();
    const before = await without.service.recalculate('est-1', 'MANUAL');

    const withComplaint = build({
      complaints: [{ category: 'HYGIENE', hasEvidence: true, createdAt: daysAgo(1) }],
    });
    const after = await withComplaint.service.recalculate('est-1', 'COMPLAINT');

    expect(after.total).toBeGreaterThan(before.total);
  });

  it('only counts complaints that are actually live', async () => {
    // A rejected complaint must not push an establishment up the queue —
    // otherwise rejecting spam would still reward the spammer.
    const { service } = build({
      complaints: [{ category: 'HYGIENE', hasEvidence: true, createdAt: daysAgo(1) }],
    });
    const spy = (service as any).complaints.find as jest.Mock;

    await service.recalculate('est-1', 'MANUAL');

    const where = spy.mock.calls[0][0].where;
    expect(where.status).toBeDefined();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
npm run test:api
```

Expected: FAIL — `Cannot find module './risk.service'`.

- [ ] **Step 5: Write the service**

Create `apps/api/src/risk/risk.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  calculateRisk,
  type EstablishmentCategory,
  type RiskBreakdown,
} from '@aman/shared';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { Complaint } from '../complaints/complaint.entity';
import { RiskSnapshot } from './risk-snapshot.entity';

export type RiskTrigger = 'COMPLAINT' | 'INSPECTION' | 'VERIFICATION' | 'MANUAL';

/** Statuses that represent a complaint the municipality still treats as real.
 *  Rejected and duplicate complaints must not raise a score (§6.3, §5.9). */
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
        occurredAt: v.deadlineAt ?? new Date(),
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

  /** Spec §6.2 asks for a nightly pass. A prototype does not need a scheduler:
   *  recalculation already fires on every triggering event, and this method
   *  backs an admin "refresh rankings" button.
   *  ponytail: wire to cron only if a real pilot needs it. */
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
```

- [ ] **Step 6: Create the module**

Create `apps/api/src/risk/risk.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { Complaint } from '../complaints/complaint.entity';
import { RiskSnapshot } from './risk-snapshot.entity';
import { RiskService } from './risk.service';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment, Violation, Complaint, RiskSnapshot])],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
```

> This module imports `Complaint`, which Task 3 creates. Implement Task 3's
> `complaint.entity.ts` first if you are executing tasks out of order.

- [ ] **Step 7: Extend the queue DTO**

In `apps/api/src/inspector/inspector.dto.ts`, add above `QueueEntryDto`:

```typescript
export interface RiskFactorDto {
  key: string;
  normalized: number;
  weight: number;
  contribution: number;
  labelAr: string;
  detailAr: string;
}
```

and inside `QueueEntryDto`, replace the `risk` comment block and add `factors`:

```typescript
  /** 0-100 from the weighted §6.2 formula. */
  risk: number;
  /** Spec §5.4: the queue must always say why. */
  reasons: string[];
  /** Full derivation, so the UI can show the factor breakdown on demand. */
  factors: RiskFactorDto[];
```

- [ ] **Step 8: Replace the proxy ranking in the inspector service**

In `apps/api/src/inspector/inspector.service.ts`:

Delete the `NEVER_INSPECTED_DAYS` constant, the `daysSince` helper, and the entire body of `getQueue`. Replace `getQueue` with:

```typescript
  async getQueue(): Promise<QueueEntryDto[]> {
    const establishments = await this.establishments.find({ where: { status: 'ACTIVE' } });
    const snapshots = await this.risk.latestSnapshots(establishments.map((e) => e.id));

    const entries: QueueEntryDto[] = [];
    for (const e of establishments) {
      // A missing snapshot means nothing has happened to this establishment
      // since it was registered — compute one now rather than ranking it at 0.
      const snapshot = snapshots.get(e.id);
      const factors: RiskFactorDto[] = snapshot
        ? JSON.parse(snapshot.factorsJson)
        : (await this.risk.recalculate(e.id, 'MANUAL')).factors;
      const total = snapshot ? snapshot.total : e.currentRiskScore;

      entries.push({
        establishmentId: e.id,
        slug: e.slug,
        nameAr: e.nameAr,
        category: e.category,
        address: e.address,
        currentGrade: e.currentGrade,
        risk: total,
        // Top three contributors, strongest first — an inspector reads two or
        // three lines, not four (§5.4).
        reasons: [...factors]
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3)
          .map((f) => f.detailAr),
        factors,
      });
    }

    return entries.sort((a, b) => b.risk - a.risk);
  }
```

Add `RiskService` to the constructor, after `private dataSource: DataSource`:

```typescript
    private risk: RiskService,
```

Add the imports at the top:

```typescript
import { RiskService } from '../risk/risk.service';
import type { RiskFactorDto } from './inspector.dto';
```

Remove the now-unused `CATEGORY_AR` constant — the category reason comes from the shared engine.

- [ ] **Step 9: Recalculate risk when an inspection is submitted**

In `submitInspection`, immediately before the final `return` inside the transaction callback's enclosing method — that is, after `this.dataSource.transaction(...)` resolves — capture the result and recalculate. Change the end of `submitInspection` from `return this.dataSource.transaction(async (manager) => { ... });` to:

```typescript
    const result = await this.dataSource.transaction(async (manager) => {
      // ... existing body unchanged ...
    });

    // A completed inspection resets time-since-inspection and adds any new
    // violations, so the ranking is stale the moment it commits (§6.2).
    await this.risk.recalculate(establishment.id, 'INSPECTION');

    return result;
```

- [ ] **Step 10: Wire the modules**

In `apps/api/src/inspector/inspector.module.ts`, add `RiskModule` to `imports`:

```typescript
import { RiskModule } from '../risk/risk.module';
// ...
  imports: [
    RiskModule,
    TypeOrmModule.forFeature([ /* unchanged */ ]),
  ],
```

In `apps/api/src/app.module.ts`, add `RiskModule` to the imports array after `InspectorModule`.

- [ ] **Step 11: Seed a risk score for every establishment**

At the end of `apps/api/src/seed.ts`, before `await dataSource.destroy();`, add:

```typescript
  // Compute a real snapshot for every establishment so the queue is meaningful
  // on a fresh database, rather than every row sitting at zero.
  const { calculateRisk } = await import('@aman/shared');
  const snapshotRepo = dataSource.getRepository(RiskSnapshot);
  for (const establishment of await establishmentRepo.find()) {
    const establishmentViolations = await violationRepo.find({
      where: { establishmentId: establishment.id },
    });
    const establishmentComplaints = await complaintRepo.find({
      where: { establishmentId: establishment.id },
    });
    const breakdown = calculateRisk({
      category: establishment.category as any,
      lastInspectionAt: establishment.lastInspectionAt,
      violations: establishmentViolations.map((v) => ({
        severity: v.severity,
        occurredAt: v.deadlineAt ?? new Date(),
      })),
      complaints: establishmentComplaints.map((c) => ({
        category: c.category,
        documented: c.hasEvidence,
        submittedAt: c.createdAt,
      })),
    });
    await snapshotRepo.save({
      establishmentId: establishment.id,
      total: breakdown.total,
      factorsJson: JSON.stringify(breakdown.factors),
      trigger: 'MANUAL',
      calculatedAt: new Date(),
    });
    await establishmentRepo.update(establishment.id, { currentRiskScore: breakdown.total });
  }
```

Add `RiskSnapshot` and `Complaint` to the seed's `entities` array and create their repositories alongside the existing ones.

- [ ] **Step 12: Run the tests**

```bash
npm run build:shared && npm run test:api
```

Expected: PASS, including the existing `inspector.service.spec.ts` — you will need to pass a fourth stub (`{ latestSnapshots: jest.fn(async () => new Map()), recalculate: jest.fn(async () => ({ total: 0, factors: [] })) }`) into the `InspectorService` constructor in that spec's `build()` helper. Update it.

- [ ] **Step 13: Verify against a live database**

```bash
npm run seed
npm run dev:api
```

In a second terminal:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"inspector@nablus.ps","password":"aman1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
curl -s http://localhost:3000/api/inspector/queue -H "Authorization: Bearer $TOKEN" | node -pe "
JSON.parse(require('fs').readFileSync(0)).map(e => e.nameAr + '  risk=' + e.risk + '  ' + e.reasons.join(' | ')).join('\n')"
```

Expected: every entry carries a non-zero risk and two or three Arabic reason lines, sorted descending.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/risk apps/api/src/establishments/establishment.entity.ts \
  apps/api/src/inspector apps/api/src/app.module.ts apps/api/src/seed.ts
git commit -m "feat: rank the inspector queue by the real risk score, with persisted breakdowns"
```

---

## Task 3: Complaint intake — entity, reference numbers, rate limiting

The citizen half of the loop. A complaint must be capturable in under 60 seconds, must never expose the complainant, and must never touch the grade.

**Files:**
- Create: `apps/api/src/complaints/complaint.entity.ts`
- Create: `apps/api/src/complaints/reference.ts`
- Create: `apps/api/src/complaints/contact.ts`
- Create: `apps/api/src/complaints/complaints.service.ts`
- Create: `apps/api/src/complaints/complaints.controller.ts`
- Create: `apps/api/src/complaints/complaints.module.ts`
- Create: `apps/api/src/complaints/complaints.service.spec.ts`
- Create: `apps/api/src/complaints/reference.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `RiskService.recalculate` (Task 2), the existing `POST /api/uploads` for photos.
- Produces: `ComplaintsService.submit(dto: SubmitComplaintDto, ip: string): Promise<{ reference: string }>`, `ComplaintsService.trackByReference(reference: string): Promise<ComplaintStatusDto>`, entity `Complaint` with fields `id, reference, establishmentId, category, description, hasEvidence, photoIds, contactPhoneEncrypted, ipHash, status, duplicateOfId, rejectionReason, assignedInspectorId, createdAt, updatedAt`. Tasks 2, 4, 5 depend on these.

---

- [ ] **Step 1: Write the failing reference-number test**

Create `apps/api/src/complaints/reference.spec.ts`:

```typescript
import { generateReference, isValidReference } from './reference';

describe('generateReference', () => {
  it('produces a four-digit code a citizen can read over the phone', () => {
    for (let i = 0; i < 200; i++) {
      const reference = generateReference();
      expect(reference).toMatch(/^[0-9]{4}$/);
    }
  });

  it('never starts with zero, so nothing is lost when it is retyped', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateReference().startsWith('0')).toBe(false);
    }
  });

  it('spreads across the range rather than clustering', () => {
    const seen = new Set(Array.from({ length: 400 }, () => generateReference()));
    expect(seen.size).toBeGreaterThan(300);
  });
});

describe('isValidReference', () => {
  it('accepts a bare four-digit code', () => {
    expect(isValidReference('4821')).toBe(true);
  });

  it('accepts the hash-prefixed form citizens copy off the success screen', () => {
    expect(isValidReference('#4821')).toBe(true);
  });

  it('rejects anything else without hitting the database', () => {
    expect(isValidReference('48211')).toBe(false);
    expect(isValidReference('abcd')).toBe(false);
    expect(isValidReference("' OR 1=1 --")).toBe(false);
    expect(isValidReference('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run test:api
```

Expected: FAIL — `Cannot find module './reference'`.

- [ ] **Step 3: Write the reference module**

Create `apps/api/src/complaints/reference.ts`:

```typescript
import { randomInt } from 'node:crypto';

/**
 * Spec §5.2 shows references like #4821 — short enough to read aloud, write on
 * a receipt, or retype from memory. Four digits is a small space, so callers
 * must retry on the unique-index collision rather than trusting uniqueness
 * here.
 */
export function generateReference(): string {
  return String(randomInt(1000, 10000));
}

/** Citizens paste the code with or without the hash they saw on screen. */
export function normalizeReference(input: string): string {
  return input.trim().replace(/^#/, '');
}

export function isValidReference(input: string): boolean {
  return /^[0-9]{4}$/.test(normalizeReference(input));
}
```

- [ ] **Step 4: Write the contact-encryption module**

Spec §7.1 and §11 require the complainant's phone number to be encrypted at rest and visible to admins only.

Create `apps/api/src/complaints/contact.ts`:

```typescript
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function key(): Buffer {
  const secret = process.env.CONTACT_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CONTACT_ENCRYPTION_KEY is not set — refusing to store contact details');
  }
  // A fixed salt keeps the derived key stable across restarts; the secret is
  // what must stay secret.
  return scryptSync(secret, 'aman.contact.v1', 32);
}

/** Returns `iv:tag:ciphertext`, all hex. */
export function encryptContact(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptContact(stored: string): string | null {
  const [ivHex, tagHex, dataHex] = stored.split(':');
  if (!ivHex || !tagHex || !dataHex) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Spec §11: never store a raw IP. The hash exists only to enforce rate limits,
 * so it is salted with the same secret and is not reversible to an address.
 */
export function hashIp(ip: string): string {
  const secret = process.env.CONTACT_ENCRYPTION_KEY ?? 'aman-dev-salt';
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex');
}
```

- [ ] **Step 5: Add the key to the env example**

Append to `apps/api/.env.example`:

```
JWT_SECRET=aman-dev-secret-change-me
CONTACT_ENCRYPTION_KEY=aman-dev-contact-key-change-me
```

Add the same two lines to your local `apps/api/.env`.

- [ ] **Step 6: Create the entity**

Create `apps/api/src/complaints/complaint.entity.ts`:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** The six options on the §5.2 form. */
export type ComplaintCategory =
  | 'HYGIENE'
  | 'EXPIRED'
  | 'REFRIGERATION'
  | 'STAFF'
  | 'PESTS'
  | 'OTHER';

/** Spec §6.3. */
export type ComplaintStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ASSIGNED'
  | 'INSPECTED'
  | 'CLOSED'
  | 'DUPLICATE'
  | 'REJECTED';

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'HYGIENE',
  'EXPIRED',
  'REFRIGERATION',
  'STAFF',
  'PESTS',
  'OTHER',
];

/** Spec §5.9: rejection needs a reason from a fixed list, not free text —
 *  fixed reasons are countable, and countability is the defence against
 *  "they just delete complaints". */
export const REJECTION_REASONS = [
  'OUT_OF_JURISDICTION',
  'INSUFFICIENT_DETAIL',
  'NOT_FOOD_SAFETY',
  'ESTABLISHMENT_CLOSED',
  'ABUSIVE_OR_SPAM',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Short human-friendly code, e.g. 4821 (spec §7.1). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 8 })
  reference!: string;

  @Column({ type: 'varchar' })
  establishmentId!: string;

  @Column({ type: 'varchar' })
  category!: ComplaintCategory;

  @Column({ type: 'varchar', length: 300 })
  description!: string;

  /** Drives the ×3 weighting in the Risk Score (§6.2, §7.1). */
  @Column({ type: 'boolean', default: false })
  hasEvidence!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoIds!: string | null;

  /** AES-256-GCM. Admin-visible only — never returned by a public endpoint. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  contactPhoneEncrypted!: string | null;

  /** Hashed, for rate limiting only. Never a raw IP (§11). */
  @Column({ type: 'varchar', length: 64 })
  ipHash!: string;

  @Column({ type: 'varchar', default: 'SUBMITTED' })
  status!: ComplaintStatus;

  @Column({ type: 'varchar', nullable: true })
  duplicateOfId!: string | null;

  /** Required when status is REJECTED (§7.1). */
  @Column({ type: 'varchar', nullable: true })
  rejectionReason!: RejectionReason | null;

  @Column({ type: 'varchar', nullable: true })
  assignedInspectorId!: string | null;

  /** Traceability from complaint to visit (§7.1). */
  @Column({ type: 'varchar', nullable: true })
  inspectionId!: string | null;

  @Column({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime' })
  updatedAt!: Date;
}
```

- [ ] **Step 7: Write the failing service test**

Create `apps/api/src/complaints/complaints.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';

function build(options: { existing?: any[]; establishment?: any | null } = {}) {
  const saved: any[] = [];
  const establishment =
    options.establishment === undefined
      ? { id: 'est-1', slug: 'golden-oven-nablus', status: 'ACTIVE' }
      : options.establishment;

  const recalculate = jest.fn(async () => ({ total: 51, factors: [] }));

  const service = new ComplaintsService(
    {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.reference) {
          return saved.find((c) => c.reference === where.reference) ?? null;
        }
        return null;
      }),
      count: jest.fn(async () => (options.existing ?? []).length),
      find: jest.fn(async () => options.existing ?? []),
      save: jest.fn(async (row: any) => {
        const withId = { id: `c-${saved.length}`, ...row };
        saved.push(withId);
        return withId;
      }),
    } as any,
    { findOne: jest.fn(async () => establishment) } as any,
    { recalculate } as any,
  );

  return { service, saved, recalculate };
}

const dto = (over: Record<string, unknown> = {}) => ({
  slug: 'golden-oven-nablus',
  category: 'PESTS',
  description: 'صراصير قرب منطقة التحضير',
  photoIds: [],
  contactPhone: null,
  honeypot: '',
  ...over,
});

describe('ComplaintsService.submit', () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = 'test-key';
  });

  it('returns only a reference number — never an id or any internal field', async () => {
    const { service } = build();
    const result = await service.submit(dto() as any, '10.0.0.1');
    expect(Object.keys(result)).toEqual(['reference']);
    expect(result.reference).toMatch(/^[0-9]{4}$/);
  });

  it('marks a complaint with a photo as documented, which is what the risk score weights', async () => {
    const { service, saved } = build();
    await service.submit(dto({ photoIds: ['img-1.jpg'] }) as any, '10.0.0.1');
    expect(saved[0].hasEvidence).toBe(true);
    expect(saved[0].photoIds).toBe('img-1.jpg');
  });

  it('never stores a raw IP address', async () => {
    const { service, saved } = build();
    await service.submit(dto() as any, '10.0.0.1');
    expect(JSON.stringify(saved[0])).not.toContain('10.0.0.1');
    expect(saved[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('encrypts the contact phone rather than storing it in the clear', async () => {
    const { service, saved } = build();
    await service.submit(dto({ contactPhone: '0599123456' }) as any, '10.0.0.1');
    expect(saved[0].contactPhoneEncrypted).not.toContain('0599123456');
    expect(saved[0].contactPhoneEncrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('recalculates the risk score so the queue reorders immediately', async () => {
    const { service, recalculate } = build();
    await service.submit(dto() as any, '10.0.0.1');
    expect(recalculate).toHaveBeenCalledWith('est-1', 'COMPLAINT');
  });

  it('rejects a description longer than 300 characters', async () => {
    const { service } = build();
    await expect(
      service.submit(dto({ description: 'ا'.repeat(301) }) as any, '10.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an empty description', async () => {
    const { service } = build();
    await expect(
      service.submit(dto({ description: '   ' }) as any, '10.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a category outside the six form options', async () => {
    const { service } = build();
    await expect(
      service.submit(dto({ category: 'ARSON' }) as any, '10.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown establishment', async () => {
    const { service } = build({ establishment: null });
    await expect(service.submit(dto() as any, '10.0.0.1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('silently discards a honeypot submission and stores nothing', async () => {
    // A bot that fills the hidden field gets a plausible reference so it does
    // not learn it was caught, but nothing reaches the database.
    const { service, saved } = build();
    const result = await service.submit(dto({ honeypot: 'http://spam' }) as any, '10.0.0.1');
    expect(result.reference).toMatch(/^[0-9]{4}$/);
    expect(saved).toHaveLength(0);
  });

  it('refuses a fourth complaint from one IP about one establishment in 24h', async () => {
    const { service } = build({ existing: [{}, {}, {}] });
    await expect(service.submit(dto() as any, '10.0.0.1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('ComplaintsService.trackByReference', () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = 'test-key';
  });

  it('returns a status timeline and nothing that identifies anyone', async () => {
    const { service } = build();
    const { reference } = await service.submit(dto() as any, '10.0.0.1');

    const status = await service.trackByReference(reference);

    expect(status.reference).toBe(reference);
    expect(status.status).toBe('SUBMITTED');
    expect(status.timeline.length).toBeGreaterThan(0);
    // Spec §5.3: never expose the inspector's name or internal notes.
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('ipHash');
    expect(serialized).not.toContain('contactPhone');
    expect(serialized).not.toContain('assignedInspectorId');
    expect(serialized).not.toContain('rejectionReason');
  });

  it('rejects a malformed reference without querying', async () => {
    const { service } = build();
    await expect(service.trackByReference("' OR 1=1 --")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports an unknown reference as not found', async () => {
    const { service } = build();
    await expect(service.trackByReference('9999')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

```bash
npm run test:api
```

Expected: FAIL — `Cannot find module './complaints.service'`.

- [ ] **Step 9: Write the service**

Create `apps/api/src/complaints/complaints.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { RiskService } from '../risk/risk.service';
import {
  COMPLAINT_CATEGORIES,
  Complaint,
  type ComplaintCategory,
  type ComplaintStatus,
} from './complaint.entity';
import { generateReference, isValidReference, normalizeReference } from './reference';
import { encryptContact, hashIp } from './contact';

const MAX_DESCRIPTION = 300;
const MAX_PER_ESTABLISHMENT_PER_DAY = 3;
const MAX_PER_IP_PER_DAY = 10;
const REFERENCE_ATTEMPTS = 12;

export interface SubmitComplaintDto {
  slug: string;
  category: ComplaintCategory;
  description: string;
  photoIds?: string[];
  contactPhone?: string | null;
  /** Invisible field — a human never fills this in (§5.2, no CAPTCHA). */
  honeypot?: string;
}

export interface ComplaintTimelineStep {
  key: ComplaintStatus;
  reached: boolean;
  at: string | null;
}

export interface ComplaintStatusDto {
  reference: string;
  status: ComplaintStatus;
  establishmentNameAr: string;
  establishmentSlug: string;
  submittedAt: string;
  timeline: ComplaintTimelineStep[];
}

/** The happy path shown as a stepper (§5.3). Terminal states are rendered
 *  separately rather than being squeezed onto this line. */
const TIMELINE_ORDER: ComplaintStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'INSPECTED',
  'CLOSED',
];

@Injectable()
export class ComplaintsService {
  constructor(
    @InjectRepository(Complaint) private complaints: Repository<Complaint>,
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    private risk: RiskService,
  ) {}

  async submit(dto: SubmitComplaintDto, ip: string): Promise<{ reference: string }> {
    // Answer a bot exactly as we answer a human, but write nothing.
    if (dto.honeypot && dto.honeypot.trim().length > 0) {
      return { reference: generateReference() };
    }

    const description = (dto.description ?? '').trim();
    if (description.length === 0) {
      throw new BadRequestException('يرجى وصف ما لاحظته.');
    }
    if (description.length > MAX_DESCRIPTION) {
      throw new BadRequestException(`الوصف يجب ألا يتجاوز ${MAX_DESCRIPTION} حرفاً.`);
    }
    if (!COMPLAINT_CATEGORIES.includes(dto.category)) {
      throw new BadRequestException('نوع الشكوى غير معروف.');
    }

    const establishment = await this.establishments.findOne({ where: { slug: dto.slug } });
    if (!establishment) throw new NotFoundException('المنشأة غير مسجّلة.');

    const ipHash = hashIp(ip);
    const since = new Date(Date.now() - 86_400_000);

    const forThisEstablishment = await this.complaints.count({
      where: { ipHash, establishmentId: establishment.id, createdAt: MoreThan(since) },
    });
    if (forThisEstablishment >= MAX_PER_ESTABLISHMENT_PER_DAY) {
      throw new BadRequestException('تم استلام عدة شكاوى عن هذه المنشأة اليوم. حاول غداً.');
    }

    const overall = await this.complaints.count({
      where: { ipHash, createdAt: MoreThan(since) },
    });
    if (overall >= MAX_PER_IP_PER_DAY) {
      throw new BadRequestException('تجاوزت الحد اليومي للشكاوى. حاول غداً.');
    }

    const photoIds = dto.photoIds ?? [];
    const now = new Date();

    const saved = await this.saveWithUniqueReference({
      establishmentId: establishment.id,
      category: dto.category,
      description,
      hasEvidence: photoIds.length > 0,
      photoIds: photoIds.length ? photoIds.join(',') : null,
      contactPhoneEncrypted: dto.contactPhone?.trim()
        ? encryptContact(dto.contactPhone.trim())
        : null,
      ipHash,
      status: 'SUBMITTED',
      duplicateOfId: null,
      rejectionReason: null,
      assignedInspectorId: null,
      inspectionId: null,
      createdAt: now,
      updatedAt: now,
    });

    // The whole point of the product: this moves the queue, not the grade.
    await this.risk.recalculate(establishment.id, 'COMPLAINT');

    return { reference: saved.reference };
  }

  /** Four digits is a small space, so collide-and-retry rather than pretending
   *  the generator is unique. The unique index is the real guarantee. */
  private async saveWithUniqueReference(row: Omit<Complaint, 'id' | 'reference'>): Promise<Complaint> {
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
      try {
        return await this.complaints.save({
          ...row,
          reference: generateReference(),
        } as Complaint);
      } catch (error) {
        const message = String((error as { message?: string })?.message ?? '');
        if (!/duplicate|unique/i.test(message)) throw error;
      }
    }
    throw new BadRequestException('تعذّر إنشاء رقم مرجعي. حاول مرة أخرى.');
  }

  async trackByReference(input: string): Promise<ComplaintStatusDto> {
    if (!isValidReference(input)) throw new NotFoundException('الرقم المرجعي غير صحيح.');

    const complaint = await this.complaints.findOne({
      where: { reference: normalizeReference(input) },
    });
    if (!complaint) throw new NotFoundException('لا توجد شكوى بهذا الرقم المرجعي.');

    const establishment = await this.establishments.findOne({
      where: { id: complaint.establishmentId },
    });

    const reachedIndex = TIMELINE_ORDER.indexOf(complaint.status);

    return {
      reference: complaint.reference,
      status: complaint.status,
      establishmentNameAr: establishment?.nameAr ?? '',
      establishmentSlug: establishment?.slug ?? '',
      submittedAt: complaint.createdAt.toISOString(),
      // Spec §5.3: status and dates only. No inspector name, no internal notes,
      // no rejection reason — those are admin-side.
      timeline: TIMELINE_ORDER.map((key, index) => ({
        key,
        reached: reachedIndex >= 0 && index <= reachedIndex,
        at:
          index === 0
            ? complaint.createdAt.toISOString()
            : reachedIndex >= 0 && index <= reachedIndex
              ? complaint.updatedAt.toISOString()
              : null,
      })),
    };
  }
}
```

- [ ] **Step 10: Write the public controller**

Create `apps/api/src/complaints/complaints.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ComplaintsService,
  type ComplaintStatusDto,
  type SubmitComplaintDto,
} from './complaints.service';

@Controller('api/public/complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  submit(
    @Body() dto: SubmitComplaintDto,
    @Req() req: Request,
  ): Promise<{ reference: string }> {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return this.complaints.submit(dto, ip);
  }

  @Get(':reference')
  track(@Param('reference') reference: string): Promise<ComplaintStatusDto> {
    return this.complaints.trackByReference(reference);
  }
}
```

- [ ] **Step 11: Create the module and register it**

Create `apps/api/src/complaints/complaints.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { RiskModule } from '../risk/risk.module';
import { Complaint } from './complaint.entity';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';

@Module({
  imports: [RiskModule, TypeOrmModule.forFeature([Complaint, Establishment])],
  providers: [ComplaintsService],
  controllers: [ComplaintsController],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
```

In `apps/api/src/app.module.ts`, add `ComplaintsModule` to the imports array.

In `apps/api/src/main.ts`, add trust-proxy so `req.ip` is the client address rather than a proxy's, immediately after `app.enableCors();`:

```typescript
  // Rate limiting keys off req.ip; behind any reverse proxy this must reflect
  // the real client, not the proxy.
  app.set('trust proxy', 1);
```

- [ ] **Step 12: Run the tests**

```bash
npm run test:api
```

Expected: PASS, including all Task 1 and Task 2 tests.

- [ ] **Step 13: Verify against a live database**

```bash
npm run seed
npm run dev:api
```

Then, in a second terminal, confirm the loop's central claim — a complaint moves the queue but not the grade:

```bash
GRADE_BEFORE=$(curl -s http://localhost:3000/api/public/establishments/golden-oven-nablus | node -pe "JSON.parse(require('fs').readFileSync(0)).grade")

REF=$(curl -s -X POST http://localhost:3000/api/public/complaints \
  -H 'Content-Type: application/json' \
  -d '{"slug":"golden-oven-nablus","category":"PESTS","description":"صراصير قرب منطقة التحضير"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).reference")
echo "reference: $REF"

GRADE_AFTER=$(curl -s http://localhost:3000/api/public/establishments/golden-oven-nablus | node -pe "JSON.parse(require('fs').readFileSync(0)).grade")
echo "grade before=$GRADE_BEFORE after=$GRADE_AFTER   (MUST be identical)"

curl -s "http://localhost:3000/api/public/complaints/$REF" | node -pe "
const c = JSON.parse(require('fs').readFileSync(0));
c.reference + ' ' + c.status + ' steps=' + c.timeline.filter(t => t.reached).length"
```

Expected: the grade is unchanged, the reference tracks, and the queue's risk for that establishment has risen. Confirm the rate limit too — the fourth POST in a row must return 400.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/complaints apps/api/src/app.module.ts apps/api/src/main.ts apps/api/.env.example
git commit -m "feat: complaint intake with reference numbers, rate limiting and encrypted contacts"
```

---

## Task 4: Public complaint form and tracking

Four fields maximum. Every extra field loses roughly a third of submissions (§5.2), so resist adding any.

**Files:**
- Create: `apps/web/src/app/public/complaint.service.ts`
- Create: `apps/web/src/app/public/complaint-form.component.ts`
- Create: `apps/web/src/app/public/complaint-form.component.html`
- Create: `apps/web/src/app/public/complaint-form.component.css`
- Create: `apps/web/src/app/public/complaint-track.component.ts`
- Create: `apps/web/src/app/ui/status-stepper.component.ts`
- Modify: `apps/web/src/app/core/strings.ts`
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/app/public/establishment.component.html`
- Modify: `apps/web/src/app/public/establishment.component.ts`

**Interfaces:**
- Consumes: `POST /api/public/complaints`, `GET /api/public/complaints/:reference` (Task 3); `compressPhoto` and `objectUrl` from `../core/photo`; `API_BASE` from `../core/api`.
- Produces: routes `/e/:slug/complaint`, `/complaint/track`, `/complaint/:ref`; `StatusStepperComponent` (`steps` input) reused by the owner portal in Task 7.

---

- [ ] **Step 1: Add the copy**

In `apps/web/src/app/core/strings.ts`, replace the `complaintSoon` line inside `publicPage` with:

```typescript
    complaintCta: 'قدّم شكوى عن هذه المنشأة',
```

and add a new top-level `complaint` block before `auth`:

```typescript
  complaint: {
    title: 'تقديم شكوى',
    reporting: 'الشكوى بخصوص',
    categoryLabel: 'ما الذي لاحظته؟',
    categoryRequired: 'اختر نوع الملاحظة.',
    category: {
      HYGIENE: 'النظافة العامة',
      EXPIRED: 'مواد منتهية الصلاحية أو فاسدة',
      REFRIGERATION: 'التبريد أو التخزين',
      STAFF: 'نظافة العاملين',
      PESTS: 'حشرات أو قوارض',
      OTHER: 'أخرى',
    } as Record<string, string>,
    descriptionLabel: 'صف ما لاحظته باختصار',
    descriptionPlaceholder: 'مثال: صراصير قرب منطقة التحضير',
    descriptionRequired: 'يرجى وصف ما لاحظته.',
    remaining: 'حرفاً متبقياً',
    photoLabel: 'أضف صورة (اختياري)',
    photoHint: 'الشكاوى المرفقة بصورة تُعطى أولوية أعلى.',
    photoAdd: 'التقط صورة',
    photoRemove: 'حذف الصورة',
    phoneLabel: 'رقم هاتفك (اختياري — للتحديثات فقط)',
    phoneHint: 'لا يظهر لصاحب المنشأة أبداً.',
    submit: 'إرسال الشكوى',
    submitting: 'جارٍ الإرسال…',
    failed: 'تعذّر إرسال الشكوى. حاول مرة أخرى.',
    successTitle: 'تم استلام الشكوى',
    referenceLabel: 'الرقم المرجعي',
    copy: 'نسخ',
    copied: 'تم النسخ',
    saveNumber: 'احتفظ بهذا الرقم لمتابعة حالة الشكوى.',
    trackNow: 'تابع الشكوى',
    backToEstablishment: 'العودة إلى صفحة المنشأة',
    // The grade line is what stops a citizen expecting an instant downgrade.
    gradeNote: 'الشكوى تُقدّم المنشأة في دور التفتيش، ولا تغيّر الدرجة. الدرجة لا تتغير إلا بتفتيش.',
  },

  track: {
    title: 'متابعة شكوى',
    lede: 'أدخل الرقم المرجعي الذي استلمته عند تقديم الشكوى.',
    referenceLabel: 'الرقم المرجعي',
    submit: 'عرض الحالة',
    notFound: 'لا توجد شكوى بهذا الرقم المرجعي.',
    reporting: 'الشكوى بخصوص',
    submittedAt: 'تاريخ التقديم',
    step: {
      SUBMITTED: 'تم الاستلام',
      UNDER_REVIEW: 'قيد المراجعة',
      ASSIGNED: 'تم تحديد زيارة تفتيش',
      INSPECTED: 'تم التفتيش',
      CLOSED: 'مغلقة',
      DUPLICATE: 'مكرّرة — دُمجت مع شكوى سابقة',
      REJECTED: 'مرفوضة',
    } as Record<string, string>,
    pending: 'قيد الانتظار',
    terminalNote: 'هذه الشكوى أُغلقت. لا تظهر أسماء المفتشين ولا الملاحظات الداخلية.',
  },
```

- [ ] **Step 2: Write the service**

Create `apps/web/src/app/public/complaint.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';

export type ComplaintCategory =
  | 'HYGIENE'
  | 'EXPIRED'
  | 'REFRIGERATION'
  | 'STAFF'
  | 'PESTS'
  | 'OTHER';

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'HYGIENE',
  'EXPIRED',
  'REFRIGERATION',
  'STAFF',
  'PESTS',
  'OTHER',
];

export interface ComplaintTimelineStep {
  key: string;
  reached: boolean;
  at: string | null;
}

export interface ComplaintStatus {
  reference: string;
  status: string;
  establishmentNameAr: string;
  establishmentSlug: string;
  submittedAt: string;
  timeline: ComplaintTimelineStep[];
}

@Injectable({ providedIn: 'root' })
export class ComplaintService {
  private http = inject(HttpClient);

  /** Photos go through the same authenticated upload path inspectors use, so
   *  EXIF stripping and magic-byte validation happen in exactly one place.
   *  The public form posts to the unauthenticated variant. */
  async uploadPhoto(blob: Blob): Promise<string> {
    const form = new FormData();
    form.append('file', blob, 'complaint.jpg');
    const response = await firstValueFrom(
      this.http.post<{ id: string }>(`${API_BASE}/api/public/uploads`, form),
    );
    return response.id;
  }

  submit(payload: {
    slug: string;
    category: ComplaintCategory;
    description: string;
    photoIds: string[];
    contactPhone: string | null;
    honeypot: string;
  }): Promise<{ reference: string }> {
    return firstValueFrom(
      this.http.post<{ reference: string }>(`${API_BASE}/api/public/complaints`, payload),
    );
  }

  track(reference: string): Promise<ComplaintStatus> {
    return firstValueFrom(
      this.http.get<ComplaintStatus>(
        `${API_BASE}/api/public/complaints/${encodeURIComponent(reference)}`,
      ),
    );
  }
}
```

- [ ] **Step 3: Add the public upload endpoint**

The complaint form has no token, so it needs an unauthenticated upload that reuses the same validation and stripping.

In `apps/api/src/uploads/uploads.controller.ts`, extract the shared body into a helper and add a second controller. Replace the whole file with:

```typescript
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { detectImage, stripJpegMetadata } from './image';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;

/** One implementation, two doors. Both strip EXIF and validate magic bytes —
 *  a citizen's photo carries GPS just as readily as an inspector's (§11). */
async function store(file?: Express.Multer.File): Promise<{ id: string; url: string }> {
  if (!file?.buffer?.length) throw new BadRequestException('لم يتم إرفاق ملف.');

  const kind = detectImage(file.buffer);
  if (!kind) throw new BadRequestException('الملف ليس صورة صالحة (JPEG أو PNG فقط).');

  const cleaned = kind === 'jpeg' ? stripJpegMetadata(file.buffer) : file.buffer;
  const id = `${randomUUID()}.${kind === 'jpeg' ? 'jpg' : 'png'}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, id), cleaned);

  return { id, url: `/uploads/${id}` };
}

@Controller('api/uploads')
@UseGuards(AuthGuard)
@Roles('INSPECTOR', 'OWNER', 'ADMIN')
export class UploadsController {
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  upload(@UploadedFile() file?: Express.Multer.File): Promise<{ id: string; url: string }> {
    return store(file);
  }
}

@Controller('api/public/uploads')
export class PublicUploadsController {
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  upload(@UploadedFile() file?: Express.Multer.File): Promise<{ id: string; url: string }> {
    return store(file);
  }
}
```

In `apps/api/src/uploads/uploads.module.ts`, register both:

```typescript
import { Module } from '@nestjs/common';
import { PublicUploadsController, UploadsController } from './uploads.controller';

@Module({ controllers: [UploadsController, PublicUploadsController] })
export class UploadsModule {}
```

- [ ] **Step 4: Build the status stepper**

Create `apps/web/src/app/ui/status-stepper.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';

export interface StepperStep {
  labelAr: string;
  reached: boolean;
  at: string | null;
}

/**
 * Spec §5.3: a vertical stepper is what separates Aman from every complaint
 * box citizens have stopped trusting. Dates and status only — never a name.
 */
@Component({
  selector: 'app-status-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <ol class="stepper">
      @for (step of steps(); track step.labelAr) {
        <li class="step" [class.step--done]="step.reached">
          <span class="step__marker" aria-hidden="true"></span>
          <span class="step__label">{{ step.labelAr }}</span>
          <span class="step__at">
            @if (step.at) {
              <span class="ltr">{{ step.at | date: 'yyyy-MM-dd' }}</span>
            } @else {
              {{ pendingLabel() }}
            }
          </span>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      .stepper {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
      }

      .step {
        display: grid;
        grid-template-columns: 18px 1fr auto;
        align-items: center;
        gap: var(--s3);
        padding-block: var(--s3);
        position: relative;
        color: var(--ink-muted);
      }

      .step--done {
        color: var(--ink-2);
      }

      /* The connector runs between markers, not past the last one. */
      .step:not(:last-child)::before {
        content: '';
        position: absolute;
        inset-inline-start: 8px;
        inset-block-start: 50%;
        block-size: 100%;
        inline-size: 1px;
        background: var(--rule);
      }

      .step__marker {
        inline-size: 15px;
        block-size: 15px;
        border-radius: 50%;
        border: 2px solid var(--rule-strong);
        background: var(--card);
        position: relative;
        z-index: 1;
      }

      .step--done .step__marker {
        border-color: var(--primary);
        background: var(--primary);
      }

      .step__label {
        font-size: var(--text-body);
      }

      .step--done .step__label {
        font-weight: 700;
      }

      .step__at {
        font-size: 13px;
      }
    `,
  ],
})
export class StatusStepperComponent {
  readonly steps = input.required<StepperStep[]>();
  readonly pendingLabel = input<string>('');
}
```

- [ ] **Step 5: Build the complaint form template**

Create `apps/web/src/app/public/complaint-form.component.html`:

```html
<header class="masthead">
  <div class="masthead__inner">
    <span class="masthead__mark">{{ t.app.name }}</span>
    <span class="masthead__divider" aria-hidden="true"></span>
    <span class="masthead__authority">{{ t.app.authority }} · {{ t.app.department }}</span>
  </div>
</header>

@if (reference(); as ref) {
  <main class="page page--success">
    <div class="success">
      <p class="success__title">{{ t.complaint.successTitle }}</p>

      <div class="success__ref">
        <span class="success__ref-label">{{ t.complaint.referenceLabel }}</span>
        <span class="success__ref-value ltr">#{{ ref }}</span>
        <button type="button" class="btn btn--ghost" (click)="copyReference(ref)">
          {{ copied() ? t.complaint.copied : t.complaint.copy }}
        </button>
      </div>

      <p class="success__save">{{ t.complaint.saveNumber }}</p>
      <p class="success__grade">{{ t.complaint.gradeNote }}</p>

      <div class="success__actions">
        <a class="btn btn--block" [routerLink]="['/complaint', ref]">{{ t.complaint.trackNow }}</a>
        <a class="btn btn--ghost btn--block" [routerLink]="['/e', slug()]">
          {{ t.complaint.backToEstablishment }}
        </a>
      </div>
    </div>
  </main>
} @else {
  <main class="page">
    <h1 class="page__title">{{ t.complaint.title }}</h1>
    <p class="page__reporting">
      {{ t.complaint.reporting }}: <strong>{{ establishmentNameAr() || slug() }}</strong>
    </p>

    <form class="form" (ngSubmit)="submit()">
      <fieldset class="group">
        <legend class="eyebrow">{{ t.complaint.categoryLabel }}</legend>
        <div class="options">
          @for (option of categories; track option) {
            <label class="option" [class.option--on]="category() === option">
              <input
                type="radio"
                name="category"
                [value]="option"
                [checked]="category() === option"
                (change)="category.set(option)"
              />
              <span>{{ t.complaint.category[option] }}</span>
            </label>
          }
        </div>
      </fieldset>

      <div class="field">
        <label for="description">{{ t.complaint.descriptionLabel }}</label>
        <textarea
          id="description"
          maxlength="300"
          [placeholder]="t.complaint.descriptionPlaceholder"
          [value]="description()"
          (input)="description.set($any($event.target).value)"
        ></textarea>
        <p class="field__count">
          <span class="ltr">{{ 300 - description().length }}</span> {{ t.complaint.remaining }}
        </p>
      </div>

      <div class="field">
        <span class="field__label">{{ t.complaint.photoLabel }}</span>
        <p class="field__hint">{{ t.complaint.photoHint }}</p>
        <div class="photos">
          @if (photoUrl(); as url) {
            <figure class="photo">
              <img [src]="url" [alt]="t.complaint.photoLabel" />
              <button type="button" class="photo__remove" (click)="removePhoto()">
                {{ t.complaint.photoRemove }}
              </button>
            </figure>
          } @else {
            <label class="photo__add">
              <input type="file" accept="image/*" capture="environment" (change)="addPhoto($any($event.target))" />
              <span>{{ t.complaint.photoAdd }}</span>
            </label>
          }
        </div>
      </div>

      <div class="field">
        <label for="phone">{{ t.complaint.phoneLabel }}</label>
        <input id="phone" type="tel" dir="ltr" [value]="phone()" (input)="phone.set($any($event.target).value)" />
        <p class="field__hint">{{ t.complaint.phoneHint }}</p>
      </div>

      <!-- Honeypot: invisible to people, irresistible to bots (§5.2, no CAPTCHA). -->
      <label class="honeypot" aria-hidden="true">
        <input type="text" tabindex="-1" autocomplete="off" [value]="honeypot()" (input)="honeypot.set($any($event.target).value)" />
      </label>

      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      }

      <p class="grade-note">{{ t.complaint.gradeNote }}</p>

      <button class="btn btn--block" type="submit" [disabled]="busy() || !canSubmit()">
        {{ busy() ? t.complaint.submitting : t.complaint.submit }}
      </button>
    </form>

    <footer class="attribution">{{ t.app.attribution }}</footer>
  </main>
}
```

- [ ] **Step 6: Write the complaint form component**

Create `apps/web/src/app/public/complaint-form.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { COMPLAINT_CATEGORIES, ComplaintService, type ComplaintCategory } from './complaint.service';
import { EstablishmentService } from './establishment.service';
import { compressPhoto, objectUrl } from '../core/photo';
import { T } from '../core/strings';

@Component({
  selector: 'app-complaint-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './complaint-form.component.html',
  styleUrl: './complaint-form.component.css',
})
export class ComplaintFormComponent {
  readonly t = T;
  readonly categories = COMPLAINT_CATEGORIES;

  private route = inject(ActivatedRoute);
  private complaints = inject(ComplaintService);
  private establishments = inject(EstablishmentService);

  readonly slug = signal(this.route.snapshot.paramMap.get('slug') ?? '');
  readonly establishmentNameAr = signal('');

  readonly category = signal<ComplaintCategory | null>(null);
  readonly description = signal('');
  readonly phone = signal('');
  readonly honeypot = signal('');

  readonly photoUrl = signal<string | null>(null);
  private photoBlob: Blob | null = null;

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly reference = signal<string | null>(null);
  readonly copied = signal(false);

  readonly canSubmit = computed(
    () => this.category() !== null && this.description().trim().length > 0,
  );

  constructor() {
    this.establishments.getBySlug(this.slug()).subscribe({
      next: (e) => this.establishmentNameAr.set(e.nameAr),
      error: () => this.establishmentNameAr.set(''),
    });
  }

  async addPhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // Re-encoding through a canvas compresses and discards EXIF before the
    // photo ever leaves the citizen's phone.
    this.photoBlob = await compressPhoto(file);
    this.photoUrl.set(objectUrl(this.photoBlob));
  }

  removePhoto(): void {
    const url = this.photoUrl();
    if (url) URL.revokeObjectURL(url);
    this.photoBlob = null;
    this.photoUrl.set(null);
  }

  async copyReference(reference: string): Promise<void> {
    await navigator.clipboard.writeText(reference);
    this.copied.set(true);
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const photoIds: string[] = [];
      if (this.photoBlob) photoIds.push(await this.complaints.uploadPhoto(this.photoBlob));

      const result = await this.complaints.submit({
        slug: this.slug(),
        category: this.category()!,
        description: this.description().trim(),
        photoIds,
        contactPhone: this.phone().trim() || null,
        honeypot: this.honeypot(),
      });
      this.reference.set(result.reference);
    } catch (error) {
      const message = (error as { error?: { message?: string } })?.error?.message;
      this.error.set(message ?? T.complaint.failed);
    } finally {
      this.busy.set(false);
    }
  }
}
```

- [ ] **Step 7: Write the form styles**

Create `apps/web/src/app/public/complaint-form.component.css`:

```css
:host {
  display: block;
  min-block-size: 100dvh;
  background: var(--paper);
}

.masthead {
  background: var(--ink);
  color: #fff;
  border-block-end: 3px solid var(--primary);
}

.masthead__inner {
  max-inline-size: 520px;
  margin-inline: auto;
  padding: var(--s3) var(--s4);
  display: flex;
  align-items: center;
  gap: var(--s3);
}

.masthead__mark {
  font-size: var(--text-lede);
  font-weight: 700;
}

.masthead__divider {
  inline-size: 1px;
  block-size: 18px;
  background: rgba(255, 255, 255, 0.28);
}

.masthead__authority {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
}

.page {
  max-inline-size: 520px;
  margin-inline: auto;
  padding: var(--s5) var(--s4) var(--s7);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}

.page__title {
  font-size: var(--text-title);
  font-weight: 700;
  color: var(--ink);
}

.page__reporting {
  font-size: var(--text-caption);
  color: var(--ink-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--s5);
}

.group {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

.options {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.option {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-block-size: var(--touch);
  padding: 0 var(--s4);
  background: var(--card);
  border: 1.5px solid var(--rule-strong);
  border-radius: var(--radius);
  cursor: pointer;
}

.option--on {
  border-color: var(--primary);
  background: var(--ok-bg);
  font-weight: 700;
}

.option input {
  inline-size: 18px;
  block-size: 18px;
  accent-color: var(--primary);
}

.field__label {
  font-size: var(--text-caption);
  font-weight: 700;
  color: var(--ink);
}

.field__hint,
.field__count {
  font-size: 12px;
  color: var(--ink-muted);
}

.photos {
  display: flex;
  gap: var(--s2);
}

.photo {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s1);
}

.photo img {
  inline-size: 104px;
  block-size: 104px;
  object-fit: cover;
  border-radius: var(--radius);
  border: 1px solid var(--rule);
}

.photo__remove {
  border: 0;
  background: none;
  padding: 0;
  font-size: 12px;
  color: var(--danger);
  text-decoration: underline;
  cursor: pointer;
}

.photo__add {
  inline-size: 104px;
  block-size: 104px;
  display: grid;
  place-items: center;
  padding: var(--s2);
  border: 1.5px dashed var(--rule-strong);
  border-radius: var(--radius);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
}

.photo__add input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
  pointer-events: none;
}

.photo__add:focus-within {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}

/* Off-screen rather than display:none — some bots skip hidden inputs. */
.honeypot {
  position: absolute;
  inset-inline-start: -9999px;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
}

.grade-note {
  padding: var(--s3);
  background: var(--inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-2);
}

.attribution {
  padding-block-start: var(--s4);
  border-block-start: 1px solid var(--rule);
  font-size: 13px;
  color: var(--ink-muted);
  text-align: center;
}

/* --- success ------------------------------------------------------------- */

.success {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  padding: var(--s6) var(--s4);
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  text-align: center;
}

.success__title {
  font-size: var(--text-title);
  font-weight: 700;
  color: var(--ink);
}

.success__ref {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  padding: var(--s4);
  background: var(--inset);
  border-radius: var(--radius);
}

.success__ref-label {
  font-size: 12px;
  color: var(--ink-muted);
}

.success__ref-value {
  font-size: 40px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.04em;
}

.success__save,
.success__grade {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-muted);
}

.success__actions {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

.success__actions .btn {
  text-decoration: none;
}
```

- [ ] **Step 8: Write the tracking component**

Create `apps/web/src/app/public/complaint-track.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StatusStepperComponent, type StepperStep } from '../ui/status-stepper.component';
import { ComplaintService, type ComplaintStatus } from './complaint.service';
import { T } from '../core/strings';

@Component({
  selector: 'app-complaint-track',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, StatusStepperComponent],
  template: `
    <header class="masthead">
      <div class="masthead__inner">
        <span class="masthead__mark">{{ t.app.name }}</span>
        <span class="masthead__divider" aria-hidden="true"></span>
        <span class="masthead__authority">{{ t.app.authority }} · {{ t.app.department }}</span>
      </div>
    </header>

    <main class="page">
      <h1 class="page__title">{{ t.track.title }}</h1>

      @if (!complaint()) {
        <p class="page__lede">{{ t.track.lede }}</p>
        <form class="lookup" (ngSubmit)="lookup()">
          <div class="field">
            <label for="ref">{{ t.track.referenceLabel }}</label>
            <input id="ref" dir="ltr" inputmode="numeric" [value]="input()" (input)="input.set($any($event.target).value)" />
          </div>
          @if (error()) {
            <p class="notice" role="alert">{{ error() }}</p>
          }
          <button class="btn btn--block" type="submit" [disabled]="busy() || !input().trim()">
            {{ busy() ? t.common.loading : t.track.submit }}
          </button>
        </form>
      } @else if (complaint(); as c) {
        <section class="card">
          <div class="card__head">
            <span class="card__ref ltr">#{{ c.reference }}</span>
            <a class="card__establishment" [routerLink]="['/e', c.establishmentSlug]">
              {{ c.establishmentNameAr }}
            </a>
          </div>
          <p class="card__meta">
            {{ t.track.submittedAt }}:
            <span class="ltr">{{ c.submittedAt | date: 'yyyy-MM-dd' }}</span>
          </p>

          @if (isTerminal()) {
            <p class="card__terminal">{{ t.track.step[c.status] }}</p>
          }

          <app-status-stepper [steps]="steps()" [pendingLabel]="t.track.pending" />
          <p class="card__note">{{ t.complaint.gradeNote }}</p>
        </section>
      }

      <footer class="attribution">{{ t.app.attribution }}</footer>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-block-size: 100dvh;
        background: var(--paper);
      }

      .masthead {
        background: var(--ink);
        color: #fff;
        border-block-end: 3px solid var(--primary);
      }

      .masthead__inner {
        max-inline-size: 520px;
        margin-inline: auto;
        padding: var(--s3) var(--s4);
        display: flex;
        align-items: center;
        gap: var(--s3);
      }

      .masthead__mark {
        font-size: var(--text-lede);
        font-weight: 700;
      }

      .masthead__divider {
        inline-size: 1px;
        block-size: 18px;
        background: rgba(255, 255, 255, 0.28);
      }

      .masthead__authority {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.82);
      }

      .page {
        max-inline-size: 520px;
        margin-inline: auto;
        padding: var(--s5) var(--s4) var(--s7);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .page__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }

      .page__lede {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }

      .lookup {
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .card {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
        padding: var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }

      .card__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--s3);
        padding-block-end: var(--s3);
        border-block-end: 1px solid var(--rule);
      }

      .card__ref {
        font-size: 22px;
        font-weight: 700;
        color: var(--ink);
      }

      .card__establishment {
        font-size: var(--text-caption);
        color: var(--primary);
      }

      .card__meta {
        font-size: 13px;
        color: var(--ink-muted);
      }

      .card__terminal {
        padding: var(--s3);
        background: var(--warn-bg);
        border-radius: var(--radius);
        font-size: var(--text-caption);
        font-weight: 700;
      }

      .card__note {
        padding-block-start: var(--s3);
        border-block-start: 1px solid var(--rule);
        font-size: 13px;
        line-height: 1.6;
        color: var(--ink-muted);
      }

      .attribution {
        padding-block-start: var(--s4);
        border-block-start: 1px solid var(--rule);
        font-size: 13px;
        color: var(--ink-muted);
        text-align: center;
      }
    `,
  ],
})
export class ComplaintTrackComponent {
  readonly t = T;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private complaints = inject(ComplaintService);

  readonly input = signal(this.route.snapshot.paramMap.get('ref') ?? '');
  readonly complaint = signal<ComplaintStatus | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly isTerminal = computed(() => {
    const status = this.complaint()?.status;
    return status === 'DUPLICATE' || status === 'REJECTED';
  });

  readonly steps = computed<StepperStep[]>(
    () =>
      this.complaint()?.timeline.map((step) => ({
        labelAr: T.track.step[step.key] ?? step.key,
        reached: step.reached,
        at: step.at,
      })) ?? [],
  );

  constructor() {
    if (this.input().trim()) void this.lookup();
  }

  async lookup(): Promise<void> {
    const reference = this.input().trim();
    if (!reference) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.complaint.set(await this.complaints.track(reference));
      void this.router.navigate(['/complaint', reference.replace(/^#/, '')], {
        replaceUrl: true,
      });
    } catch {
      this.error.set(T.track.notFound);
    } finally {
      this.busy.set(false);
    }
  }
}
```

- [ ] **Step 9: Enable the complaint call to action on the public page**

In `apps/web/src/app/public/establishment.component.html`, replace the "coming soon" block:

```html
    @if (e.status !== 'SUSPENDED' && e.status !== 'CLOSED') {
      <a class="btn btn--block complaint-cta" [routerLink]="['/e', e.slug, 'complaint']">
        {{ t.publicPage.complaintCta }}
      </a>
    }
```

In `apps/web/src/app/public/establishment.component.ts`, add `RouterLink` to the imports array and to the `@angular/router` import statement.

In `apps/web/src/app/public/establishment.component.css`, replace the `.soon` rule with:

```css
.complaint-cta {
  text-decoration: none;
}
```

- [ ] **Step 10: Register the routes**

In `apps/web/src/app/app.routes.ts`, add these three routes after the `e/:slug` route:

```typescript
  { path: 'e/:slug/complaint', component: ComplaintFormComponent },
  { path: 'complaint/track', component: ComplaintTrackComponent },
  { path: 'complaint/:ref', component: ComplaintTrackComponent },
```

and the corresponding imports:

```typescript
import { ComplaintFormComponent } from './public/complaint-form.component';
import { ComplaintTrackComponent } from './public/complaint-track.component';
```

> Route order matters: `complaint/track` must be declared before `complaint/:ref`, otherwise the literal `track` is captured as a reference number.

- [ ] **Step 11: Build and verify in a browser**

```bash
npm run build:shared && npm run build --workspace=apps/web
npm run dev:api    # terminal 1
npm run dev:web    # terminal 2
```

At 375px width, walk this by hand:

1. Open `http://localhost:4200/e/golden-oven-nablus`, note the grade, tap the complaint button.
2. Choose a category, type a description, attach a photo, submit.
3. Confirm the reference appears large and copyable, and that the grade note is visible.
4. Follow "تابع الشكوى" and confirm the stepper shows تم الاستلام as reached and later steps pending.
5. Return to the establishment page and confirm **the grade has not changed**.
6. Open the browser console — it must be clean.
7. Submit three more complaints from the same browser and confirm the fourth is refused with an Arabic message.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/app/public apps/web/src/app/ui/status-stepper.component.ts \
  apps/web/src/app/app.routes.ts apps/web/src/app/core/strings.ts \
  apps/api/src/uploads
git commit -m "feat: public complaint form and reference tracking"
```

---

## Task 5: Audit log and admin triage API

The audit log is the answer when a judge or an owner challenges the system's fairness. Build it before the first auditable action exists, not after.

**Files:**
- Create: `apps/api/src/audit/audit-log.entity.ts`
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.module.ts`
- Create: `apps/api/src/audit/audit.service.spec.ts`
- Create: `apps/api/src/admin/admin.dto.ts`
- Create: `apps/api/src/admin/admin.service.ts`
- Create: `apps/api/src/admin/admin.controller.ts`
- Create: `apps/api/src/admin/admin.module.ts`
- Create: `apps/api/src/admin/admin.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `Complaint`, `REJECTION_REASONS` (Task 3); `RiskService.recalculate`, `RiskService.latestSnapshots` (Task 2); `AuthGuard`, `Roles` from `../auth/auth.guard`.
- Produces: `AuditService.record(entry): Promise<void>`; `AdminService.listComplaints(filter)`, `.assign(id, inspectorId, actor)`, `.markDuplicate(id, originalId, actor)`, `.reject(id, reason, actor)`, `.close(id, actor)`, `.planning()`. Task 6 consumes all of these.

---

- [ ] **Step 1: Create the append-only audit entity**

Create `apps/api/src/audit/audit-log.entity.ts`:

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Spec §7.1, §11: append-only. No update path, no delete path, not even for
 * admins. When someone challenges the fairness of a decision, this table is
 * the answer — a log that can be edited answers nothing.
 */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** User id, or 'system' for automated actions. */
  @Column({ type: 'varchar' })
  actorId!: string;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar' })
  entityType!: string;

  @Column({ type: 'varchar' })
  entityId!: string;

  @Column({ type: 'text', nullable: true })
  beforeJson!: string | null;

  @Column({ type: 'text', nullable: true })
  afterJson!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipHash!: string | null;

  @Column({ type: 'datetime' })
  createdAt!: Date;
}

/** The minimum set §7.1 requires. Add to it; never remove from it. */
export const AUDIT_ACTIONS = {
  GRADE_CHANGED: 'GRADE_CHANGED',
  COMPLAINT_REJECTED: 'COMPLAINT_REJECTED',
  COMPLAINT_MARKED_DUPLICATE: 'COMPLAINT_MARKED_DUPLICATE',
  COMPLAINT_ASSIGNED: 'COMPLAINT_ASSIGNED',
  COMPLAINT_CLOSED: 'COMPLAINT_CLOSED',
  RISK_WEIGHTS_CHANGED: 'RISK_WEIGHTS_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  ESTABLISHMENT_STATUS_CHANGED: 'ESTABLISHMENT_STATUS_CHANGED',
  VIOLATION_VERIFIED: 'VIOLATION_VERIFIED',
} as const;
```

- [ ] **Step 2: Write the failing audit test**

Create `apps/api/src/audit/audit.service.spec.ts`:

```typescript
import { AuditService } from './audit.service';
import { AUDIT_ACTIONS } from './audit-log.entity';

function build() {
  const saved: any[] = [];
  const repo = {
    save: jest.fn(async (row: any) => {
      saved.push(row);
      return row;
    }),
  };
  return { service: new AuditService(repo as any), saved, repo };
}

describe('AuditService.record', () => {
  it('stores actor, action, entity and both sides of the change', async () => {
    const { service, saved } = build();

    await service.record({
      actorId: 'user-1',
      action: AUDIT_ACTIONS.COMPLAINT_REJECTED,
      entityType: 'complaint',
      entityId: 'c-1',
      before: { status: 'SUBMITTED' },
      after: { status: 'REJECTED', rejectionReason: 'NOT_FOOD_SAFETY' },
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].actorId).toBe('user-1');
    expect(saved[0].action).toBe('COMPLAINT_REJECTED');
    expect(saved[0].entityType).toBe('complaint');
    expect(saved[0].entityId).toBe('c-1');
    expect(JSON.parse(saved[0].beforeJson)).toEqual({ status: 'SUBMITTED' });
    expect(JSON.parse(saved[0].afterJson).rejectionReason).toBe('NOT_FOOD_SAFETY');
    expect(saved[0].createdAt).toBeInstanceOf(Date);
  });

  it('never writes a raw IP, only a hash', async () => {
    const { service, saved } = build();

    await service.record({
      actorId: 'user-1',
      action: AUDIT_ACTIONS.COMPLAINT_CLOSED,
      entityType: 'complaint',
      entityId: 'c-1',
      ip: '10.0.0.9',
    });

    expect(JSON.stringify(saved[0])).not.toContain('10.0.0.9');
    expect(saved[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exposes no update or delete method — the table is append-only', () => {
    const names = Object.getOwnPropertyNames(AuditService.prototype);
    expect(names.filter((n) => /update|delete|remove|clear|purge/i.test(n))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npm run test:api
```

Expected: FAIL — `Cannot find module './audit.service'`.

- [ ] **Step 4: Write the audit service and module**

Create `apps/api/src/audit/audit.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashIp } from '../complaints/contact';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** Write-only by design (§11). If you find yourself wanting an update method,
 *  the answer is another append, not an edit. */
@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private logs: Repository<AuditLog>) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.logs.save({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.before === undefined ? null : JSON.stringify(entry.before),
      afterJson: entry.after === undefined ? null : JSON.stringify(entry.after),
      ipHash: entry.ip ? hashIp(entry.ip) : null,
      createdAt: new Date(),
    });
  }
}
```

Create `apps/api/src/audit/audit.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

Register `AuditModule` in `apps/api/src/app.module.ts`, before `ComplaintsModule`.

- [ ] **Step 5: Write the failing admin triage test**

Create `apps/api/src/admin/admin.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const NOW = new Date('2026-08-19T12:00:00Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

function complaint(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    reference: '4821',
    establishmentId: 'est-1',
    category: 'PESTS',
    description: 'صراصير',
    hasEvidence: false,
    status: 'SUBMITTED',
    duplicateOfId: null,
    rejectionReason: null,
    assignedInspectorId: null,
    contactPhoneEncrypted: null,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    ...over,
  };
}

function build(rows: any[] = [complaint()]) {
  const updates: any[] = [];
  const audit = { record: jest.fn(async () => undefined) };
  const risk = { recalculate: jest.fn(async () => ({ total: 51, factors: [] })) };

  const service = new AdminService(
    {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
      update: jest.fn(async (id: string, patch: any) => updates.push({ id, patch })),
    } as any,
    { find: jest.fn(async () => [{ id: 'est-1', nameAr: 'الفرن الذهبي', slug: 'golden-oven-nablus', category: 'BAKERY', currentGrade: 'B', currentRiskScore: 51, lastInspectionAt: null, status: 'ACTIVE' }]) } as any,
    { find: jest.fn(async () => [{ id: 'insp-1', displayNameAr: 'سامي', role: 'INSPECTOR' }]), findOne: jest.fn(async () => ({ id: 'insp-1', role: 'INSPECTOR' })) } as any,
    risk as any,
    audit as any,
  );

  return { service, updates, audit, risk };
}

describe('AdminService.listComplaints', () => {
  it('sorts by age descending with photo-backed complaints pinned above photo-less ones of the same age', async () => {
    const rows = [
      complaint({ id: 'a', hasEvidence: false, createdAt: hoursAgo(50) }),
      complaint({ id: 'b', hasEvidence: true, createdAt: hoursAgo(50) }),
      complaint({ id: 'c', hasEvidence: false, createdAt: hoursAgo(100) }),
    ];
    const { service } = build(rows);

    const result = await service.listComplaints({});

    expect(result.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('groups same-establishment same-category complaints inside 72 hours', async () => {
    const rows = [
      complaint({ id: 'a', category: 'PESTS', createdAt: hoursAgo(70) }),
      complaint({ id: 'b', category: 'PESTS', createdAt: hoursAgo(10) }),
      complaint({ id: 'c', category: 'HYGIENE', createdAt: hoursAgo(10) }),
    ];
    const { service } = build(rows);

    const result = await service.listComplaints({});
    const pests = result.filter((r) => r.category === 'PESTS');

    expect(pests[0].duplicateGroupId).toBe(pests[1].duplicateGroupId);
    expect(result.find((r) => r.id === 'c')!.duplicateGroupId).not.toBe(pests[0].duplicateGroupId);
  });

  it('does not group the same category outside the 72 hour window', async () => {
    const rows = [
      complaint({ id: 'a', category: 'PESTS', createdAt: hoursAgo(200) }),
      complaint({ id: 'b', category: 'PESTS', createdAt: hoursAgo(10) }),
    ];
    const { service } = build(rows);

    const result = await service.listComplaints({});

    expect(result[0].duplicateGroupId).not.toBe(result[1].duplicateGroupId);
  });

  it('includes the complainant contact, which only admins may see', async () => {
    const { service } = build([complaint({ contactPhoneEncrypted: null })]);
    const result = await service.listComplaints({});
    expect('contactPhone' in result[0]).toBe(true);
  });
});

describe('AdminService.reject', () => {
  it('requires a reason from the fixed list', async () => {
    const { service } = build();
    await expect(service.reject('c-1', 'because I said so' as any, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('records the rejection in the audit log with both sides of the change', async () => {
    const { service, audit, updates } = build();

    await service.reject('c-1', 'NOT_FOOD_SAFETY', 'admin-1');

    expect(updates[0].patch).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'NOT_FOOD_SAFETY',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPLAINT_REJECTED',
        actorId: 'admin-1',
        entityId: 'c-1',
      }),
    );
  });

  it('recalculates risk, because a rejected complaint must stop counting', async () => {
    const { service, risk } = build();
    await service.reject('c-1', 'ABUSIVE_OR_SPAM', 'admin-1');
    expect(risk.recalculate).toHaveBeenCalledWith('est-1', 'COMPLAINT');
  });

  it('reports an unknown complaint rather than silently doing nothing', async () => {
    const { service } = build([]);
    await expect(service.reject('missing', 'NOT_FOOD_SAFETY', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminService.markDuplicate', () => {
  it('links the duplicate to its original and audits the merge', async () => {
    const rows = [complaint({ id: 'c-1' }), complaint({ id: 'c-2', reference: '4822' })];
    const { service, updates, audit } = build(rows);

    await service.markDuplicate('c-2', 'c-1', 'admin-1');

    expect(updates[0].patch).toMatchObject({ status: 'DUPLICATE', duplicateOfId: 'c-1' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPLAINT_MARKED_DUPLICATE' }),
    );
  });

  it('refuses to mark a complaint as a duplicate of itself', async () => {
    const { service } = build();
    await expect(service.markDuplicate('c-1', 'c-1', 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AdminService.assign', () => {
  it('moves the complaint to ASSIGNED and audits who did it', async () => {
    const { service, updates, audit } = build();

    await service.assign('c-1', 'insp-1', 'admin-1');

    expect(updates[0].patch).toMatchObject({ status: 'ASSIGNED', assignedInspectorId: 'insp-1' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPLAINT_ASSIGNED' }),
    );
  });
});

describe('AdminService.planning', () => {
  it('ranks establishments by risk and carries the factor breakdown per row', async () => {
    const { service } = build();
    const rows = await service.planning();
    expect(rows[0]).toHaveProperty('factors');
    expect(rows[0]).toHaveProperty('risk');
  });
});

describe('grade integrity', () => {
  it('exposes no method that could write a grade', () => {
    const names = Object.getOwnPropertyNames(AdminService.prototype);
    expect(names.filter((n) => /grade/i.test(n))).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npm run test:api
```

Expected: FAIL — `Cannot find module './admin.service'`.

- [ ] **Step 7: Write the admin DTOs**

Create `apps/api/src/admin/admin.dto.ts`:

```typescript
import type { RiskFactorDto } from '../inspector/inspector.dto';
import type { ComplaintCategory, ComplaintStatus, RejectionReason } from '../complaints/complaint.entity';

export interface AdminComplaintDto {
  id: string;
  reference: string;
  establishmentId: string;
  establishmentNameAr: string;
  category: ComplaintCategory;
  description: string;
  hasEvidence: boolean;
  photoIds: string[];
  /** Admin-only (§3.1). Decrypted on read, never persisted in the clear. */
  contactPhone: string | null;
  ageDays: number;
  status: ComplaintStatus;
  assignedInspectorId: string | null;
  assignedInspectorNameAr: string | null;
  rejectionReason: RejectionReason | null;
  duplicateOfId: string | null;
  /** Shared by every complaint the 72-hour rule groups together (§5.9). */
  duplicateGroupId: string;
  duplicateGroupSize: number;
  createdAt: string;
}

export interface ComplaintFilter {
  status?: ComplaintStatus;
  category?: ComplaintCategory;
  hasEvidence?: boolean;
  establishmentId?: string;
}

export interface PlanningRowDto {
  establishmentId: string;
  slug: string;
  nameAr: string;
  category: string;
  currentGrade: string | null;
  lastInspectionAt: string | null;
  risk: number;
  factors: RiskFactorDto[];
}

export interface InspectorOptionDto {
  id: string;
  displayNameAr: string;
}
```

- [ ] **Step 8: Write the admin service**

Create `apps/api/src/admin/admin.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Complaint, REJECTION_REASONS, type RejectionReason } from '../complaints/complaint.entity';
import { decryptContact } from '../complaints/contact';
import { Establishment } from '../establishments/establishment.entity';
import { User } from '../auth/user.entity';
import { RiskService } from '../risk/risk.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-log.entity';
import type {
  AdminComplaintDto,
  ComplaintFilter,
  InspectorOptionDto,
  PlanningRowDto,
} from './admin.dto';

const DUPLICATE_WINDOW_MS = 72 * 3_600_000;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Complaint) private complaints: Repository<Complaint>,
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    @InjectRepository(User) private users: Repository<User>,
    private risk: RiskService,
    private audit: AuditService,
  ) {}

  async listComplaints(filter: ComplaintFilter): Promise<AdminComplaintDto[]> {
    const where: Record<string, unknown> = {};
    if (filter.status) where.status = filter.status;
    if (filter.category) where.category = filter.category;
    if (filter.hasEvidence !== undefined) where.hasEvidence = filter.hasEvidence;
    if (filter.establishmentId) where.establishmentId = filter.establishmentId;

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
    // photo-less ones of the same age. Same age means the same calendar day —
    // a two-hour gap is not a meaningful ordering signal to a triage clerk.
    return dtos.sort((a, b) => {
      if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays;
      if (a.hasEvidence !== b.hasEvidence) return a.hasEvidence ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  /** Spec §5.9: same establishment, same category, within 72 hours. Grouped
   *  visually here and counted once in the Risk Score by `dedupeComplaints`. */
  private groupDuplicates(
    rows: Complaint[],
  ): Map<string, { groupId: string; size: number }> {
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

  async reject(
    complaintId: string,
    reason: RejectionReason,
    actorId: string,
  ): Promise<void> {
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
   * every one of them refreshes the risk score. A rejected or duplicated
   * complaint must stop counting — otherwise rejecting spam still rewards the
   * spammer (§6.2, §5.9).
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
}
```

- [ ] **Step 9: Write the controller and module**

Create `apps/api/src/admin/admin.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, type AuthedRequest } from '../auth/auth.guard';
import { AdminService } from './admin.service';
import type {
  AdminComplaintDto,
  ComplaintFilter,
  InspectorOptionDto,
  PlanningRowDto,
} from './admin.dto';
import type { RejectionReason } from '../complaints/complaint.entity';

@Controller('api/admin')
@UseGuards(AuthGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('complaints')
  listComplaints(@Query() query: ComplaintFilter): Promise<AdminComplaintDto[]> {
    return this.admin.listComplaints({
      ...query,
      hasEvidence:
        (query as Record<string, unknown>).hasEvidence === undefined
          ? undefined
          : String((query as Record<string, unknown>).hasEvidence) === 'true',
    });
  }

  @Get('inspectors')
  inspectors(): Promise<InspectorOptionDto[]> {
    return this.admin.inspectors();
  }

  @Get('planning')
  planning(): Promise<PlanningRowDto[]> {
    return this.admin.planning();
  }

  @Patch('complaints/:id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      action: 'assign' | 'duplicate' | 'reject' | 'close';
      inspectorId?: string;
      originalId?: string;
      reason?: RejectionReason;
    },
    @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    const actor = req.user!.sub;
    switch (body.action) {
      case 'assign':
        await this.admin.assign(id, body.inspectorId!, actor);
        break;
      case 'duplicate':
        await this.admin.markDuplicate(id, body.originalId!, actor);
        break;
      case 'reject':
        await this.admin.reject(id, body.reason!, actor);
        break;
      case 'close':
        await this.admin.close(id, actor);
        break;
    }
    return { ok: true };
  }
}
```

Create `apps/api/src/admin/admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Complaint } from '../complaints/complaint.entity';
import { Establishment } from '../establishments/establishment.entity';
import { User } from '../auth/user.entity';
import { RiskModule } from '../risk/risk.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [RiskModule, TypeOrmModule.forFeature([Complaint, Establishment, User])],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
```

Register `AdminModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 10: Run the tests**

```bash
npm run test:api
```

Expected: PASS, all suites including `grade-integrity.spec.ts` — if that fails, `AdminService` has grown a method matching its guard. That is the test doing its job; remove the method.

- [ ] **Step 11: Verify against a live database**

```bash
npm run seed && npm run dev:api
```

```bash
ADMIN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@nablus.ps","password":"aman1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")

# an inspector token must be refused by the admin routes
INSP=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"inspector@nablus.ps","password":"aman1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
curl -s -o /dev/null -w "inspector on admin route: %{http_code} (403 expected)\n" \
  http://localhost:3000/api/admin/complaints -H "Authorization: Bearer $INSP"

curl -s http://localhost:3000/api/admin/planning -H "Authorization: Bearer $ADMIN" | node -pe "
JSON.parse(require('fs').readFileSync(0)).map(r => r.nameAr + ' risk=' + r.risk + ' factors=' + r.factors.length).join('\n')"
```

Expected: 403 for the inspector, and a risk-ranked planning list with four factors per row.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/audit apps/api/src/admin apps/api/src/app.module.ts
git commit -m "feat: append-only audit log and admin complaint triage with duplicate detection"
```

---

## Task 6: Admin triage and planning screens

Desktop-first (§5.8). `/admin/planning` is the screen the demo cuts to at minute 3 to show that the complaint moved the queue and not the grade — it carries the whole argument, so the factor breakdown must be visible without a hover.

**Files:**
- Create: `apps/web/src/app/admin/admin.service.ts`
- Create: `apps/web/src/app/admin/admin-shell.component.ts`
- Create: `apps/web/src/app/admin/complaints.component.ts`
- Create: `apps/web/src/app/admin/complaints.component.html`
- Create: `apps/web/src/app/admin/complaints.component.css`
- Create: `apps/web/src/app/admin/planning.component.ts`
- Create: `apps/web/src/app/ui/risk-factors.component.ts`
- Modify: `apps/web/src/app/core/strings.ts`
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/app/core/api.ts`

**Interfaces:**
- Consumes: `GET /api/admin/complaints`, `/inspectors`, `/planning`, `PATCH /api/admin/complaints/:id` (Task 5); `AuthService` from `../core/api`.
- Produces: routes `/admin/complaints`, `/admin/planning`; `RiskFactorsComponent` (`factors` input) reused by the inspector queue.

---

- [ ] **Step 1: Add an admin route guard**

In `apps/web/src/app/app.routes.ts`, add beside the existing `signedIn` guard:

```typescript
const isAdmin = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isSignedIn()) return router.createUrlTree(['/app/login']);
  return auth.user()?.role === 'ADMIN' ? true : router.createUrlTree(['/app/today']);
};
```

- [ ] **Step 2: Add the copy**

In `apps/web/src/app/core/strings.ts`, add a top-level `admin` block after `sync`:

```typescript
  admin: {
    title: 'إدارة البلدية',
    navComplaints: 'الشكاوى',
    navPlanning: 'خطة التفتيش',
    loadFailed: 'تعذّر تحميل البيانات.',

    complaints: {
      title: 'فرز الشكاوى',
      empty: 'لا توجد شكاوى مطابقة.',
      reference: 'الرقم المرجعي',
      establishment: 'المنشأة',
      category: 'النوع',
      evidence: 'صورة',
      age: 'العمر',
      status: 'الحالة',
      assigned: 'المفتش',
      contact: 'هاتف مقدّم الشكوى',
      contactNone: 'لم يُترك رقم',
      contactWarning: 'بيانات مقدّم الشكوى لا تظهر لصاحب المنشأة ولا للمفتش.',
      hasPhoto: 'بصورة',
      noPhoto: 'بلا صورة',
      duplicateGroup: 'شكاوى مجمّعة',
      duplicateNote: 'شكاوى عن المنشأة نفسها والنوع نفسه خلال 72 ساعة — تُحتسب مرة واحدة.',
      filterAll: 'الكل',
      filterStatus: 'الحالة',
      filterCategory: 'النوع',
      filterEvidence: 'الأدلة',
      actionAssign: 'إسناد إلى مفتش',
      actionDuplicate: 'تعليم كمكرّرة',
      actionReject: 'رفض',
      actionClose: 'إغلاق',
      chooseInspector: 'اختر مفتشاً',
      chooseOriginal: 'اختر الشكوى الأصلية',
      chooseReason: 'اختر سبب الرفض',
      confirmReject: 'سيُسجَّل الرفض في سجل التدقيق باسمك. هل تريد المتابعة؟',
      reason: {
        OUT_OF_JURISDICTION: 'خارج اختصاص البلدية',
        INSUFFICIENT_DETAIL: 'التفاصيل غير كافية',
        NOT_FOOD_SAFETY: 'لا تتعلق بسلامة الغذاء',
        ESTABLISHMENT_CLOSED: 'المنشأة مغلقة',
        ABUSIVE_OR_SPAM: 'مسيئة أو عشوائية',
      } as Record<string, string>,
      status: {
        SUBMITTED: 'مستلمة',
        UNDER_REVIEW: 'قيد المراجعة',
        ASSIGNED: 'مُسندة',
        INSPECTED: 'تم التفتيش',
        CLOSED: 'مغلقة',
        DUPLICATE: 'مكرّرة',
        REJECTED: 'مرفوضة',
      } as Record<string, string>,
    },

    planning: {
      title: 'خطة التفتيش حسب الأولوية',
      lede: 'الترتيب محسوب من صيغة معلنة، وكل عامل ظاهر مع وزنه.',
      establishment: 'المنشأة',
      risk: 'درجة الأولوية',
      grade: 'الدرجة الحالية',
      lastInspection: 'آخر تفتيش',
      never: 'لم يُفتَّش',
      breakdown: 'تفصيل العوامل',
      weight: 'الوزن',
      contribution: 'المساهمة',
      refresh: 'إعادة احتساب الأولويات',
      empty: 'لا توجد منشآت نشطة.',
      gradeNote: 'الأولوية ترتّب الزيارات فقط. الدرجة لا تتغير إلا بتفتيش.',
    },
  },
```

- [ ] **Step 3: Write the admin API client**

Create `apps/web/src/app/admin/admin.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE, AuthService } from '../core/api';

export interface RiskFactor {
  key: string;
  normalized: number;
  weight: number;
  contribution: number;
  labelAr: string;
  detailAr: string;
}

export interface AdminComplaint {
  id: string;
  reference: string;
  establishmentId: string;
  establishmentNameAr: string;
  category: string;
  description: string;
  hasEvidence: boolean;
  photoIds: string[];
  contactPhone: string | null;
  ageDays: number;
  status: string;
  assignedInspectorId: string | null;
  assignedInspectorNameAr: string | null;
  rejectionReason: string | null;
  duplicateOfId: string | null;
  duplicateGroupId: string;
  duplicateGroupSize: number;
  createdAt: string;
}

export interface PlanningRow {
  establishmentId: string;
  slug: string;
  nameAr: string;
  category: string;
  currentGrade: string | null;
  lastInspectionAt: string | null;
  risk: number;
  factors: RiskFactor[];
}

export interface InspectorOption {
  id: string;
  displayNameAr: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private get options() {
    return { headers: this.auth.authHeaders() };
  }

  listComplaints(filter: Record<string, string> = {}): Promise<AdminComplaint[]> {
    const query = new URLSearchParams(filter).toString();
    return firstValueFrom(
      this.http.get<AdminComplaint[]>(
        `${API_BASE}/api/admin/complaints${query ? `?${query}` : ''}`,
        this.options,
      ),
    );
  }

  inspectors(): Promise<InspectorOption[]> {
    return firstValueFrom(
      this.http.get<InspectorOption[]>(`${API_BASE}/api/admin/inspectors`, this.options),
    );
  }

  planning(): Promise<PlanningRow[]> {
    return firstValueFrom(
      this.http.get<PlanningRow[]>(`${API_BASE}/api/admin/planning`, this.options),
    );
  }

  act(
    id: string,
    body: {
      action: 'assign' | 'duplicate' | 'reject' | 'close';
      inspectorId?: string;
      originalId?: string;
      reason?: string;
    },
  ): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.patch<{ ok: true }>(`${API_BASE}/api/admin/complaints/${id}`, body, this.options),
    );
  }
}
```

- [ ] **Step 4: Build the reusable factor breakdown**

Create `apps/web/src/app/ui/risk-factors.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { T } from '../core/strings';

export interface RiskFactorView {
  key: string;
  normalized: number;
  weight: number;
  contribution: number;
  labelAr: string;
  detailAr: string;
}

/**
 * Spec §6.2: the breakdown, not just the number. A number without its
 * derivation is not auditable, and an unauditable number has no place in a
 * regulatory system — so this is a table, not a tooltip.
 */
@Component({
  selector: 'app-risk-factors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="factors">
      <thead>
        <tr>
          <th scope="col">{{ t.admin.planning.breakdown }}</th>
          <th scope="col" class="num">{{ t.queue.riskLabel }}</th>
          <th scope="col" class="num">{{ t.admin.planning.weight }}</th>
          <th scope="col" class="num">{{ t.admin.planning.contribution }}</th>
        </tr>
      </thead>
      <tbody>
        @for (factor of factors(); track factor.key) {
          <tr>
            <th scope="row">
              <span class="factors__label">{{ factor.labelAr }}</span>
              <span class="factors__detail">{{ factor.detailAr }}</span>
            </th>
            <td class="num ltr">{{ factor.normalized }}</td>
            <td class="num ltr">{{ factor.weight }}%</td>
            <td class="num ltr">{{ factor.contribution.toFixed(1) }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [
    `
      .factors {
        inline-size: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .factors th,
      .factors td {
        padding: var(--s2) var(--s3);
        text-align: start;
        border-block-end: 1px solid var(--rule);
        vertical-align: top;
        font-weight: 400;
      }

      .factors thead th {
        font-size: 11px;
        font-weight: 700;
        color: var(--ink-muted);
        letter-spacing: 0.03em;
      }

      .factors tbody tr:last-child th,
      .factors tbody tr:last-child td {
        border-block-end: 0;
      }

      .factors__label {
        display: block;
        font-weight: 700;
        color: var(--ink);
      }

      .factors__detail {
        display: block;
        color: var(--ink-muted);
      }

      .num {
        text-align: end;
        white-space: nowrap;
      }
    `,
  ],
})
export class RiskFactorsComponent {
  readonly t = T;
  readonly factors = input.required<RiskFactorView[]>();
}
```

- [ ] **Step 5: Build the admin shell**

Create `apps/web/src/app/admin/admin-shell.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/api';
import { T } from '../core/strings';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="bar">
      <div class="bar__inner">
        <span class="bar__mark">{{ t.app.name }}</span>
        <span class="bar__divider" aria-hidden="true"></span>
        <span class="bar__title">{{ t.admin.title }}</span>

        <nav class="bar__nav">
          <a routerLink="/admin/complaints" routerLinkActive="on">{{ t.admin.navComplaints }}</a>
          <a routerLink="/admin/planning" routerLinkActive="on">{{ t.admin.navPlanning }}</a>
        </nav>

        <span class="bar__user">{{ auth.user()?.displayNameAr }}</span>
        <button type="button" class="bar__signout" (click)="auth.signOut()">
          {{ t.auth.signOut }}
        </button>
      </div>
    </header>

    <router-outlet />
  `,
  styles: [
    `
      :host {
        display: block;
        min-block-size: 100dvh;
        background: var(--paper);
      }

      .bar {
        background: var(--ink);
        color: #fff;
        border-block-end: 3px solid var(--primary);
      }

      .bar__inner {
        max-inline-size: 1180px;
        margin-inline: auto;
        padding: var(--s3) var(--s5);
        display: flex;
        align-items: center;
        gap: var(--s4);
      }

      .bar__mark {
        font-size: var(--text-lede);
        font-weight: 700;
      }

      .bar__divider {
        inline-size: 1px;
        block-size: 18px;
        background: rgba(255, 255, 255, 0.28);
      }

      .bar__title {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.82);
      }

      .bar__nav {
        display: flex;
        gap: var(--s2);
        margin-inline-start: var(--s5);
      }

      .bar__nav a {
        padding: var(--s2) var(--s3);
        border-radius: var(--radius);
        color: rgba(255, 255, 255, 0.82);
        text-decoration: none;
        font-size: var(--text-caption);
      }

      .bar__nav a.on {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        font-weight: 700;
      }

      .bar__user {
        margin-inline-start: auto;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.72);
      }

      .bar__signout {
        background: none;
        border: 0;
        color: rgba(255, 255, 255, 0.86);
        text-decoration: underline;
        cursor: pointer;
      }
    `,
  ],
})
export class AdminShellComponent {
  readonly t = T;
  readonly auth = inject(AuthService);
}
```

- [ ] **Step 6: Build the planning screen**

Create `apps/web/src/app/admin/planning.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RiskBadgeComponent } from '../ui/risk-badge.component';
import { RiskFactorsComponent } from '../ui/risk-factors.component';
import { AdminService, type PlanningRow } from './admin.service';
import { T } from '../core/strings';

@Component({
  selector: 'app-admin-planning',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, RiskBadgeComponent, RiskFactorsComponent],
  template: `
    <main class="page">
      <div class="page__head">
        <div>
          <h1 class="page__title">{{ t.admin.planning.title }}</h1>
          <p class="page__lede">{{ t.admin.planning.lede }}</p>
        </div>
        <button type="button" class="btn btn--ghost" (click)="load()" [disabled]="busy()">
          {{ t.admin.planning.refresh }}
        </button>
      </div>

      <p class="grade-note">{{ t.admin.planning.gradeNote }}</p>

      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      } @else if (busy() && rows().length === 0) {
        <p class="muted">{{ t.common.loading }}</p>
      } @else if (rows().length === 0) {
        <p class="muted">{{ t.admin.planning.empty }}</p>
      }

      <ol class="rows">
        @for (row of rows(); track row.establishmentId; let i = $index) {
          <li class="row">
            <div class="row__head">
              <span class="row__rank ltr">{{ i + 1 }}</span>
              <div class="row__id">
                <a class="row__name" [routerLink]="['/e', row.slug]">{{ row.nameAr }}</a>
                <p class="row__meta">
                  {{ t.admin.planning.lastInspection }}:
                  @if (row.lastInspectionAt) {
                    <span class="ltr">{{ row.lastInspectionAt | date: 'yyyy-MM-dd' }}</span>
                  } @else {
                    {{ t.admin.planning.never }}
                  }
                </p>
              </div>
              <app-risk-badge [value]="row.risk" />
              <button
                type="button"
                class="row__toggle"
                [attr.aria-expanded]="expanded() === row.establishmentId"
                (click)="toggle(row.establishmentId)"
              >
                {{ t.admin.planning.breakdown }}
              </button>
            </div>

            @if (expanded() === row.establishmentId) {
              <div class="row__breakdown">
                <app-risk-factors [factors]="row.factors" />
              </div>
            }
          </li>
        }
      </ol>
    </main>
  `,
  styles: [
    `
      .page {
        max-inline-size: 1180px;
        margin-inline: auto;
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .page__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s4);
      }

      .page__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }

      .page__lede {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }

      .grade-note {
        padding: var(--s3);
        background: var(--inset);
        border: 1px solid var(--rule);
        border-radius: var(--radius);
        font-size: 13px;
        color: var(--ink-2);
      }

      .muted {
        color: var(--ink-muted);
        font-size: var(--text-caption);
      }

      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      .row {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
      }

      .row__head {
        display: flex;
        align-items: center;
        gap: var(--s4);
        padding: var(--s3) var(--s4);
      }

      .row__rank {
        flex: none;
        inline-size: 26px;
        block-size: 26px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--ink);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
      }

      .row__id {
        flex: 1;
        min-inline-size: 0;
      }

      .row__name {
        font-size: var(--text-body);
        font-weight: 700;
        color: var(--ink);
        text-decoration: none;
      }

      .row__meta {
        font-size: 12px;
        color: var(--ink-muted);
      }

      .row__toggle {
        min-block-size: 34px;
        padding: 0 var(--s3);
        border: 1px solid var(--rule-strong);
        border-radius: var(--radius);
        background: transparent;
        font-size: 13px;
        cursor: pointer;
      }

      .row__breakdown {
        padding: var(--s3) var(--s4) var(--s4);
        border-block-start: 1px solid var(--rule);
        background: var(--inset);
      }
    `,
  ],
})
export class AdminPlanningComponent {
  readonly t = T;
  private admin = inject(AdminService);

  readonly rows = signal<PlanningRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly expanded = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.admin.planning());
    } catch {
      this.error.set(T.admin.loadFailed);
    } finally {
      this.busy.set(false);
    }
  }

  toggle(id: string): void {
    this.expanded.update((current) => (current === id ? null : id));
  }
}
```

- [ ] **Step 7: Build the triage template**

Create `apps/web/src/app/admin/complaints.component.html`:

```html
<main class="page">
  <div class="page__head">
    <h1 class="page__title">{{ t.admin.complaints.title }}</h1>

    <div class="filters">
      <label class="filter">
        <span>{{ t.admin.complaints.filterStatus }}</span>
        <select [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value); load()">
          <option value="">{{ t.admin.complaints.filterAll }}</option>
          @for (option of statuses; track option) {
            <option [value]="option">{{ t.admin.complaints.status[option] }}</option>
          }
        </select>
      </label>

      <label class="filter">
        <span>{{ t.admin.complaints.filterEvidence }}</span>
        <select [value]="evidenceFilter()" (change)="evidenceFilter.set($any($event.target).value); load()">
          <option value="">{{ t.admin.complaints.filterAll }}</option>
          <option value="true">{{ t.admin.complaints.hasPhoto }}</option>
          <option value="false">{{ t.admin.complaints.noPhoto }}</option>
        </select>
      </label>
    </div>
  </div>

  <p class="privacy">{{ t.admin.complaints.contactWarning }}</p>

  @if (error()) {
    <p class="notice" role="alert">{{ error() }}</p>
  } @else if (busy() && rows().length === 0) {
    <p class="muted">{{ t.common.loading }}</p>
  } @else if (rows().length === 0) {
    <p class="muted">{{ t.admin.complaints.empty }}</p>
  }

  <ul class="rows">
    @for (row of rows(); track row.id) {
      <li
        class="row"
        [class.row--grouped]="row.duplicateGroupSize > 1"
        [class.row--closed]="row.status === 'REJECTED' || row.status === 'DUPLICATE'"
      >
        <div class="row__main">
          <span class="row__ref ltr">#{{ row.reference }}</span>

          <div class="row__body">
            <p class="row__establishment">{{ row.establishmentNameAr }}</p>
            <p class="row__category">{{ t.complaint.category[row.category] }}</p>
            <p class="row__description">{{ row.description }}</p>

            @if (row.duplicateGroupSize > 1) {
              <p class="row__group">
                {{ t.admin.complaints.duplicateGroup }}:
                <span class="ltr">{{ row.duplicateGroupSize }}</span>
                — {{ t.admin.complaints.duplicateNote }}
              </p>
            }
          </div>

          <div class="row__facts">
            <span class="badge" [class.badge--on]="row.hasEvidence">
              {{ row.hasEvidence ? t.admin.complaints.hasPhoto : t.admin.complaints.noPhoto }}
            </span>
            <span class="row__age">
              {{ t.admin.complaints.age }}: <span class="ltr">{{ row.ageDays }}</span>
            </span>
            <span class="row__status">{{ t.admin.complaints.status[row.status] }}</span>
            <span class="row__contact">
              {{ t.admin.complaints.contact }}:
              @if (row.contactPhone) {
                <span class="ltr">{{ row.contactPhone }}</span>
              } @else {
                {{ t.admin.complaints.contactNone }}
              }
            </span>
            @if (row.assignedInspectorNameAr) {
              <span class="row__assigned">
                {{ t.admin.complaints.assigned }}: {{ row.assignedInspectorNameAr }}
              </span>
            }
            @if (row.rejectionReason) {
              <span class="row__reason">{{ t.admin.complaints.reason[row.rejectionReason] }}</span>
            }
          </div>
        </div>

        @if (row.status !== 'REJECTED' && row.status !== 'DUPLICATE' && row.status !== 'CLOSED') {
          <div class="row__actions">
            <select #inspector>
              <option value="">{{ t.admin.complaints.chooseInspector }}</option>
              @for (option of inspectors(); track option.id) {
                <option [value]="option.id">{{ option.displayNameAr }}</option>
              }
            </select>
            <button type="button" class="btn btn--sm" [disabled]="acting() === row.id" (click)="assign(row, inspector.value)">
              {{ t.admin.complaints.actionAssign }}
            </button>

            <select #reason>
              <option value="">{{ t.admin.complaints.chooseReason }}</option>
              @for (option of rejectionReasons; track option) {
                <option [value]="option">{{ t.admin.complaints.reason[option] }}</option>
              }
            </select>
            <button type="button" class="btn btn--sm btn--ghost" [disabled]="acting() === row.id" (click)="reject(row, reason.value)">
              {{ t.admin.complaints.actionReject }}
            </button>

            <button type="button" class="btn btn--sm btn--ghost" [disabled]="acting() === row.id" (click)="close(row)">
              {{ t.admin.complaints.actionClose }}
            </button>
          </div>
        }
      </li>
    }
  </ul>
</main>
```

- [ ] **Step 8: Write the triage component**

Create `apps/web/src/app/admin/complaints.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AdminService, type AdminComplaint, type InspectorOption } from './admin.service';
import { T } from '../core/strings';

const REJECTION_REASONS = [
  'OUT_OF_JURISDICTION',
  'INSUFFICIENT_DETAIL',
  'NOT_FOOD_SAFETY',
  'ESTABLISHMENT_CLOSED',
  'ABUSIVE_OR_SPAM',
];

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'INSPECTED', 'CLOSED', 'DUPLICATE', 'REJECTED'];

@Component({
  selector: 'app-admin-complaints',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './complaints.component.html',
  styleUrl: './complaints.component.css',
})
export class AdminComplaintsComponent {
  readonly t = T;
  readonly rejectionReasons = REJECTION_REASONS;
  readonly statuses = STATUSES;

  private admin = inject(AdminService);

  readonly rows = signal<AdminComplaint[]>([]);
  readonly inspectors = signal<InspectorOption[]>([]);
  readonly busy = signal(false);
  readonly acting = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly statusFilter = signal('');
  readonly evidenceFilter = signal('');

  constructor() {
    void this.load();
    void this.loadInspectors();
  }

  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const filter: Record<string, string> = {};
      if (this.statusFilter()) filter['status'] = this.statusFilter();
      if (this.evidenceFilter()) filter['hasEvidence'] = this.evidenceFilter();
      this.rows.set(await this.admin.listComplaints(filter));
    } catch {
      this.error.set(T.admin.loadFailed);
    } finally {
      this.busy.set(false);
    }
  }

  private async loadInspectors(): Promise<void> {
    try {
      this.inspectors.set(await this.admin.inspectors());
    } catch {
      this.inspectors.set([]);
    }
  }

  async assign(row: AdminComplaint, inspectorId: string): Promise<void> {
    if (!inspectorId) return;
    await this.act(row, { action: 'assign', inspectorId });
  }

  async reject(row: AdminComplaint, reason: string): Promise<void> {
    // A rejection is permanent and attributed — say so before it happens.
    if (!reason || !confirm(T.admin.complaints.confirmReject)) return;
    await this.act(row, { action: 'reject', reason });
  }

  async close(row: AdminComplaint): Promise<void> {
    await this.act(row, { action: 'close' });
  }

  private async act(
    row: AdminComplaint,
    body: { action: 'assign' | 'duplicate' | 'reject' | 'close'; inspectorId?: string; reason?: string },
  ): Promise<void> {
    this.acting.set(row.id);
    this.error.set(null);
    try {
      await this.admin.act(row.id, body);
      await this.load();
    } catch (error) {
      const message = (error as { error?: { message?: string } })?.error?.message;
      this.error.set(message ?? T.admin.loadFailed);
    } finally {
      this.acting.set(null);
    }
  }
}
```

- [ ] **Step 9: Write the triage styles**

Create `apps/web/src/app/admin/complaints.component.css`:

```css
.page {
  max-inline-size: 1180px;
  margin-inline: auto;
  padding: var(--s5);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}

.page__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s4);
  flex-wrap: wrap;
}

.page__title {
  font-size: var(--text-title);
  font-weight: 700;
  color: var(--ink);
}

.filters {
  display: flex;
  gap: var(--s3);
}

.filter {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  font-size: 12px;
  color: var(--ink-muted);
}

.filter select,
.row__actions select {
  min-block-size: 34px;
  padding: 0 var(--s2);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--card);
  font: inherit;
  font-size: 13px;
}

.privacy {
  padding: var(--s3);
  background: var(--inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--ink-2);
}

.muted {
  color: var(--ink-muted);
  font-size: var(--text-caption);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.row {
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

/* Grouped duplicates get a tinted ground rather than a coloured edge, so the
   grouping reads as one block without inventing a second accent device. */
.row--grouped {
  background: var(--inset);
}

.row--closed {
  opacity: 0.72;
}

.row__main {
  display: flex;
  align-items: flex-start;
  gap: var(--s4);
}

.row__ref {
  flex: none;
  font-size: var(--text-lede);
  font-weight: 700;
  color: var(--ink);
}

.row__body {
  flex: 1;
  min-inline-size: 0;
}

.row__establishment {
  font-weight: 700;
  color: var(--ink);
}

.row__category {
  font-size: 13px;
  color: var(--ink-muted);
}

.row__description {
  margin-block-start: var(--s2);
  font-size: var(--text-caption);
  line-height: 1.6;
}

.row__group {
  margin-block-start: var(--s2);
  font-size: 12px;
  color: var(--attention);
}

.row__facts {
  flex: none;
  inline-size: 260px;
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  font-size: 12px;
  color: var(--ink-muted);
}

.badge {
  align-self: flex-start;
  padding: 1px var(--s2);
  border-radius: 3px;
  background: var(--inset);
  border: 1px solid var(--rule);
  font-weight: 700;
}

.badge--on {
  background: var(--ok-bg);
  border-color: transparent;
  color: var(--ok);
}

.row__reason {
  color: var(--danger);
  font-weight: 700;
}

.row__actions {
  display: flex;
  align-items: center;
  gap: var(--s2);
  flex-wrap: wrap;
  padding-block-start: var(--s3);
  border-block-start: 1px solid var(--rule);
}

.btn--sm {
  min-height: 34px;
  padding: 0 var(--s3);
  font-size: 13px;
}
```

- [ ] **Step 10: Register the routes**

In `apps/web/src/app/app.routes.ts`, add before the wildcard:

```typescript
  {
    path: 'admin',
    component: AdminShellComponent,
    canActivate: [isAdmin],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'complaints' },
      { path: 'complaints', component: AdminComplaintsComponent },
      { path: 'planning', component: AdminPlanningComponent },
    ],
  },
```

with the imports:

```typescript
import { AdminShellComponent } from './admin/admin-shell.component';
import { AdminComplaintsComponent } from './admin/complaints.component';
import { AdminPlanningComponent } from './admin/planning.component';
```

- [ ] **Step 11: Build and verify in a browser**

```bash
npm run build --workspace=apps/web
```

At 1280px, signed in as `admin@nablus.ps` / `aman1234`:

1. Open `/admin/planning`. Expand a breakdown and confirm all four factors show normalized value, weight and contribution, and that the contributions sum to roughly the total.
2. Open `/admin/complaints`. File a complaint from the public form in another tab, refresh, and confirm it appears at the correct position.
3. File a second complaint on the same establishment with the same category inside 72 hours and confirm both rows show the grouped treatment and a group size of 2.
4. Reject one with a reason and confirm the row moves to the rejected treatment.
5. Return to `/admin/planning` and confirm the risk dropped — a rejected complaint must stop counting.
6. Sign in as the inspector and confirm `/admin/planning` redirects to `/app/today`.
7. Console clean throughout.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/app/admin apps/web/src/app/ui/risk-factors.component.ts \
  apps/web/src/app/app.routes.ts apps/web/src/app/core/strings.ts
git commit -m "feat: admin complaint triage and risk-ranked planning screens"
```

---

## Task 7: Owner portal, fix verification, and the demo dataset

Turn a punishment into a to-do list (§5.7). The invariant that carries this task: an owner uploading proof and an inspector verifying it both leave the grade untouched — only the next inspection re-scores (§6.4).

**Files:**
- Create: `apps/api/src/owner/owner.dto.ts`
- Create: `apps/api/src/owner/owner.service.ts`
- Create: `apps/api/src/owner/owner.controller.ts`
- Create: `apps/api/src/owner/owner.module.ts`
- Create: `apps/api/src/owner/owner.service.spec.ts`
- Create: `apps/web/src/app/owner/owner.service.ts`
- Create: `apps/web/src/app/owner/portal.component.ts`
- Create: `apps/web/src/app/owner/portal.component.html`
- Create: `apps/web/src/app/owner/portal.component.css`
- Modify: `apps/api/src/establishments/violation.entity.ts`
- Modify: `apps/api/src/inspector/inspector.service.ts`
- Modify: `apps/api/src/inspector/inspector.controller.ts`
- Modify: `apps/api/src/establishments/establishments.service.ts`
- Modify: `apps/api/src/seed.ts`
- Modify: `apps/web/src/app/core/strings.ts`
- Modify: `apps/web/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AuthGuard`, `Roles`; `AuditService.record` (Task 5); `RiskService.recalculate` (Task 2); `StatusStepperComponent` (Task 4).
- Produces: `OwnerService.overview(userEstablishmentId)`, `.respond(violationId, dto, userEstablishmentId)`; `InspectorService.verifyViolation(violationId, inspectorId)`; route `/portal`.

---

- [ ] **Step 1: Extend the violation entity**

In `apps/api/src/establishments/violation.entity.ts`, add after `respondedAt`:

```typescript
  /** The owner's written response (§5.7, §7.1). Visible to admins and
   *  inspectors; the public page shows only that a response exists. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  ownerResponse!: string | null;

  /** Upload ids proving the fix — photo, and optionally an invoice. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  evidencePhotoIds!: string | null;

  @Column({ type: 'varchar', nullable: true })
  verifiedById!: string | null;

  @Column({ type: 'datetime', nullable: true })
  verifiedAt!: Date | null;
```

- [ ] **Step 2: Write the failing owner test**

Create `apps/api/src/owner/owner.service.spec.ts`:

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnerService } from './owner.service';

function violation(over: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    establishmentId: 'est-1',
    inspectionId: 'i-1',
    category: 'التخزين البارد',
    severity: 'CRITICAL',
    recommendation: 'اضبط التبريد',
    deadlineAt: new Date('2026-08-21T00:00:00Z'),
    status: 'OPEN',
    ownerResponse: null,
    evidencePhotoIds: null,
    respondedAt: null,
    verifiedById: null,
    verifiedAt: null,
    ...over,
  };
}

function build(rows: any[] = [violation()]) {
  const updates: any[] = [];
  const audit = { record: jest.fn(async () => undefined) };

  const service = new OwnerService(
    {
      findOne: jest.fn(async ({ where }: any) => ({
        id: where.id,
        nameAr: 'الفرن الذهبي',
        slug: 'golden-oven-nablus',
        currentGrade: 'C',
        currentScore: 79,
        lastInspectionAt: new Date('2026-08-07T00:00:00Z'),
      })),
    } as any,
    {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
      update: jest.fn(async (id: string, patch: any) => updates.push({ id, patch })),
    } as any,
    audit as any,
  );

  return { service, updates, audit };
}

describe('OwnerService.overview', () => {
  it('scopes to the establishment on the token', async () => {
    const { service } = build();
    const result = await service.overview('est-1');
    expect(result.establishment.nameAr).toBe('الفرن الذهبي');
    expect(result.openViolations).toHaveLength(1);
  });

  it('never exposes anything about who complained', async () => {
    const { service } = build();
    const serialized = JSON.stringify(await service.overview('est-1'));
    expect(serialized).not.toContain('ipHash');
    expect(serialized).not.toContain('contactPhone');
    expect(serialized).not.toContain('complaint');
  });

  it('separates open items from those resolved this quarter', async () => {
    const { service } = build([
      violation({ id: 'v-1', status: 'OPEN' }),
      violation({ id: 'v-2', status: 'VERIFIED', verifiedAt: new Date() }),
    ]);
    const result = await service.overview('est-1');
    expect(result.openViolations.map((v) => v.id)).toEqual(['v-1']);
    expect(result.resolvedViolations.map((v) => v.id)).toEqual(['v-2']);
  });
});

describe('OwnerService.respond', () => {
  it('moves the violation to awaiting verification and records the evidence', async () => {
    const { service, updates } = build();

    await service.respond('v-1', { note: 'تم استبدال الوحدة', photoIds: ['p1.jpg'] }, 'est-1');

    expect(updates[0].patch).toMatchObject({
      status: 'OWNER_RESPONDED',
      ownerResponse: 'تم استبدال الوحدة',
      evidencePhotoIds: 'p1.jpg',
    });
    expect(updates[0].patch.respondedAt).toBeInstanceOf(Date);
  });

  it('does not touch the grade — only an inspection can (§6.4)', async () => {
    const { service, updates } = build();
    await service.respond('v-1', { note: 'تم', photoIds: [] }, 'est-1');
    const patch = updates[0].patch;
    expect('currentGrade' in patch).toBe(false);
    expect('grade' in patch).toBe(false);
    expect('score' in patch).toBe(false);
  });

  it('refuses a violation belonging to another establishment', async () => {
    // Spec §11: owner endpoints resolve the establishment from the JWT, never
    // from a parameter. Owner A must not reach establishment B.
    const { service } = build([violation({ establishmentId: 'est-2' })]);
    await expect(
      service.respond('v-1', { note: 'x', photoIds: [] }, 'est-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports an unknown violation', async () => {
    const { service } = build([]);
    await expect(
      service.respond('missing', { note: 'x', photoIds: [] }, 'est-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes no method that could write a grade', () => {
    const names = Object.getOwnPropertyNames(OwnerService.prototype);
    expect(names.filter((n) => /grade|score/i.test(n))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npm run test:api
```

Expected: FAIL — `Cannot find module './owner.service'`.

- [ ] **Step 4: Write the owner DTOs and service**

Create `apps/api/src/owner/owner.dto.ts`:

```typescript
export interface OwnerViolationDto {
  id: string;
  category: string;
  severity: string;
  recommendation: string | null;
  deadlineAt: string | null;
  status: string;
  ownerResponse: string | null;
  respondedAt: string | null;
  verifiedAt: string | null;
  overdue: boolean;
}

export interface OwnerOverviewDto {
  establishment: {
    nameAr: string;
    slug: string;
    currentGrade: string | null;
    currentScore: number | null;
    lastInspectionAt: string | null;
  };
  openViolations: OwnerViolationDto[];
  resolvedViolations: OwnerViolationDto[];
}

export interface RespondDto {
  note: string;
  photoIds: string[];
}
```

Create `apps/api/src/owner/owner.service.ts`:

```typescript
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { AuditService } from '../audit/audit.service';
import type { OwnerOverviewDto, OwnerViolationDto, RespondDto } from './owner.dto';

const OPEN_STATUSES = ['OPEN', 'OWNER_RESPONDED', 'OVERDUE'];

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
      overdue:
        v.status === 'OPEN' && v.deadlineAt !== null && v.deadlineAt.getTime() < now,
    });

    return {
      establishment: {
        nameAr: establishment.nameAr,
        slug: establishment.slug,
        currentGrade: establishment.currentGrade,
        currentScore: establishment.currentScore,
        lastInspectionAt: establishment.lastInspectionAt?.toISOString() ?? null,
      },
      openViolations: rows.filter((v) => OPEN_STATUSES.includes(v.status)).map(toDto),
      resolvedViolations: rows
        .filter((v) => v.status === 'VERIFIED' || v.status === 'CLOSED')
        .map(toDto),
    };
  }

  /**
   * The owner's response appears on the public page immediately as "owner
   * responded" — but the grade does not change until an inspector verifies,
   * and even then only the next inspection re-scores (§5.7, §6.4).
   */
  async respond(
    violationId: string,
    dto: RespondDto,
    establishmentId: string,
  ): Promise<void> {
    const violation = await this.violations.findOne({ where: { id: violationId } });
    if (!violation) throw new NotFoundException('المخالفة غير موجودة.');
    // Scope from the token, never from a parameter (§11).
    if (violation.establishmentId !== establishmentId) {
      throw new ForbiddenException('هذه المخالفة لا تخص منشأتك.');
    }

    await this.violations.update(violationId, {
      status: 'OWNER_RESPONDED',
      ownerResponse: dto.note?.trim() || null,
      evidencePhotoIds: dto.photoIds?.length ? dto.photoIds.join(',') : null,
      respondedAt: new Date(),
    });

    await this.audit.record({
      actorId: `owner:${establishmentId}`,
      action: 'VIOLATION_OWNER_RESPONDED',
      entityType: 'violation',
      entityId: violationId,
      before: { status: violation.status },
      after: { status: 'OWNER_RESPONDED' },
    });
  }
}
```

- [ ] **Step 5: Write the owner controller and module**

Create `apps/api/src/owner/owner.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { AuthGuard, Roles, type AuthedRequest } from '../auth/auth.guard';
import { OwnerService } from './owner.service';
import type { OwnerOverviewDto, RespondDto } from './owner.dto';

@Controller('api/owner')
@UseGuards(AuthGuard)
@Roles('OWNER')
export class OwnerController {
  constructor(private readonly owner: OwnerService) {}

  /** Spec §8.3: scoped to the token's establishment. Reject any id parameter. */
  private scope(req: AuthedRequest): string {
    const establishmentId = req.user?.establishmentId;
    if (!establishmentId) throw new ForbiddenException('لا توجد منشأة مرتبطة بهذا الحساب.');
    return establishmentId;
  }

  @Get('establishment')
  overview(@Req() req: AuthedRequest): Promise<OwnerOverviewDto> {
    return this.owner.overview(this.scope(req));
  }

  @Post('violations/:id/respond')
  async respond(
    @Param('id') id: string,
    @Body() dto: RespondDto,
    @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    await this.owner.respond(id, dto, this.scope(req));
    return { ok: true };
  }
}
```

Create `apps/api/src/owner/owner.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from '../establishments/establishment.entity';
import { Violation } from '../establishments/violation.entity';
import { OwnerService } from './owner.service';
import { OwnerController } from './owner.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment, Violation])],
  providers: [OwnerService],
  controllers: [OwnerController],
})
export class OwnerModule {}
```

Register `OwnerModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 6: Add fix verification to the inspector service**

In `apps/api/src/inspector/inspector.service.ts`, add this method after `submitInspection`:

```typescript
  /**
   * Spec §6.4: verifying a fix closes the violation but does NOT raise the
   * grade. Grades must always trace back to an inspection event, so the score
   * changes at the next visit and not a moment earlier.
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

    // A closed violation stops feeding the risk score, so the queue reorders.
    await this.risk.recalculate(violation.establishmentId, 'VERIFICATION');

    return { ok: true };
  }
```

Add `private audit: AuditService,` to the constructor and these imports:

```typescript
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-log.entity';
```

In `apps/api/src/inspector/inspector.controller.ts`, add:

```typescript
  @Post('violations/:id/verify')
  verify(@Param('id') id: string, @Req() req: AuthedRequest): Promise<{ ok: true }> {
    return this.inspector.verifyViolation(id, req.user!.sub);
  }
```

- [ ] **Step 7: Add a test that verification leaves the grade alone**

Append to `apps/api/src/inspector/inspector.service.spec.ts`:

```typescript
describe('InspectorService.verifyViolation', () => {
  it('closes the violation without touching the grade (§6.4)', async () => {
    const { service, updates } = build();
    const violationUpdates: any[] = [];
    (service as any).violations = {
      findOne: jest.fn(async () => ({ id: 'v-1', establishmentId: 'est-1', status: 'OWNER_RESPONDED' })),
      update: jest.fn(async (id: string, patch: any) => violationUpdates.push({ id, patch })),
    };
    (service as any).audit = { record: jest.fn(async () => undefined) };
    (service as any).risk = { recalculate: jest.fn(async () => ({ total: 20, factors: [] })) };

    await service.verifyViolation('v-1', 'inspector-1');

    expect(violationUpdates[0].patch).toMatchObject({ status: 'VERIFIED' });
    // No establishment write at all — the grade cannot move here.
    expect(updates.find((u) => u.entity === Establishment)).toBeUndefined();
  });
});
```

- [ ] **Step 8: Surface the owner response on the public page**

In `apps/api/src/establishments/establishments.service.ts`, the public DTO already reports `ownerResponded`. Confirm the mapping still reads:

```typescript
      openViolations: openViolations
        .filter((v) => v.status === 'OPEN' || v.status === 'OWNER_RESPONDED')
        .map((v) => ({ category: v.category, ownerResponded: v.status === 'OWNER_RESPONDED' })),
```

This is already correct — a verified violation drops off the public list, and a responded one shows the "owner responded" line without changing the grade. No change needed; the step exists so you check rather than assume.

- [ ] **Step 9: Seed an owner account and tune the demo dataset**

In `apps/api/src/seed.ts`, add an owner user after the existing two, using the hero establishment's id (move the `userRepo.save` call to after `goldenOven` is created):

```typescript
  await userRepo.save({
    email: 'owner@golden-oven.ps',
    passwordHash: await hashPassword('aman1234'),
    role: 'OWNER',
    displayNameAr: 'صاحب الفرن الذهبي',
    establishmentId: goldenOven.id,
  });
```

Then seed complaints so the hero record actually ranks first under the real formula. Add before the risk-snapshot loop:

```typescript
  // §13.1 wants الفرن الذهبي at the top of the queue. Rather than writing a
  // number, give the formula the inputs that produce one: recent documented
  // complaints plus a fresh critical violation. Every figure in the demo then
  // traces back to real data.
  const complaintSeed = [
    { category: 'PESTS', hasEvidence: true, daysAgo: 2 },
    { category: 'HYGIENE', hasEvidence: true, daysAgo: 5 },
    { category: 'EXPIRED', hasEvidence: true, daysAgo: 9 },
    { category: 'REFRIGERATION', hasEvidence: false, daysAgo: 14 },
    // Deliberately inside 72h of the PESTS report above, so duplicate
    // detection has something to catch in the demo.
    { category: 'PESTS', hasEvidence: false, daysAgo: 1 },
  ];

  let reference = 4820;
  for (const seed of complaintSeed) {
    await complaintRepo.save({
      reference: String(++reference),
      establishmentId: goldenOven.id,
      category: seed.category,
      description: 'شكوى تجريبية لأغراض العرض.',
      hasEvidence: seed.hasEvidence,
      photoIds: null,
      contactPhoneEncrypted: null,
      ipHash: 'seed'.padEnd(64, '0'),
      status: 'SUBMITTED',
      duplicateOfId: null,
      rejectionReason: null,
      assignedInspectorId: null,
      inspectionId: null,
      createdAt: daysAgo(seed.daysAgo),
      updatedAt: daysAgo(seed.daysAgo),
    });
  }
```

- [ ] **Step 10: Confirm the hero record actually ranks first**

```bash
npm run build:shared && npm run seed && npm run dev:api
```

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"inspector@nablus.ps","password":"aman1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
curl -s http://localhost:3000/api/inspector/queue -H "Authorization: Bearer $TOKEN" | node -pe "
JSON.parse(require('fs').readFileSync(0)).map((e,i) => (i+1) + '. ' + e.nameAr + '  risk=' + e.risk).join('\n')"
```

Expected: `الفرن الذهبي` is **#1**. If it is not, add complaints to `complaintSeed` or move the seeded violation nearer to today — adjust the inputs, never the formula.

- [ ] **Step 11: Build the owner portal UI**

Add to `apps/web/src/app/core/strings.ts`, after `admin`:

```typescript
  owner: {
    title: 'بوابة صاحب المنشأة',
    currentGrade: 'الدرجة الحالية',
    lastInspection: 'آخر تفتيش',
    nextInspection: 'الزيارة القادمة',
    notScheduled: 'غير محددة',
    openTitle: 'بنود مطلوب معالجتها',
    openEmpty: 'لا توجد بنود مفتوحة.',
    resolvedTitle: 'بنود تم إغلاقها',
    resolvedEmpty: 'لا توجد بنود مغلقة بعد.',
    dueIn: 'المهلة المتبقية',
    overdue: 'تجاوزت المهلة',
    recommendation: 'الإجراء الموصى به',
    uploadTitle: 'أرفق إثبات المعالجة',
    uploadNote: 'وصف ما قمت به',
    uploadPhoto: 'أرفق صورة',
    uploadInvoice: 'أرفق فاتورة (اختياري)',
    submit: 'إرسال الإثبات',
    submitting: 'جارٍ الإرسال…',
    awaitingVerification: 'بانتظار تحقق المفتش',
    verified: 'تم التحقق من المعالجة',
    failed: 'تعذّر إرسال الإثبات.',
    gradeNote: 'إرسال الإثبات لا يغيّر الدرجة. الدرجة تتحدّث عند التفتيش القادم فقط.',
    loadFailed: 'تعذّر تحميل بيانات المنشأة.',
  },
```

Create `apps/web/src/app/owner/owner.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE, AuthService } from '../core/api';

export interface OwnerViolation {
  id: string;
  category: string;
  severity: string;
  recommendation: string | null;
  deadlineAt: string | null;
  status: string;
  ownerResponse: string | null;
  respondedAt: string | null;
  verifiedAt: string | null;
  overdue: boolean;
}

export interface OwnerOverview {
  establishment: {
    nameAr: string;
    slug: string;
    currentGrade: string | null;
    currentScore: number | null;
    lastInspectionAt: string | null;
  };
  openViolations: OwnerViolation[];
  resolvedViolations: OwnerViolation[];
}

@Injectable({ providedIn: 'root' })
export class OwnerApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private get options() {
    return { headers: this.auth.authHeaders() };
  }

  overview(): Promise<OwnerOverview> {
    return firstValueFrom(
      this.http.get<OwnerOverview>(`${API_BASE}/api/owner/establishment`, this.options),
    );
  }

  async uploadPhoto(blob: Blob): Promise<string> {
    const form = new FormData();
    form.append('file', blob, 'evidence.jpg');
    const response = await firstValueFrom(
      this.http.post<{ id: string }>(`${API_BASE}/api/uploads`, form, this.options),
    );
    return response.id;
  }

  respond(violationId: string, note: string, photoIds: string[]): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.post<{ ok: true }>(
        `${API_BASE}/api/owner/violations/${violationId}/respond`,
        { note, photoIds },
        this.options,
      ),
    );
  }
}
```

Create `apps/web/src/app/owner/portal.component.html`:

```html
<header class="bar">
  <div class="bar__inner">
    <span class="bar__mark">{{ t.app.name }}</span>
    <span class="bar__divider" aria-hidden="true"></span>
    <span class="bar__title">{{ t.owner.title }}</span>
    <button type="button" class="bar__signout" (click)="auth.signOut()">{{ t.auth.signOut }}</button>
  </div>
</header>

@if (error()) {
  <main class="page"><p class="notice" role="alert">{{ error() }}</p></main>
} @else if (overview(); as data) {
  <main class="page">
    <section class="summary">
      <app-grade-badge [grade]="asGrade(data.establishment.currentGrade)" variant="seal" />
      <h1 class="summary__name">{{ data.establishment.nameAr }}</h1>
      <dl class="summary__facts">
        <div>
          <dt>{{ t.owner.lastInspection }}</dt>
          <dd>
            @if (data.establishment.lastInspectionAt) {
              <span class="ltr">{{ data.establishment.lastInspectionAt | date: 'yyyy-MM-dd' }}</span>
            } @else {
              {{ t.publicPage.neverInspected }}
            }
          </dd>
        </div>
        <div>
          <dt>{{ t.owner.nextInspection }}</dt>
          <dd>{{ t.owner.notScheduled }}</dd>
        </div>
      </dl>
    </section>

    <p class="grade-note">{{ t.owner.gradeNote }}</p>

    <section class="block">
      <h2 class="eyebrow">{{ t.owner.openTitle }}</h2>
      @if (data.openViolations.length === 0) {
        <p class="muted">{{ t.owner.openEmpty }}</p>
      }
      @for (v of data.openViolations; track v.id) {
        <article class="item" [class.item--overdue]="v.overdue">
          <div class="item__head">
            <span class="sev" [class]="'sev--' + v.severity">{{ t.checklist.severity[v.severity] }}</span>
            @if (v.deadlineAt) {
              <span class="item__due" [class.item__due--late]="v.overdue">
                {{ v.overdue ? t.owner.overdue : t.owner.dueIn }}:
                <span class="ltr">{{ v.deadlineAt | date: 'yyyy-MM-dd' }}</span>
              </span>
            }
          </div>

          <p class="item__category">{{ v.category }}</p>

          @if (v.recommendation) {
            <div class="item__recommendation">
              <span class="eyebrow">{{ t.owner.recommendation }}</span>
              <p>{{ v.recommendation }}</p>
            </div>
          }

          @if (v.status === 'OWNER_RESPONDED') {
            <p class="item__awaiting">{{ t.owner.awaitingVerification }}</p>
          } @else {
            <form class="upload" (ngSubmit)="submit(v.id)">
              <div class="field">
                <label [attr.for]="'n-' + v.id">{{ t.owner.uploadNote }}</label>
                <textarea
                  [id]="'n-' + v.id"
                  [value]="noteFor(v.id)"
                  (input)="setNote(v.id, $any($event.target).value)"
                ></textarea>
              </div>

              <div class="upload__photos">
                @for (url of photoUrlsFor(v.id); track url) {
                  <img [src]="url" [alt]="t.owner.uploadPhoto" />
                }
                <label class="upload__add">
                  <input type="file" accept="image/*" capture="environment" (change)="addPhoto(v.id, $any($event.target))" />
                  <span>{{ t.owner.uploadPhoto }}</span>
                </label>
              </div>

              <button class="btn" type="submit" [disabled]="busy() === v.id">
                {{ busy() === v.id ? t.owner.submitting : t.owner.submit }}
              </button>
            </form>
          }
        </article>
      }
    </section>

    <section class="block">
      <h2 class="eyebrow">{{ t.owner.resolvedTitle }}</h2>
      @if (data.resolvedViolations.length === 0) {
        <p class="muted">{{ t.owner.resolvedEmpty }}</p>
      }
      @for (v of data.resolvedViolations; track v.id) {
        <article class="item item--resolved">
          <p class="item__category">{{ v.category }}</p>
          <p class="item__verified">{{ t.owner.verified }}</p>
        </article>
      }
    </section>

    <footer class="attribution">{{ t.app.attribution }}</footer>
  </main>
} @else {
  <main class="page"><p class="muted">{{ t.common.loading }}</p></main>
}
```

Create `apps/web/src/app/owner/portal.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { Grade } from '@aman/shared';
import { GradeBadgeComponent } from '../ui/grade-badge.component';
import { AuthService } from '../core/api';
import { compressPhoto, objectUrl } from '../core/photo';
import { OwnerApiService, type OwnerOverview } from './owner.service';
import { T } from '../core/strings';

@Component({
  selector: 'app-owner-portal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GradeBadgeComponent],
  templateUrl: './portal.component.html',
  styleUrl: './portal.component.css',
})
export class OwnerPortalComponent {
  readonly t = T;
  readonly auth = inject(AuthService);
  private api = inject(OwnerApiService);

  readonly overview = signal<OwnerOverview | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  private notes = signal<Record<string, string>>({});
  private photos = signal<Record<string, { blob: Blob; url: string }[]>>({});

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.overview.set(await this.api.overview());
    } catch {
      this.error.set(T.owner.loadFailed);
    }
  }

  asGrade(grade: string | null): Grade | null {
    return (grade as Grade) ?? null;
  }

  noteFor(id: string): string {
    return this.notes()[id] ?? '';
  }

  setNote(id: string, value: string): void {
    this.notes.update((all) => ({ ...all, [id]: value }));
  }

  photoUrlsFor(id: string): string[] {
    return (this.photos()[id] ?? []).map((p) => p.url);
  }

  async addPhoto(id: string, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const blob = await compressPhoto(file);
    this.photos.update((all) => ({
      ...all,
      [id]: [...(all[id] ?? []), { blob, url: objectUrl(blob) }],
    }));
  }

  async submit(id: string): Promise<void> {
    this.busy.set(id);
    this.error.set(null);
    try {
      const photoIds: string[] = [];
      for (const photo of this.photos()[id] ?? []) {
        photoIds.push(await this.api.uploadPhoto(photo.blob));
      }
      await this.api.respond(id, this.noteFor(id), photoIds);
      await this.load();
    } catch {
      this.error.set(T.owner.failed);
    } finally {
      this.busy.set(null);
    }
  }
}
```

Create `apps/web/src/app/owner/portal.component.css`:

```css
:host {
  display: block;
  min-block-size: 100dvh;
  background: var(--paper);
}

.bar {
  background: var(--ink);
  color: #fff;
  border-block-end: 3px solid var(--primary);
}

.bar__inner {
  max-inline-size: 640px;
  margin-inline: auto;
  padding: var(--s3) var(--s4);
  display: flex;
  align-items: center;
  gap: var(--s3);
}

.bar__mark {
  font-size: var(--text-lede);
  font-weight: 700;
}

.bar__divider {
  inline-size: 1px;
  block-size: 18px;
  background: rgba(255, 255, 255, 0.28);
}

.bar__title {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
}

.bar__signout {
  margin-inline-start: auto;
  background: none;
  border: 0;
  color: rgba(255, 255, 255, 0.86);
  text-decoration: underline;
  cursor: pointer;
}

.page {
  max-inline-size: 640px;
  margin-inline: auto;
  padding: var(--s5) var(--s4) var(--s7);
  display: flex;
  flex-direction: column;
  gap: var(--s5);
}

.summary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s3);
  text-align: center;
}

.summary__name {
  font-size: var(--text-title);
  font-weight: 700;
  color: var(--ink);
}

.summary__facts {
  display: flex;
  gap: var(--s5);
  margin: 0;
}

.summary__facts dt {
  font-size: 12px;
  color: var(--ink-muted);
}

.summary__facts dd {
  margin: 0;
  font-weight: 700;
  color: var(--ink);
}

.grade-note {
  padding: var(--s3);
  background: var(--inset);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  font-size: 13px;
  line-height: 1.6;
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

.muted {
  color: var(--ink-muted);
  font-size: var(--text-caption);
}

.item {
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

.item--overdue {
  background: var(--danger-bg);
  border-color: color-mix(in srgb, var(--danger) 24%, transparent);
}

.item--resolved {
  opacity: 0.8;
}

.item__head {
  display: flex;
  align-items: center;
  gap: var(--s2);
}

.sev {
  padding: 1px var(--s2);
  border-radius: 3px;
  font-size: 11px;
  font-weight: 700;
}

.sev--CRITICAL {
  background: var(--danger-bg);
  color: var(--danger);
}

.sev--MAJOR {
  background: var(--warn-bg);
  color: #7a5c12;
}

.sev--MINOR {
  background: var(--inset);
  color: var(--ink-muted);
}

.item__due {
  margin-inline-start: auto;
  font-size: 12px;
  color: var(--ink-muted);
}

.item__due--late {
  color: var(--danger);
  font-weight: 700;
}

.item__category {
  font-size: var(--text-body);
  font-weight: 700;
  color: var(--ink);
}

.item__recommendation {
  padding: var(--s3);
  background: var(--inset);
  border-radius: var(--radius);
  font-size: var(--text-caption);
  line-height: 1.6;
}

.item__awaiting {
  padding: var(--s3);
  background: var(--warn-bg);
  border-radius: var(--radius);
  font-size: var(--text-caption);
  font-weight: 700;
}

.item__verified {
  font-size: var(--text-caption);
  color: var(--ok);
  font-weight: 700;
}

.upload {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding-block-start: var(--s3);
  border-block-start: 1px solid var(--rule);
}

.upload__photos {
  display: flex;
  gap: var(--s2);
  flex-wrap: wrap;
}

.upload__photos img {
  inline-size: 88px;
  block-size: 88px;
  object-fit: cover;
  border-radius: var(--radius);
  border: 1px solid var(--rule);
}

.upload__add {
  inline-size: 88px;
  block-size: 88px;
  display: grid;
  place-items: center;
  border: 1.5px dashed var(--rule-strong);
  border-radius: var(--radius);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
}

.upload__add input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
  pointer-events: none;
}

.upload__add:focus-within {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}

.attribution {
  padding-block-start: var(--s4);
  border-block-start: 1px solid var(--rule);
  font-size: 13px;
  color: var(--ink-muted);
  text-align: center;
}
```

- [ ] **Step 12: Register the owner route**

In `apps/web/src/app/app.routes.ts`, add before the wildcard:

```typescript
  { path: 'portal', component: OwnerPortalComponent, canActivate: [signedIn] },
```

with `import { OwnerPortalComponent } from './owner/portal.component';`.

- [ ] **Step 13: Run everything**

```bash
npm run build:shared && npm test && npm run build
```

Expected: all suites pass, all three packages build.

- [ ] **Step 14: Verify the whole loop end to end**

With both servers running, walk the §13 demo script:

1. `/e/golden-oven-nablus` — note the grade.
2. File a complaint with a photo. Note the reference.
3. Sign in as admin, open `/admin/planning`. الفرن الذهبي is #1. Expand the breakdown. **The grade has not changed.**
4. Sign in as the inspector, open `/app/today`. Same establishment at #1 with reasons visible.
5. Run the checklist, fail cold storage with a photo, turn off wifi, submit.
6. Refresh the public page — the grade has dropped.
7. Sign in as `owner@golden-oven.ps` / `aman1234` at `/portal`, upload proof on the open violation, confirm it reads "awaiting verification" and **the grade did not move**.
8. Back as the inspector, verify the fix, and confirm **the grade still did not move**.
9. Track the complaint at `/complaint/:ref` and confirm the stepper advanced.

Any grade change outside step 5 is a bug in this week's work, not a styling choice.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/owner apps/api/src/establishments/violation.entity.ts \
  apps/api/src/inspector apps/api/src/seed.ts apps/api/src/app.module.ts \
  apps/web/src/app/owner apps/web/src/app/app.routes.ts apps/web/src/app/core/strings.ts
git commit -m "feat: owner portal, fix verification, and a demo dataset the formula actually ranks"
```

---

## Self-Review

**Spec coverage.** §5.2 complaint form → Task 4. §5.3 tracking → Task 4. §5.7 owner portal → Task 7. §5.9 triage, duplicate detection, fixed rejection reasons → Tasks 5, 6. §5.10 planning with factor breakdown → Tasks 5, 6. §6.2 risk engine → Task 1, persisted in Task 2. §6.3 complaint lifecycle → Tasks 3, 5. §6.4 violation lifecycle and "verifying does not raise the grade" → Task 7. §7.1 tables (`complaints`, `risk_score_snapshots`, `audit_log`, violation columns) → Tasks 2, 3, 5, 7. §8.1/§8.2/§8.3 endpoints → Tasks 3, 5, 7. §11 rate limits, EXIF, owner scoping, append-only audit, no raw IPs → Tasks 3, 4, 5, 7.

**Known gaps, deliberately deferred.** §5.10's QR print sheet and settings screens, and §5.8's admin dashboard with charts, are Week 4 per §12. `PUT /api/admin/settings/risk-weights` is not built, but `calculateRisk` already accepts a weights argument and validates the sum, so Week 4 wires a screen to an existing seam rather than reworking the engine.

**Type consistency.** `RiskFactor` (shared) → `RiskFactorDto` (api) → `RiskFactor` (web admin client) → `RiskFactorView` (ui component) all carry the same six fields: `key, normalized, weight, contribution, labelAr, detailAr`. `ComplaintStatus` values are identical in `complaint.entity.ts`, `TIMELINE_ORDER`, `T.track.step` and `T.admin.complaints.status`. `RiskService.recalculate` takes `(establishmentId, trigger)` at all six call sites.

**One thing to watch.** Task 2's `RiskModule` imports `Complaint`, which Task 3 creates. Executing in order avoids this; executing Task 2 alone requires creating `complaint.entity.ts` first.

