import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AppBarComponent } from './app-bar.component';
import { InspectorService, type OutboxEntry } from '../core/inspector.service';
import { T } from '../core/strings';

/**
 * Spec §9: never sync silently. Every queued submission is visible here with
 * its failure count, and after repeated failures the inspector gets a manual
 * retry rather than a spinner that never resolves.
 */
@Component({
  selector: 'app-sync',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, AppBarComponent],
  template: `
    <app-bar [title]="t.sync.title" />

    <main class="page">
      @if (entries().length === 0) {
        <section class="empty">
          <p class="empty__title">{{ t.sync.empty }}</p>
        </section>
      } @else {
        <button type="button" class="btn btn--block" [disabled]="busy() || !inspector.online()" (click)="retryAll()">
          {{ busy() ? t.sync.syncing : t.sync.retryAll }}
        </button>

        <ul class="list">
          @for (entry of entries(); track entry.clientId) {
            <li class="row">
              <div class="row__head">
                <span class="row__name">{{ entry.establishmentNameAr }}</span>
                <span class="row__time ltr">{{ entry.savedAt | date: 'yyyy-MM-dd HH:mm' }}</span>
              </div>
              @if (entry.attempts > 0) {
                <p class="row__attempts">
                  {{ t.sync.failedAttempts }}: <span class="ltr">{{ entry.attempts }}</span>
                </p>
              }
              @if (entry.lastError) {
                <p class="row__error">{{ entry.lastError }}</p>
              }
            </li>
          }
        </ul>
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-block-size: 100dvh;
        background: var(--paper);
      }

      .page {
        max-inline-size: 560px;
        margin-inline: auto;
        padding: var(--s4) var(--s4) var(--s7);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .empty {
        padding: var(--s6) var(--s4);
        text-align: center;
        background: var(--card);
        border: 1px dashed var(--rule-strong);
        border-radius: var(--radius-lg);
      }

      .empty__title {
        font-weight: 700;
        color: var(--ink);
      }

      .list {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }

      .row {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
        padding: var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s1);
      }

      .row__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--s3);
      }

      .row__name {
        font-weight: 700;
        color: var(--ink);
      }

      .row__time {
        font-size: 12px;
        color: var(--ink-muted);
      }

      .row__attempts {
        font-size: 13px;
        color: var(--ink-muted);
      }

      .row__error {
        font-size: 13px;
        color: var(--danger);
      }
    `,
  ],
})
export class SyncComponent {
  readonly t = T;
  readonly inspector = inject(InspectorService);

  readonly entries = signal<OutboxEntry[]>([]);
  readonly busy = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.entries.set((await this.inspector.getOutbox()).map((e) => e.value));
  }

  async retryAll(): Promise<void> {
    this.busy.set(true);
    try {
      await this.inspector.drainOutbox();
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
