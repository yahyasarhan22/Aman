import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AdminService, type QrEntry } from './admin.service';
import { T } from '../core/strings';

/**
 * Spec §5.10: A4, six stickers per page, name + QR + municipality name + the
 * short URL for anyone who cannot scan. `window.print()` and the browser's
 * own "Save as PDF" are the print pipeline deliberately, rather than a
 * generated PDF binary — no new dependency for a 4-week prototype, and what
 * prints is exactly what was reviewed on screen.
 */
@Component({
  selector: 'app-admin-qr-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="toolbar no-print">
      <h1 class="toolbar__title">{{ t.admin.qr.title }}</h1>
      <p class="toolbar__lede">{{ t.admin.qr.lede }}</p>
      <button type="button" class="btn" (click)="print()">{{ t.admin.qr.print }}</button>
      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      } @else if (entries().length === 0) {
        <p class="muted">{{ t.admin.qr.empty }}</p>
      }
    </main>

    <div class="sheet">
      @for (entry of entries(); track entry.slug) {
        <figure class="sticker">
          <img [src]="entry.qrDataUrl" [alt]="entry.nameAr" />
          <figcaption>
            <strong>{{ entry.nameAr }}</strong>
            <span class="ltr">{{ entry.publicUrl }}</span>
          </figcaption>
        </figure>
      }
    </div>
  `,
  styles: [
    `
      .toolbar {
        max-inline-size: 640px;
        margin-inline: auto;
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        align-items: flex-start;
      }
      .toolbar__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }
      .toolbar__lede {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }
      .muted {
        color: var(--ink-muted);
        font-size: var(--text-caption);
      }
      .sheet {
        max-inline-size: 210mm;
        margin-inline: auto;
        padding: 10mm;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8mm;
      }
      .sticker {
        margin: 0;
        padding: 6mm;
        border: 1px dashed var(--rule-strong);
        border-radius: var(--radius);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4mm;
        text-align: center;
        break-inside: avoid;
      }
      .sticker img {
        inline-size: 32mm;
        block-size: 32mm;
      }
      .sticker figcaption {
        display: flex;
        flex-direction: column;
        gap: 2mm;
        font-size: 11px;
      }
      /* Six per A4 page: three rows of two at this column count and image
         size, which is what the printed sheet is measured against. */
      @media print {
        .no-print {
          display: none;
        }
        .sheet {
          padding: 0;
        }
      }
    `,
  ],
})
export class AdminQrSheetComponent {
  readonly t = T;
  private admin = inject(AdminService);

  readonly entries = signal<QrEntry[]>([]);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.entries.set(await this.admin.qrBatch());
    } catch {
      this.error.set(T.admin.qr.loadFailed);
    }
  }

  print(): void {
    window.print();
  }
}
