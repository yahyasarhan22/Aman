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
  return { service: new AuditService(repo as any), saved };
}

describe('AuditService.record', () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = 'test-key';
  });

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
    expect(saved[0]).toMatchObject({
      actorId: 'user-1',
      action: 'COMPLAINT_REJECTED',
      entityType: 'complaint',
      entityId: 'c-1',
    });
    expect(JSON.parse(saved[0].beforeJson)).toEqual({ status: 'SUBMITTED' });
    expect(JSON.parse(saved[0].afterJson).rejectionReason).toBe('NOT_FOOD_SAFETY');
    expect(saved[0].createdAt).toBeInstanceOf(Date);
  });

  it('records null rather than the string "undefined" when a side is absent', async () => {
    const { service, saved } = build();
    await service.record({
      actorId: 'system',
      action: AUDIT_ACTIONS.COMPLAINT_CLOSED,
      entityType: 'complaint',
      entityId: 'c-1',
    });
    expect(saved[0].beforeJson).toBeNull();
    expect(saved[0].afterJson).toBeNull();
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
