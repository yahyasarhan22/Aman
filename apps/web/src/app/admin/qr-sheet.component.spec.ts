import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AdminQrSheetComponent } from './qr-sheet.component';
import { AdminService } from './admin.service';

const ENTRIES = [
  { slug: 'a', nameAr: 'أ', category: 'BAKERY', publicUrl: 'http://x/e/a', qrDataUrl: 'data:image/png;base64,x' },
  { slug: 'b', nameAr: 'ب', category: 'CAFE', publicUrl: 'http://x/e/b', qrDataUrl: 'data:image/png;base64,y' },
];

function build(qrBatch = vi.fn(async () => ENTRIES)) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminQrSheetComponent],
    providers: [{ provide: AdminService, useValue: { qrBatch } }],
  });
  const fixture = TestBed.createComponent(AdminQrSheetComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AdminQrSheetComponent', () => {
  it('loads every active establishment as a sticker entry', async () => {
    const fixture = build();
    await fixture.whenStable();
    expect(fixture.componentInstance.entries().length).toBe(2);
  });

  it('reports a load failure rather than an empty silent sheet', async () => {
    const fixture = build(vi.fn(async () => Promise.reject(new Error('x'))));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.componentInstance.error()).toBeTruthy();
  });

  it('exposes each entry with a real data-URL image, not a placeholder', async () => {
    const fixture = build();
    await fixture.whenStable();
    for (const entry of fixture.componentInstance.entries()) {
      expect(entry.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    }
  });
});
