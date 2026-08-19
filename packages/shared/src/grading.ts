export type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR';
export type ItemResult = 'PASS' | 'FAIL' | 'NA';
export type Grade = 'A' | 'B' | 'C' | 'D';

export interface ChecklistResult {
  severity: Severity;
  result: ItemResult;
}

export const SEVERITY_POINTS: Record<Severity, number> = {
  CRITICAL: 10,
  MAJOR: 5,
  MINOR: 2,
};

export function calculateScore(items: ChecklistResult[]): number | null {
  let earned = 0;
  let available = 0;

  for (const item of items) {
    if (item.result === 'NA') continue;
    available += SEVERITY_POINTS[item.severity];
    if (item.result === 'PASS') earned += SEVERITY_POINTS[item.severity];
  }

  if (available === 0) return null;

  let score = Math.round((earned / available) * 100);

  const criticalFails = items.filter(
    (i) => i.severity === 'CRITICAL' && i.result === 'FAIL',
  ).length;

  if (criticalFails >= 1) score = Math.min(score, 79);
  if (criticalFails >= 3) score = Math.min(score, 59);

  return score;
}

export function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}
