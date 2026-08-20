import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const NOW = new Date('2026-08-20T12:00:00Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

function complaint(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    reference: '4821',
    establishmentId: 'est-1',
    category: 'PESTS',
    description: 'صراصير',
    hasEvidence: false,
    photoIds: null,
    contactPhoneEncrypted: null,
    status: 'SUBMITTED',
    duplicateOfId: null,
    rejectionReason: null,
    assignedInspectorId: null,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    ...over,
  };
}

function build(rows: any[] = [complaint()]) {
  const updates: { id: string; patch: any }[] = [];
  const audit = { record: jest.fn(async () => undefined) };
  const risk = {
    recalculate: jest.fn(async () => ({ total: 51, factors: [] })),
    recalculateAll: jest.fn(async () => 1),
    latestSnapshots: jest.fn(
      async () =>
        new Map([['est-1', { establishmentId: 'est-1', total: 51, factorsJson: '[{"key":"CATEGORY"}]' }]]),
    ),
  };

  const service = new AdminService(
    {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
      update: jest.fn(async (id: string, patch: any) => {
        updates.push({ id, patch });
      }),
    } as any,
    {
      find: jest.fn(async () => [
        {
          id: 'est-1',
          nameAr: 'الفرن الذهبي',
          slug: 'golden-oven-nablus',
          category: 'BAKERY',
          currentGrade: 'B',
          currentRiskScore: 51,
          lastInspectionAt: null,
          status: 'ACTIVE',
        },
      ]),
    } as any,
    {
      find: jest.fn(async () => [{ id: 'insp-1', displayNameAr: 'سامي', role: 'INSPECTOR' }]),
      findOne: jest.fn(async () => ({ id: 'insp-1', role: 'INSPECTOR' })),
    } as any,
    risk as any,
    audit as any,
    {
      getWeights: jest.fn(async () => require('@aman/shared').RISK_WEIGHTS),
      updateWeights: jest.fn(async (w: any) => w),
    } as any,
  );

  return { service, updates, audit, risk };
}

describe('AdminService.listComplaints', () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = 'test-key';
  });

  it('sorts by age descending, pinning photo-backed complaints above photo-less ones of the same age', async () => {
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
    expect(pests[0].duplicateGroupSize).toBe(2);
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
    expect(result.every((r) => r.duplicateGroupSize === 1)).toBe(true);
  });

  it('exposes the complainant contact, which only admins may see', async () => {
    const { service } = build();
    const result = await service.listComplaints({});
    expect('contactPhone' in result[0]).toBe(true);
  });

  it('passes filters through to the query rather than filtering in memory', async () => {
    const { service } = build();
    const repo = (service as any).complaints.find as jest.Mock;

    await service.listComplaints({ status: 'SUBMITTED', hasEvidence: true });

    expect(repo.mock.calls[0][0].where).toEqual({ status: 'SUBMITTED', hasEvidence: true });
  });
});

describe('AdminService.reject', () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = 'test-key';
  });

  it('requires a reason from the fixed list', async () => {
    const { service } = build();
    await expect(
      service.reject('c-1', 'because I said so' as never, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
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
        before: expect.objectContaining({ status: 'SUBMITTED' }),
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

    expect(updates[0]).toMatchObject({
      id: 'c-2',
      patch: expect.objectContaining({ status: 'DUPLICATE', duplicateOfId: 'c-1' }),
    });
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

  it('refuses to point at an original that does not exist', async () => {
    const { service } = build([complaint({ id: 'c-1' })]);
    await expect(service.markDuplicate('c-1', 'ghost', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminService.assign', () => {
  it('moves the complaint to ASSIGNED and audits who did it', async () => {
    const { service, updates, audit } = build();

    await service.assign('c-1', 'insp-1', 'admin-1');

    expect(updates[0].patch).toMatchObject({
      status: 'ASSIGNED',
      assignedInspectorId: 'insp-1',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPLAINT_ASSIGNED' }),
    );
  });

  it('refuses an inspector id that is not an inspector', async () => {
    const { service } = build();
    (service as any).users.findOne = jest.fn(async () => null);
    await expect(service.assign('c-1', 'nobody', 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AdminService.planning', () => {
  it('ranks establishments by risk and carries the factor breakdown per row', async () => {
    const { service } = build();
    const rows = await service.planning();
    expect(rows[0]).toHaveProperty('risk', 51);
    expect(Array.isArray(rows[0].factors)).toBe(true);
  });
});

describe('AdminService.updateRiskWeights', () => {
  const valid = {
    PRIOR_VIOLATIONS: 50,
    COMPLAINT_PRESSURE: 20,
    TIME_SINCE_INSPECTION: 20,
    CATEGORY: 10,
  };

  it('recalculates every establishment so the queue reflects the new formula immediately', async () => {
    // Regression: a live-server check found the queue kept showing the old
    // ranking after a weight change, because the cached snapshots were never
    // invalidated. An admin adjusting the formula has no other way to see it
    // take effect.
    const { service, risk } = build();
    await service.updateRiskWeights(valid, 'admin-1');
    expect(risk.recalculateAll).toHaveBeenCalled();
  });
});

describe('grade integrity', () => {
  it('exposes no method that could write a grade', () => {
    // Spec §3.1: admins cannot change grades. Only a submitted inspection can.
    const names = Object.getOwnPropertyNames(AdminService.prototype);
    expect(names.filter((n) => /grade|score/i.test(n))).toEqual([]);
  });

  it('never writes a grade field when transitioning a complaint', async () => {
    const { service, updates } = build();
    await service.close('c-1', 'admin-1');
    for (const update of updates) {
      expect(Object.keys(update.patch)).not.toContain('currentGrade');
      expect(Object.keys(update.patch)).not.toContain('grade');
    }
  });
});
