import { QrService } from './qr.service';

function build(establishments: any[]) {
  const repo = { find: jest.fn(async () => establishments) };
  return new QrService(repo as any);
}

describe('QrService.batch', () => {
  it('returns one entry per active establishment with a data-URL QR code', async () => {
    const service = build([
      { slug: 'golden-oven-nablus', nameAr: 'الفرن الذهبي', category: 'BAKERY', status: 'ACTIVE' },
    ]);

    const [entry] = await service.batch('http://localhost:4200');

    expect(entry.slug).toBe('golden-oven-nablus');
    expect(entry.publicUrl).toBe('http://localhost:4200/e/golden-oven-nablus');
    // A PNG data URL, not a raw file path — the frontend renders it directly.
    expect(entry.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('encodes the public establishment URL, never a raw database id (§4)', async () => {
    const service = build([
      { slug: 'nour-bakery', nameAr: 'مخبز النور', category: 'BAKERY', status: 'ACTIVE' },
    ]);
    const [entry] = await service.batch('https://aman.ps');
    expect(entry.publicUrl).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // no uuid in the URL
  });

  it('returns one entry per establishment for a multi-row batch', async () => {
    const service = build([
      { slug: 'a', nameAr: 'أ', category: 'CAFE', status: 'ACTIVE' },
      { slug: 'b', nameAr: 'ب', category: 'RETAIL', status: 'ACTIVE' },
    ]);
    const entries = await service.batch('http://localhost:4200');
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.slug)).toEqual(['a', 'b']);
  });
});
