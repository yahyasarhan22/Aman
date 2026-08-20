import { BadRequestException } from '@nestjs/common';
import { InspectorService } from './inspector.service';
import { Establishment } from '../establishments/establishment.entity';
import { Inspection } from '../establishments/inspection.entity';
import { Violation } from '../establishments/violation.entity';
import type { SubmitInspectionDto } from './inspector.dto';

const CHECKLIST_VERSION_ID = 'ver-1';

const definitions = [
  {
    id: 'cold',
    code: '2.1',
    labelAr: 'التخزين البارد عند {threshold}° مئوية أو أقل',
    severity: 'CRITICAL',
    threshold: '4',
    recommendationTemplate: 'اضبط التبريد إلى أقل من {threshold}°. القراءة: {measured}°. خلال {deadline}.',
  },
  {
    id: 'thermo',
    code: '2.4',
    labelAr: 'ميزان حرارة متوفر',
    severity: 'MINOR',
    threshold: null,
    recommendationTemplate: 'وفّر ميزان حرارة خلال {deadline}.',
  },
];

function build() {
  const establishment = {
    id: 'est-1',
    slug: 'golden-oven-nablus',
    nameAr: 'الفرن الذهبي',
    category: 'BAKERY',
    address: null,
    currentGrade: 'B',
    currentScore: 82,
    lastInspectionAt: null,
    status: 'ACTIVE',
  };

  const saved: Record<string, any[]> = { Inspection: [], InspectionItem: [], Violation: [] };
  const updates: { entity: unknown; id: string; patch: Record<string, unknown> }[] = [];

  const manager = {
    save: jest.fn(async (entity: any, payload: any) => {
      const name = entity.name as string;
      const rows = Array.isArray(payload) ? payload : [payload];
      const withIds = rows.map((r, i) => ({ id: `${name}-${saved[name].length + i}`, ...r }));
      saved[name].push(...withIds);
      return Array.isArray(payload) ? withIds : withIds[0];
    }),
    update: jest.fn(async (entity: any, id: string, patch: Record<string, unknown>) => {
      updates.push({ entity, id, patch });
    }),
  };

  const service = new InspectorService(
    { find: jest.fn(async () => [establishment]), findOne: jest.fn(async () => establishment) } as any,
    { findOne: jest.fn(async () => null) } as any,
    { find: jest.fn(async () => []), count: jest.fn(async () => 0) } as any,
    { findOne: jest.fn(async () => ({ id: CHECKLIST_VERSION_ID, version: 1 })) } as any,
    { find: jest.fn(async () => definitions) } as any,
    { transaction: jest.fn(async (fn: any) => fn(manager)) } as any,
    {
      latestSnapshots: jest.fn(async () => new Map()),
      recalculate: jest.fn(async () => ({ total: 0, factors: [] })),
    } as any,
    { record: jest.fn(async () => undefined) } as any,
  );

  return { service, saved, updates, establishment, manager };
}

const dto = (over: Partial<SubmitInspectionDto> = {}): SubmitInspectionDto => ({
  clientId: 'client-uuid-1',
  establishmentId: 'est-1',
  checklistVersionId: CHECKLIST_VERSION_ID,
  answers: [
    { checklistItemId: 'cold', result: 'PASS' },
    { checklistItemId: 'thermo', result: 'PASS' },
  ],
  ...over,
});

