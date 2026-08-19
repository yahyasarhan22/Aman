import { calculateScore, scoreToGrade } from './grading';

describe('calculateScore', () => {
  it('returns null when every item is N/A', () => {
    expect(calculateScore([{ severity: 'MAJOR', result: 'NA' }])).toBeNull();
  });

  it('scores 100 when everything passes', () => {
    const items = [
      { severity: 'CRITICAL', result: 'PASS' },
      { severity: 'MAJOR', result: 'PASS' },
      { severity: 'MINOR', result: 'PASS' },
    ] as const;
    expect(calculateScore([...items])).toBe(100);
  });

  it('excludes N/A items from the denominator entirely', () => {
    const items = [
      { severity: 'CRITICAL', result: 'PASS' },
      { severity: 'MAJOR', result: 'NA' },
    ] as const;
    // only the CRITICAL item counts: 10/10 = 100
    expect(calculateScore([...items])).toBe(100);
  });

  it('computes the percentage of points earned', () => {
    const items = [
      { severity: 'CRITICAL', result: 'PASS' }, // 10 earned / 10 avail
      { severity: 'MAJOR', result: 'FAIL' },     // 0 earned / 5 avail
      { severity: 'MINOR', result: 'PASS' },     // 2 earned / 2 avail
    ] as const;
    // earned 12 / available 17 = 70.6 -> rounds to 71
    expect(calculateScore([...items])).toBe(71);
  });

  it('caps score at 79 when there is one critical failure, even if raw score is higher', () => {
    const items = [
      { severity: 'CRITICAL', result: 'FAIL' }, // 0/10
      { severity: 'MAJOR', result: 'PASS' },     // 5/5
      { severity: 'MINOR', result: 'PASS' },     // 2/2
    ] as const;
    // raw = 7/17 = 41, already below 79, so test a case where raw would be high:
    const highRaw = [
      { severity: 'CRITICAL', result: 'FAIL' },  // 0/10
      { severity: 'MINOR', result: 'PASS' },      // 2/2
    ] as const;
    // raw = 2/12 = 17 -> min(17, 79) = 17, override doesn't matter here.
    // Use a case where raw score exceeds 79 despite one critical fail:
    const manyPasses = [
      { severity: 'CRITICAL', result: 'FAIL' },
      ...Array(20).fill({ severity: 'MINOR', result: 'PASS' }),
    ] as const;
    // earned = 40, available = 10 + 40 = 50 -> raw = 80 -> capped to 79
    expect(calculateScore([...manyPasses])).toBe(79);
  });

  it('caps score at 59 when there are three or more critical failures', () => {
    const items = [
      { severity: 'CRITICAL', result: 'FAIL' },
      { severity: 'CRITICAL', result: 'FAIL' },
      { severity: 'CRITICAL', result: 'FAIL' },
      ...Array(20).fill({ severity: 'MINOR', result: 'PASS' }),
    ] as const;
    // earned = 40, available = 30 + 40 = 70 -> raw = 57 (already < 59)
    // force a high raw: use passes only for the non-critical items, few criticals counted as available too
    const items2 = [
      { severity: 'CRITICAL', result: 'FAIL' },
      { severity: 'CRITICAL', result: 'FAIL' },
      { severity: 'CRITICAL', result: 'FAIL' },
      ...Array(80).fill({ severity: 'MINOR', result: 'PASS' }),
    ] as const;
    // earned = 160, available = 30 + 160 = 190 -> raw = 84 -> capped to 59
    expect(calculateScore([...items2])).toBe(59);
  });
});

describe('scoreToGrade', () => {
  it.each([
    [95, 'A'], [90, 'A'],
    [89, 'B'], [80, 'B'],
    [79, 'C'], [60, 'C'],
    [59, 'D'], [0, 'D'],
  ])('maps score %i to grade %s', (score, grade) => {
    expect(scoreToGrade(score)).toBe(grade);
  });
});
