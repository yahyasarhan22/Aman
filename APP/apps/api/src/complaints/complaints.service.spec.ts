import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplaintsService, type SubmitComplaintDto } from './complaints.service';
import * as uploads from '../uploads/uploads.controller';

// Only ids this server actually wrote count as evidence. The real check hits
// the filesystem; here we decide per-id what exists.
let realUploads = new Set<string>();
jest.spyOn(uploads, 'uploadExists').mockImplementation(async (id: string) => realUploads.has(id));

beforeEach(() => {
  realUploads = new Set(['img-1.jpg']);
});

function build(options: { existingCount?: number; establishment?: any | null } = {}) {
  const saved: any[] = [];
  const establishment =
    options.establishment === undefined
      ? { id: 'est-1', slug: 'golden-oven-nablus', nameAr: 'الفرن الذهبي', status: 'ACTIVE' }
      : options.establishment;

  const recalculate = jest.fn(async () => ({ total: 51, factors: [] }));

  const service = new ComplaintsService(
    {
      findOne: jest.fn(async ({ where }: any) =>
        where.reference ? (saved.find((c) => c.reference === where.reference) ?? null) : null,
      ),
      count: jest.fn(async () => options.existingCount ?? 0),
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

const dto = (over: Partial<SubmitComplaintDto> = {}): SubmitComplaintDto => ({
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
    const result = await service.submit(dto(), '10.0.0.1');
    expect(Object.keys(result)).toEqual(['reference']);
    expect(result.reference).toMatch(/^[0-9]{4}$/);
  });

  it('rejects an invented photo id instead of treating it as evidence', async () => {
    // Evidence triples a complaint's weight in the Risk Score (§6.2). If a
    // client could name any file, anyone could fabricate evidence and drive an
    // establishment up the queue — defeating the anti-malicious-complaint
    // weighting entirely.
    const { service, saved } = build();
    await expect(
      service.submit(dto({ photoIds: ['totally-made-up.jpg'] }), '10.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saved).toHaveLength(0);
  });

  it('rejects a photo id shaped to escape the upload directory', async () => {
    const { service } = build();
    await expect(
      service.submit(dto({ photoIds: ['../../etc/passwd'] }), '10.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a complaint with a photo as documented, which is what the risk score weights', async () => {
    const { service, saved } = build();
    await service.submit(dto({ photoIds: ['img-1.jpg'] }), '10.0.0.1');
    expect(saved[0].hasEvidence).toBe(true);
    expect(saved[0].photoIds).toBe('img-1.jpg');
  });

  it('never stores a raw IP address', async () => {
    const { service, saved } = build();
    await service.submit(dto(), '10.0.0.1');
    expect(JSON.stringify(saved[0])).not.toContain('10.0.0.1');
    expect(saved[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('encrypts the contact phone rather than storing it in the clear', async () => {
    const { service, saved } = build();
    await service.submit(dto({ contactPhone: '0599123456' }), '10.0.0.1');
    expect(saved[0].contactPhoneEncrypted).not.toContain('0599123456');
    expect(saved[0].contactPhoneEncrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('recalculates the risk score so the queue reorders immediately', async () => {
    const { service, recalculate } = build();
    await service.submit(dto(), '10.0.0.1');
    expect(recalculate).toHaveBeenCalledWith('est-1', 'COMPLAINT');
  });

  it('opens the complaint as SUBMITTED with no triage decisions pre-made', async () => {
    const { service, saved } = build();
    await service.submit(dto(), '10.0.0.1');
    expect(saved[0].status).toBe('SUBMITTED');
    expect(saved[0].rejectionReason).toBeNull();
    expect(saved[0].duplicateOfId).toBeNull();
    expect(saved[0].assignedInspectorId).toBeNull();
  });

  it('rejects a description longer than 300 characters', async () => {
    const { service } = build();
    await expect(service.submit(dto({ description: 'ا'.repeat(301) }), '10.0.0.1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty or whitespace-only description', async () => {
    const { service } = build();
    await expect(service.submit(dto({ description: '   ' }), '10.0.0.1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a category outside the six form options', async () => {
    const { service } = build();
    await expect(
      service.submit(dto({ category: 'ARSON' as never }), '10.0.0.1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown establishment', async () => {
    const { service } = build({ establishment: null });
    await expect(service.submit(dto(), '10.0.0.1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('silently discards a honeypot submission and stores nothing', async () => {
    // A bot that fills the hidden field gets a plausible reference so it does
    // not learn it was caught, but nothing reaches the database.
    const { service, saved, recalculate } = build();
    const result = await service.submit(dto({ honeypot: 'http://spam' }), '10.0.0.1');
    expect(result.reference).toMatch(/^[0-9]{4}$/);
    expect(saved).toHaveLength(0);
    expect(recalculate).not.toHaveBeenCalled();
  });

  it('refuses a fourth complaint from one IP about one establishment in 24h', async () => {
    const { service } = build({ existingCount: 3 });
    await expect(service.submit(dto(), '10.0.0.1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ComplaintsService.trackByReference', () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = 'test-key';
  });

  it('returns a status timeline and nothing that identifies anyone', async () => {
    const { service } = build();
    const { reference } = await service.submit(dto(), '10.0.0.1');

    const status = await service.trackByReference(reference);

    expect(status.reference).toBe(reference);
    expect(status.status).toBe('SUBMITTED');
    expect(status.timeline).toHaveLength(5);
    expect(status.timeline[0]).toMatchObject({ key: 'SUBMITTED', reached: true });
    expect(status.timeline[1].reached).toBe(false);

    // Spec §5.3: never expose the inspector's name or internal notes.
    const serialized = JSON.stringify(status);
    for (const forbidden of ['ipHash', 'contactPhone', 'assignedInspectorId', 'rejectionReason']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('accepts the hash-prefixed reference the success screen shows', async () => {
    const { service } = build();
    const { reference } = await service.submit(dto(), '10.0.0.1');
    await expect(service.trackByReference(`#${reference}`)).resolves.toMatchObject({ reference });
  });

  it('rejects a malformed reference without querying', async () => {
    const { service } = build();
    await expect(service.trackByReference("' OR 1=1 --")).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports an unknown reference as not found', async () => {
    const { service } = build();
    await expect(service.trackByReference('9999')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ComplaintsService.trackByReference — enumeration throttle', () => {
  beforeAll(() => {
    process.env.CONTACT_ENCRYPTION_KEY = 'test-key';
  });

  it('throttles repeated lookups from one address', async () => {
    // A four-digit reference is 9,000 values. Tracking is loginless by design
    // (§5.3), so the throttle is what stops the whole table being walked.
    const { service } = build();
    let refused = 0;

    for (let i = 0; i < 60; i++) {
      await service.trackByReference('9999', '10.0.0.1').catch((e) => {
        if (e instanceof BadRequestException) refused++;
      });
    }

    expect(refused).toBeGreaterThan(0);
  });

  it('counts each address separately', async () => {
    const { service } = build();
    for (let i = 0; i < 45; i++) {
      await service.trackByReference('9999', '10.0.0.1').catch(() => undefined);
    }

    // A fresh address is unaffected: it gets a not-found, not a throttle.
    await expect(service.trackByReference('9999', '10.0.0.2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('grade integrity', () => {
  it('exposes no method that could write a grade', () => {
    const names = Object.getOwnPropertyNames(ComplaintsService.prototype);
    expect(names.filter((n) => /grade|score/i.test(n))).toEqual([]);
  });
});
