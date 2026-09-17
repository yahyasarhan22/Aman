import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnerService } from './owner.service';
import * as uploads from '../uploads/uploads.controller';

let realUploads = new Set<string>();
jest.spyOn(uploads, 'uploadExists').mockImplementation(async (id: string) => realUploads.has(id));

beforeEach(() => {
  realUploads = new Set(['fix-1.jpg']);
});

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
    verifiedAt: null,
    ...over,
  };
}

function build(rows: any[] = [violation()]) {
  const updates: { id: string; patch: any }[] = [];
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
      update: jest.fn(async (id: string, patch: any) => {
        updates.push({ id, patch });
      }),
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
    for (const forbidden of ['ipHash', 'contactPhone', 'complaint', 'reference']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('separates open items from those already resolved', async () => {
    const { service } = build([
      violation({ id: 'v-1', status: 'OPEN' }),
      violation({ id: 'v-2', status: 'VERIFIED', verifiedAt: new Date() }),
    ]);
    const result = await service.overview('est-1');
    expect(result.openViolations.map((v) => v.id)).toEqual(['v-1']);
    expect(result.resolvedViolations.map((v) => v.id)).toEqual(['v-2']);
  });

  it('flags an open violation past its deadline as overdue', async () => {
    const { service } = build([
      violation({ status: 'OPEN', deadlineAt: new Date('2020-01-01T00:00:00Z') }),
    ]);
    const result = await service.overview('est-1');
    expect(result.openViolations[0].overdue).toBe(true);
  });

  it('does not call a responded violation overdue — the owner has acted', async () => {
    const { service } = build([
      violation({ status: 'OWNER_RESPONDED', deadlineAt: new Date('2020-01-01T00:00:00Z') }),
    ]);
    const result = await service.overview('est-1');
    expect(result.openViolations[0].overdue).toBe(false);
  });
});

describe('OwnerService.respond', () => {
  it('moves the violation to awaiting verification and records the evidence', async () => {
    const { service, updates } = build();

    await service.respond('v-1', { note: 'تم استبدال الوحدة', photoIds: ['fix-1.jpg'] }, 'est-1');

    expect(updates[0].patch).toMatchObject({
      status: 'OWNER_RESPONDED',
      ownerResponse: 'تم استبدال الوحدة',
      evidencePhotoIds: 'fix-1.jpg',
    });
    expect(updates[0].patch.respondedAt).toBeInstanceOf(Date);
  });

  it('ignores an invented evidence id rather than trusting the client', async () => {
    const { service, updates } = build();
    await service.respond('v-1', { note: 'تم', photoIds: ['made-up.jpg'] }, 'est-1');
    expect(updates[0].patch.evidencePhotoIds).toBeNull();
  });

  it('does not touch the grade — only an inspection can (§6.4)', async () => {
    const { service, updates } = build();
    await service.respond('v-1', { note: 'تم', photoIds: [] }, 'est-1');
    for (const update of updates) {
      const keys = Object.keys(update.patch);
      expect(keys).not.toContain('currentGrade');
      expect(keys).not.toContain('grade');
      expect(keys).not.toContain('currentScore');
    }
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

  it('writes the response to the audit trail', async () => {
    const { service, audit } = build();
    await service.respond('v-1', { note: 'تم', photoIds: [] }, 'est-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VIOLATION_OWNER_RESPONDED',
        actorId: 'owner:est-1',
        entityId: 'v-1',
      }),
    );
  });
});

describe('grade integrity', () => {
  it('exposes no method that could write a grade or a score', () => {
    const names = Object.getOwnPropertyNames(OwnerService.prototype);
    expect(names.filter((n) => /grade|score/i.test(n))).toEqual([]);
  });
});
