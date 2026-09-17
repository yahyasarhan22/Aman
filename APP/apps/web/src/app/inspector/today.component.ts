import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AppBarComponent } from './app-bar.component';
import { GradeBadgeComponent } from '../ui/grade-badge.component';
import { RiskBadgeComponent } from '../ui/risk-badge.component';
import { ESTABLISHMENT_FORMS, arabicCount } from '@aman/shared';
import { InspectorService, type CompletedTodayEntry, type QueueEntry } from '../core/inspector.service';
import { T } from '../core/strings';

@Component({
  selector: 'app-today',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, AppBarComponent, GradeBadgeComponent, RiskBadgeComponent],
  template: `
    <app-bar [title]="t.queue.title" [subtitle]="t.queue.subtitle" />

    <main class="page">
      <div class="page__head">
        <p class="count">{{ assignedLabel() }}</p>
        <button type="button" class="btn btn--ghost btn--sm" (click)="load()" [disabled]="busy()">
          {{ t.queue.refresh }}
        </button>
      </div>

      <ul class="summary">
        <li class="summary__tile">
          <span class="summary__value ltr">{{ totalAssigned() }}</span>
          <span class="summary__label">{{ t.queue.assigned }}</span>
        </li>
        <li class="summary__tile" [style.--risk]="'var(--risk-high)'">
          <span class="summary__value ltr">{{ tierCounts().high }}</span>
          <span class="summary__label">{{ t.queue.riskHigh }}</span>
        </li>
        <li class="summary__tile" [style.--risk]="'var(--risk-mid)'">
          <span class="summary__value ltr">{{ tierCounts().mid }}</span>
          <span class="summary__label">{{ t.queue.riskMid }}</span>
        </li>
        <li class="summary__tile" [style.--risk]="'var(--risk-low)'">
          <span class="summary__value ltr">{{ tierCounts().low }}</span>
          <span class="summary__label">{{ t.queue.riskLow }}</span>
        </li>
      </ul>

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

      <div class="tabs" role="tablist">
        <button type="button" class="tab" [class.tab--on]="tab() === 'remaining'" (click)="tab.set('remaining')">
          {{ t.queue.remainingTab }} · <span class="ltr">{{ entries().length }}</span>
        </button>
        <button type="button" class="tab" [class.tab--on]="tab() === 'completed'" (click)="tab.set('completed')">
          {{ t.queue.completedToday }} · <span class="ltr">{{ completed().length }}</span>
        </button>
      </div>

      @if (tab() === 'remaining') {
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
      } @else {
        @if (completed().length === 0) {
          <p class="completed__empty">{{ t.queue.completedEmpty }}</p>
        } @else {
          <ol class="completed__list">
            @for (done of completed(); track done.id) {
              <li class="completed__entry">
                <a class="completed__link" [routerLink]="['/app/inspections', done.id]">
                  <span class="completed__name">{{ done.nameAr }}</span>
                  <app-grade-badge [grade]="done.grade" variant="chip" />
                </a>
              </li>
            }
          </ol>
        }
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

      .summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--s2);
      }

      .summary__tile {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius);
        padding: var(--s2);
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .summary__value {
        font-size: var(--text-lede);
        font-weight: 700;
        color: var(--risk, var(--ink));
      }

      .summary__label {
        font-size: 11px;
        color: var(--ink-muted);
      }

      .tabs {
        display: flex;
        gap: var(--s2);
      }

      .tab {
        flex: 1;
        min-height: 38px;
        border: 1px solid var(--rule);
        border-radius: var(--radius);
        background: var(--card);
        color: var(--ink-muted);
        font-size: 13px;
        font-weight: 700;
      }

      .tab--on {
        background: var(--ink);
        border-color: var(--ink);
        color: #fff;
      }

      .completed__list {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      .completed__entry {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius);
        opacity: 0.85;
      }

      .completed__link {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        padding: var(--s2) var(--s3);
        text-decoration: none;
        color: inherit;
      }

      .completed__name {
        font-size: var(--text-caption);
        color: var(--ink-2);
      }

      .completed__empty {
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
  readonly completed = signal<CompletedTodayEntry[]>([]);
  readonly tab = signal<'remaining' | 'completed'>('remaining');
  readonly stale = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly starting = signal<string | null>(null);
  readonly hasDraft = signal<Set<string>>(new Set());
  readonly fetchedAt = this.inspector.queueFetchedAt;

  readonly totalAssigned = computed(() => this.entries().length + this.completed().length);

  readonly assignedLabel = computed(
    () => `${arabicCount(this.totalAssigned(), ESTABLISHMENT_FORMS)} ${T.queue.assigned}`,
  );

  /** Priority tiers mirror the thresholds RiskBadgeComponent renders (§5.4),
   *  counted over what's still left to visit today. */
  readonly tierCounts = computed(() => {
    let high = 0;
    let mid = 0;
    let low = 0;
    for (const entry of this.entries()) {
      if (entry.risk >= 70) high++;
      else if (entry.risk >= 40) mid++;
      else low++;
    }
    return { high, mid, low };
  });

  constructor() {
    void this.load();
    void this.inspector.drainOutbox();
  }

  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const [{ entries, stale }, completed] = await Promise.all([
        this.inspector.getQueue(),
        this.inspector.getCompletedToday().catch(() => []),
      ]);
      this.entries.set(entries);
      this.stale.set(stale);
      this.completed.set(completed);
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
    } catch (error) {
      // A 404 here means this establishment id is gone — most likely this
      // screen was left open across a reseed, which mints new ids for every
      // establishment. Re-pull the queue so the stale card is replaced by a
      // current one instead of leaving the admin stuck on a dead id forever.
      if ((error as { status?: number })?.status === 404) {
        await this.load();
        this.error.set(T.queue.staleEntry);
      } else {
        this.error.set(T.checklist.loadFailed);
      }
    } finally {
      this.starting.set(null);
    }
  }
}
