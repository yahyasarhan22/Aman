import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { AppBarComponent } from './app-bar.component';
import { GradeBadgeComponent } from '../ui/grade-badge.component';
import { RiskBadgeComponent } from '../ui/risk-badge.component';
import { ESTABLISHMENT_FORMS, arabicCount } from '@aman/shared';
import { InspectorService, type QueueEntry } from '../core/inspector.service';
import { T } from '../core/strings';

@Component({
  selector: 'app-today',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, AppBarComponent, GradeBadgeComponent, RiskBadgeComponent],
  template: `
    <app-bar [title]="t.queue.title" [subtitle]="t.queue.subtitle" />

    <main class="page">
      <div class="page__head">
        <p class="count">{{ assignedLabel() }}</p>
        <button type="button" class="btn btn--ghost btn--sm" (click)="load()" [disabled]="busy()">
          {{ t.queue.refresh }}
        </button>
      </div>

      @if (stale() && fetchedAt()) {
        <p class="stale">
          {{ t.queue.offlineList }}
          {{ t.queue.lastUpdated }}
          <span class="ltr">{{ fetchedAt() | date: 'HH:mm' }}</span>
        </p>
      }

      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      }

      @if (busy() && entries().length === 0) {
        <p class="muted">{{ t.common.loading }}</p>
      } @else if (entries().length === 0) {
        <section class="empty">
          <p class="empty__title">{{ t.queue.empty }}</p>
          <p class="empty__hint">{{ t.queue.emptyHint }}</p>
        </section>
      }

      <ol class="queue">
        @for (entry of entries(); track entry.establishmentId; let i = $index) {
          <li class="entry">
            <div class="entry__top">
              <span class="entry__rank ltr">{{ i + 1 }}</span>
              <div class="entry__id">
                <h2 class="entry__name">{{ entry.nameAr }}</h2>
                @if (entry.address) {
                  <p class="entry__address">{{ entry.address }}</p>
                }
              </div>
              <app-grade-badge [grade]="entry.currentGrade" variant="chip" />
            </div>

            <div class="entry__body">
              <app-risk-badge [value]="entry.risk" />
              <!-- Spec §5.4: the reasons are the explainability requirement,
                   not decoration. An inspector has to justify the visit order. -->
              <ul class="reasons" [attr.aria-label]="t.queue.why">
                @for (reason of entry.reasons; track reason) {
                  <li>{{ reason }}</li>
                }
              </ul>
            </div>

            <button type="button" class="btn btn--block" (click)="start(entry)" [disabled]="starting() === entry.establishmentId">
              {{ hasDraft().has(entry.establishmentId) ? t.queue.resume : t.queue.start }}
            </button>
          </li>
        }
      </ol>
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
        gap: var(--s3);
      }

      .page__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
      }

      .count {
        font-size: var(--text-caption);
        font-weight: 700;
        color: var(--ink-muted);
      }

      .btn--sm {
        min-height: 34px;
        padding: 0 var(--s3);
        font-size: 13px;
      }

      .stale {
        padding: var(--s2) var(--s3);
        background: var(--warn-bg);
        border-radius: var(--radius);
        font-size: 13px;
        color: var(--ink-2);
      }

      .muted {
        color: var(--ink-muted);
        font-size: var(--text-caption);
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

      .empty__hint {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }

      .queue {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        counter-reset: rank;
      }

      .entry {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-card);
        padding: var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }

      .entry__top {
        display: flex;
        align-items: flex-start;
        gap: var(--s3);
      }

      /* Rank is real information here — the queue is an ordered instruction. */
      .entry__rank {
        flex: none;
        inline-size: 26px;
        block-size: 26px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: var(--ink);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
      }

      .entry__id {
        flex: 1;
        min-inline-size: 0;
      }

      .entry__name {
        font-size: var(--text-lede);
        font-weight: 700;
        line-height: 1.35;
        color: var(--ink);
      }

      .entry__address {
        font-size: 13px;
        color: var(--ink-muted);
      }

      .entry__body {
        display: flex;
        align-items: flex-start;
        gap: var(--s4);
        padding-block: var(--s3);
        border-block: 1px solid var(--rule);
      }

      .reasons {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        font-size: var(--text-caption);
        color: var(--ink-2);
      }

      .reasons li {
        position: relative;
        padding-inline-start: var(--s3);
      }

      .reasons li::before {
        content: '';
        position: absolute;
        inset-inline-start: 0;
        inset-block-start: 0.62em;
        inline-size: 5px;
        block-size: 5px;
        border-radius: 50%;
        background: var(--rule-strong);
      }
    `,
  ],
})
export class TodayComponent {
  readonly t = T;

  private inspector = inject(InspectorService);
  private router = inject(Router);

  readonly entries = signal<QueueEntry[]>([]);
  readonly stale = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly starting = signal<string | null>(null);
  readonly hasDraft = signal<Set<string>>(new Set());
  readonly fetchedAt = this.inspector.queueFetchedAt;

  readonly assignedLabel = computed(
    () => `${arabicCount(this.entries().length, ESTABLISHMENT_FORMS)} ${T.queue.assigned}`,
  );

  constructor() {
    void this.load();
    void this.inspector.drainOutbox();
  }

  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { entries, stale } = await this.inspector.getQueue();
      this.entries.set(entries);
      this.stale.set(stale);
      await this.markDrafts(entries);
    } catch {
      this.error.set(T.queue.loadFailed);
    } finally {
      this.busy.set(false);
    }
  }

  private async markDrafts(entries: QueueEntry[]): Promise<void> {
    const found = new Set<string>();
    for (const entry of entries) {
      if (await this.inspector.getDraft(entry.establishmentId)) found.add(entry.establishmentId);
    }
    this.hasDraft.set(found);
  }

  async start(entry: QueueEntry): Promise<void> {
    this.starting.set(entry.establishmentId);
    this.error.set(null);
    try {
      await this.inspector.startInspection(entry.establishmentId);
      await this.router.navigate(['/app/inspect', entry.establishmentId]);
    } catch {
      this.error.set(T.checklist.loadFailed);
    } finally {
      this.starting.set(null);
    }
  }
}
