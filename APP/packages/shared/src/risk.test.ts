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
  const complaint = (over: Partial<RiskComplaintInput> = {}): RiskComplaintInput => ({
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
    const result = calculateRisk(base({ complaints: [complaint({ submittedAt: daysAgo(91) })] }));
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
  it('returns a category-only score for a spotless, freshly inspected shop', () => {
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
    const result = calculateRisk(base({ category: 'BUTCHER' }), {
      PRIOR_VIOLATIONS: 0,
      COMPLAINT_PRESSURE: 0,
      TIME_SINCE_INSPECTION: 0,
      CATEGORY: 100,
    });
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
