import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GradeBadgeComponent } from '../ui/grade-badge.component';
import { RiskBadgeComponent } from '../ui/risk-badge.component';
import { RiskFactorsComponent } from '../ui/risk-factors.component';
import { AdminService, type PlanningRow } from './admin.service';
import { T } from '../core/strings';
import type { Grade } from '@aman/shared';

/**
 * Spec §5.10 and the §13 demo at minute 3: this is the screen that shows a
 * complaint moved the queue and not the grade. The factor breakdown has to be
 * reachable in one click, because the whole argument is that the ranking is
 * explainable rather than a black box.
 */
@Component({
  selector: 'app-admin-planning',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, GradeBadgeComponent, RiskBadgeComponent, RiskFactorsComponent],
  template: `
    <main class="page">
      <div class="page__head">
        <div>
          <h1 class="page__title">{{ t.admin.planning.title }}</h1>
          <p class="page__lede">{{ t.admin.planning.lede }}</p>
        </div>
        <button type="button" class="btn btn--ghost" (click)="load()" [disabled]="busy()">
          {{ t.admin.planning.refresh }}
        </button>
      </div>

      <p class="grade-note">{{ t.admin.planning.gradeNote }}</p>

      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      } @else if (busy() && rows().length === 0) {
        <p class="muted">{{ t.common.loading }}</p>
      } @else if (rows().length === 0) {
        <p class="muted">{{ t.admin.planning.empty }}</p>
      }

      <ol class="rows">
        @for (row of rows(); track row.establishmentId; let i = $index) {
          <li class="row">
            <div class="row__head">
              <span class="row__rank ltr">{{ i + 1 }}</span>

              <div class="row__id">
                <a class="row__name" [routerLink]="['/e', row.slug]">{{ row.nameAr }}</a>
                <p class="row__meta">
                  {{ t.admin.planning.lastInspection }}:
                  @if (row.lastInspectionAt) {
                    <span class="ltr">{{ row.lastInspectionAt | date: 'yyyy-MM-dd' }}</span>
                  } @else {
                    {{ t.admin.planning.never }}
                  }
                </p>
              </div>

              <app-grade-badge [grade]="asGrade(row.currentGrade)" variant="chip" />
              <app-risk-badge [value]="row.risk" />

              <button
                type="button"
                class="row__toggle"
                [attr.aria-expanded]="expanded() === row.establishmentId"
                (click)="toggle(row.establishmentId)"
              >
                {{
                  expanded() === row.establishmentId
                    ? t.admin.planning.hide
                    : t.admin.planning.breakdown
                }}
              </button>
            </div>

            @if (expanded() === row.establishmentId) {
              <div class="row__breakdown">
                <app-risk-factors [factors]="row.factors" />
              </div>
            }
          </li>
        }
      </ol>
    </main>
  `,
  styles: [
    `
      .page {
        max-inline-size: 1180px;
        margin-inline: auto;
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .page__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s4);
        flex-wrap: wrap;
      }

      .page__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }

      .page__lede {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }

      .grade-note {
        padding: var(--s3);
        background: var(--inset);
        border: 1px solid var(--rule);
        border-radius: var(--radius);
        font-size: 13px;
        color: var(--ink-2);
      }

      .muted {
        color: var(--ink-muted);
        font-size: var(--text-caption);
      }

      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      .row {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
      }

      .row__head {
        display: flex;
        align-items: center;
        gap: var(--s4);
        padding: var(--s3) var(--s4);
      }

      /* Rank is real information — this list is an ordered instruction. */
      .row__rank {
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

      .row__id {
        flex: 1;
        min-inline-size: 0;
      }

      .row__name {
        font-size: var(--text-body);
        font-weight: 700;
        color: var(--ink);
        text-decoration: none;
      }

      .row__name:hover {
        text-decoration: underline;
      }

      .row__meta {
        font-size: 12px;
        color: var(--ink-muted);
      }

      .row__toggle {
        flex: none;
        min-block-size: 34px;
        padding: 0 var(--s3);
        border: 1px solid var(--rule-strong);
        border-radius: var(--radius);
        background: transparent;
        font-size: 13px;
        cursor: pointer;
      }

      .row__toggle:hover {
        background: var(--inset);
      }

      .row__breakdown {
        padding: var(--s3) var(--s4) var(--s4);
        border-block-start: 1px solid var(--rule);
        background: var(--inset);
      }
    `,
  ],
})
export class AdminPlanningComponent {
  readonly t = T;
  private admin = inject(AdminService);

  readonly rows = signal<PlanningRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly expanded = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  asGrade(grade: string | null): Grade | null {
    return (grade as Grade) ?? null;
  }

  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.admin.planning());
    } catch {
      this.error.set(T.admin.loadFailed);
    } finally {
      this.busy.set(false);
    }
  }

  toggle(id: string): void {
    this.expanded.update((current) => (current === id ? null : id));
  }
}
