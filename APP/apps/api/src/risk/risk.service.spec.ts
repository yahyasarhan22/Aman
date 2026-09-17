import { NotFoundException } from '@nestjs/common';
import { RiskService } from './risk.service';

const NOW = new Date('2026-08-19T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function build(
  overrides: { establishment?: any; violations?: any[]; complaints?: any[] } = {},
) {
  const establishment = {
    id: 'est-1',
    category: 'BAKERY',
    lastInspectionAt: daysAgo(12),
    currentRiskScore: 0,
    status: 'ACTIVE',
    ...overrides.establishment,
  };

  const saved: any[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];

  const establishmentsRepo = {
    findOne: jest.fn(async () => establishment),
    find: jest.fn(async () => [establishment]),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      updates.push({ id, patch });
    }),
  };

  const violationsRepo = { find: jest.fn(async () => overrides.violations ?? []) as jest.Mock };
  const complaintsRepo = { find: jest.fn(async () => overrides.complaints ?? []) as jest.Mock };

  const snapshotsRepo = {
    save: jest.fn(async (row: any) => {
      const withId = { id: `snap-${saved.length}`, ...row };
      saved.push(withId);
      return withId;
    }),
    findOne: jest.fn(async () => saved[saved.length - 1] ?? null),
    find: jest.fn(async () => [...saved].reverse()),
  };

  const service = new RiskService(
    establishmentsRepo as any,
    violationsRepo as any,
    complaintsRepo as any,
    snapshotsRepo as any,
    { getWeights: jest.fn(async () => require('@aman/shared').RISK_WEIGHTS) } as any,
  );

  return {
    service,
    saved,
    updates,
    establishment,
    violationsRepo,
    complaintsRepo,
    snapshotsRepo,
  };
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
    expect(saved[0].calculatedAt).toBeInstanceOf(Date);
  });

  it('denormalizes the total onto the establishment for fast list reads', async () => {
    const { service, updates } = build();

    const result = await service.recalculate('est-1', 'MANUAL');

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ id: 'est-1', patch: { currentRiskScore: result.total } });
  });

  it('raises the score when a documented complaint arrives', async () => {
    const before = await build().service.recalculate('est-1', 'MANUAL');

    const after = await build({
      complaints: [{ category: 'HYGIENE', hasEvidence: true, createdAt: daysAgo(1) }],
    }).service.recalculate('est-1', 'COMPLAINT');

    expect(after.total).toBeGreaterThan(before.total);
  });

  it('only counts complaints the municipality still treats as live', async () => {
    // A rejected or duplicated complaint must not push an establishment up the
    // queue — otherwise rejecting spam still rewards the spammer.
    const { service, complaintsRepo } = build();

    await service.recalculate('est-1', 'MANUAL');

    const [firstCall] = complaintsRepo.find.mock.calls;
    expect(firstCall).toBeDefined();
    const where = firstCall[0].where;
    expect(where.establishmentId).toBe('est-1');
    expect(where.status).toBeDefined();
  });

  it('dates violations from when they occurred, not from their deadline', async () => {
    // deadlineAt varies by severity, so it cannot stand in for the occurrence
    // date without inverting the decay curve.
    const { service } = build({
      violations: [{ severity: 'CRITICAL', occurredAt: daysAgo(60), deadlineAt: daysAgo(58) }],
    });

    const result = await service.recalculate('est-1', 'MANUAL');
    const prior = result.factors.find((f) => f.key === 'PRIOR_VIOLATIONS')!;

    // Dated from occurredAt (60 days = 2 months): 10 x (1 - 2/12) = 8.333 -> x4 -> 33.
    // Dated from deadlineAt (58 days) it would round to 34, so this pins the
    // field the engine actually reads.
    expect(prior.normalized).toBe(33);
  });

  it('reports an unknown establishment rather than silently scoring nothing', async () => {
    const { service } = build();
    (service as any).establishments.findOne = jest.fn(async () => null);

    await expect(service.recalculate('missing', 'MANUAL')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('RiskService.latestSnapshots', () => {
  it('returns the most recent snapshot per establishment', async () => {
    const { service, snapshotsRepo } = build();
    snapshotsRepo.find = jest.fn(async () => [
      { establishmentId: 'a', total: 90, calculatedAt: daysAgo(0), factorsJson: '[]' },
      { establishmentId: 'a', total: 10, calculatedAt: daysAgo(5), factorsJson: '[]' },
      { establishmentId: 'b', total: 40, calculatedAt: daysAgo(1), factorsJson: '[]' },
    ]) as any;

    const map = await service.latestSnapshots(['a', 'b']);

    expect(map.get('a')!.total).toBe(90);
    expect(map.get('b')!.total).toBe(40);
  });

  it('does not query at all for an empty list', async () => {
    const { service, snapshotsRepo } = build();
    const map = await service.latestSnapshots([]);
    expect(map.size).toBe(0);
    expect(snapshotsRepo.find).not.toHaveBeenCalled();
  });
});

describe('grade integrity', () => {
  it('exposes no method that could write a grade', () => {
    const names = Object.getOwnPropertyNames(RiskService.prototype);
    expect(names.filter((n) => /grade/i.test(n))).toEqual([]);
  });

  it('writes only the risk column onto an establishment', async () => {
    const { service, updates } = build();
    await service.recalculate('est-1', 'COMPLAINT');
    for (const update of updates) {
      expect(Object.keys(update.patch)).toEqual(['currentRiskScore']);
    }
  });
});