describe('InspectorService.submitInspection', () => {
  it('writes the grade onto the establishment — the one path allowed to', async () => {
    const { service, updates } = build();

    const result = await service.submitInspection(dto(), 'inspector-1');

    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.previousGrade).toBe('B');

    const gradeWrite = updates.find((u) => u.entity === Establishment);
    expect(gradeWrite).toBeDefined();
    expect(gradeWrite!.patch).toMatchObject({ currentGrade: 'A', currentScore: 100 });
  });

  it('caps the grade at C when a critical item fails, per the §6.1 override', async () => {
    const { service } = build();

    const result = await service.submitInspection(
      dto({
        answers: [
          { checklistItemId: 'cold', result: 'FAIL', measuredValue: '8', photoIds: ['img-1'] },
          { checklistItemId: 'thermo', result: 'PASS' },
        ],
      }),
      'inspector-1',
    );

    expect(result.score).toBe(17);
    expect(result.grade).toBe('D');
  });

  it('refuses a critical failure with no photo attached', async () => {
    const { service, updates } = build();

    await expect(
      service.submitInspection(
        dto({
          answers: [
            { checklistItemId: 'cold', result: 'FAIL', measuredValue: '8' },
            { checklistItemId: 'thermo', result: 'PASS' },
          ],
        }),
        'inspector-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(updates).toHaveLength(0);
  });

  it('refuses a partially answered sheet rather than scoring it', async () => {
    const { service } = build();

    await expect(
      service.submitInspection(
        dto({ answers: [{ checklistItemId: 'cold', result: 'PASS' }] }),
        'inspector-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a violation with a filled-in recommendation and a deadline', async () => {
    const { service, saved } = build();

    await service.submitInspection(
      dto({
        answers: [
          { checklistItemId: 'cold', result: 'FAIL', measuredValue: '8', photoIds: ['img-1'] },
          { checklistItemId: 'thermo', result: 'PASS' },
        ],
      }),
      'inspector-1',
    );

    expect(saved.Violation).toHaveLength(1);
    const violation = saved.Violation[0];
    const plain = (text: string) => text.replace(/[⁦⁩]/g, '');
    expect(plain(violation.category)).toBe('التخزين البارد عند 4° مئوية أو أقل');
    expect(plain(violation.recommendation)).toBe(
      'اضبط التبريد إلى أقل من 4°. القراءة: 8°. خلال يومان.',
    );
    expect(violation.deadlineAt).toBeInstanceOf(Date);
    expect(violation.photoIds).toBe('img-1');
  });

  it('returns the existing record for a repeated clientId instead of grading twice', async () => {
    const { service } = build();
    (service as any).inspections.findOne = jest.fn(async () => ({
      id: 'insp-existing',
      score: 82,
      grade: 'B',
      previousGrade: 'A',
    }));

    const result = await service.submitInspection(dto(), 'inspector-1');

    expect(result).toMatchObject({ inspectionId: 'insp-existing', grade: 'B', duplicate: true });
  });
});

describe('InspectorService.verifyViolation', () => {
  it('closes the violation without touching the grade (§6.4)', async () => {
    // Verifying a fix must never raise a grade. Grades trace back to an
    // inspection event; the score changes at the next visit, not when an owner
    // proves they replaced a fridge.
    const { service, updates } = build();
    const violationUpdates: any[] = [];

    (service as any).violations = {
      findOne: jest.fn(async () => ({
        id: 'v-1',
        establishmentId: 'est-1',
        status: 'OWNER_RESPONDED',
      })),
      update: jest.fn(async (id: string, patch: any) => {
        violationUpdates.push({ id, patch });
      }),
    };
    const recalculate = jest.fn(async () => ({ total: 20, factors: [] }));
    (service as any).risk = { recalculate };
    (service as any).audit = { record: jest.fn(async () => undefined) };

    await service.verifyViolation('v-1', 'inspector-1');

    expect(violationUpdates[0].patch).toMatchObject({
      status: 'VERIFIED',
      verifiedById: 'inspector-1',
    });
    // No establishment write happened at all, so no grade could have moved.
    expect(updates.find((u) => u.entity === Establishment)).toBeUndefined();
    // The queue does reorder, because a closed violation stops feeding risk.
    expect(recalculate).toHaveBeenCalledWith('est-1', 'VERIFICATION');
  });

  it('reports an unknown violation', async () => {
    const { service } = build();
    (service as any).violations = { findOne: jest.fn(async () => null) };
    await expect(service.verifyViolation('missing', 'inspector-1')).rejects.toThrow();
  });
});
