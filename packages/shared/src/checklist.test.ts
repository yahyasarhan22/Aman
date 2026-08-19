import { deadlineFor, missingCriticalPhotos, renderRecommendation } from './checklist';
import type { ChecklistItemDef, InspectionAnswer } from './checklist';

describe('renderRecommendation', () => {
  const template =
    'اضبط التبريد إلى أقل من {threshold}°. القراءة الحالية: {measured}°. إذا تعذر ذلك استبدل الوحدة خلال {deadline}.';

  /** Strips the invisible bidi isolates so assertions stay readable. */
  const plain = (s: string) => s.replace(/[⁦⁩]/g, '');

  it('substitutes the spec §6.5 worked example', () => {
    expect(plain(renderRecommendation(template, { threshold: '4', measured: '8', deadline: 14 }))).toBe(
      'اضبط التبريد إلى أقل من 4°. القراءة الحالية: 8°. إذا تعذر ذلك استبدل الوحدة خلال 14 يوماً.',
    );
  });

  it('inflects a deadline as an Arabic count rather than "2 يوماً"', () => {
    expect(plain(renderRecommendation('المهلة {deadline}.', { deadline: 2 }))).toBe('المهلة يومان.');
    expect(plain(renderRecommendation('المهلة {deadline}.', { deadline: 14 }))).toBe('المهلة 14 يوماً.');
  });

  it('wraps each substituted value in a bidi isolate so a negative reading keeps its sign', () => {
    expect(renderRecommendation('الفريزر عند {threshold}°', { threshold: '-18' })).toBe(
      'الفريزر عند ⁦-18⁩°',
    );
  });

  it('leaves a placeholder visible when its value is missing, so the inspector sees the gap', () => {
    expect(renderRecommendation('اضبط إلى {threshold}°', {})).toBe('اضبط إلى {threshold}°');
  });

  it('does not touch unknown placeholders', () => {
    expect(plain(renderRecommendation('{inspectorName} — {measured}', { measured: '8' }))).toBe(
      '{inspectorName} — 8',
    );
  });
});

describe('deadlineFor', () => {
  const submitted = new Date('2026-08-19T10:00:00Z');

  it('gives a critical violation 48 hours', () => {
    expect(deadlineFor('CRITICAL', submitted).toISOString()).toBe('2026-08-21T10:00:00.000Z');
  });

  it('gives a major violation 14 days and a minor one 30', () => {
    expect(deadlineFor('MAJOR', submitted).toISOString()).toBe('2026-09-02T10:00:00.000Z');
    expect(deadlineFor('MINOR', submitted).toISOString()).toBe('2026-09-18T10:00:00.000Z');
  });

  it('does not mutate the date it was given', () => {
    deadlineFor('MINOR', submitted);
    expect(submitted.toISOString()).toBe('2026-08-19T10:00:00.000Z');
  });
});

describe('missingCriticalPhotos', () => {
  const items = [
    { id: 'cold', severity: 'CRITICAL' },
    { id: 'thermo', severity: 'MAJOR' },
  ] as Pick<ChecklistItemDef, 'id' | 'severity'>[];

  const answer = (over: Partial<InspectionAnswer>): InspectionAnswer => ({
    checklistItemId: 'cold',
    result: 'FAIL',
    ...over,
  });

  it('flags a critical failure with no photo attached', () => {
    expect(missingCriticalPhotos([answer({})], items)).toEqual(['cold']);
  });

  it('accepts a critical failure that carries evidence', () => {
    expect(missingCriticalPhotos([answer({ photoIds: ['img-1'] })], items)).toEqual([]);
  });

  it('does not demand a photo for a major failure or for a pass', () => {
    expect(
      missingCriticalPhotos(
        [answer({ checklistItemId: 'thermo' }), answer({ result: 'PASS' })],
        items,
      ),
    ).toEqual([]);
  });
});
