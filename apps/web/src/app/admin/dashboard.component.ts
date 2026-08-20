import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BarChartComponent, type BarDatum } from '../ui/bar-chart.component';
import { AdminService, type DashboardData } from './admin.service';
import { T } from '../core/strings';

const GRADE_COLOR: Record<string, string> = {
  A: 'var(--grade-a)',
  B: 'var(--grade-b)',
  C: 'var(--grade-c)',
  D: 'var(--grade-d)',
};

/**
 * Spec §5.8: "needs attention" is the most valuable block on this screen — a
 * dashboard that only reports numbers gets opened twice and abandoned. It
 * renders right under the KPI row, before either chart.
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChartComponent],
  template: `
    <main class="page">
      <h1 class="page__title">{{ t.admin.dashboard.title }}</h1>

      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <p class="muted">{{ t.common.loading }}</p>
      } @else if (data(); as d) {
        <div class="kpis">
          <div class="kpi">
            <span class="kpi__value ltr">{{ d.kpis.registeredCount }}</span>
            <span class="kpi__label">{{ t.admin.dashboard.registered }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__value ltr">{{ d.kpis.highRiskCount }}</span>
            <span class="kpi__label">{{ t.admin.dashboard.highRisk }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__value ltr">{{ d.kpis.complaintsThisMonth }}</span>
            <span class="kpi__label">{{ t.admin.dashboard.complaintsThisMonth }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__value ltr">{{ d.kpis.avgCloseDays ?? '—' }}</span>
            <span class="kpi__label">{{ t.admin.dashboard.avgCloseDays }}</span>
          </div>
        </div>

        <section class="attention">
          <h2 class="eyebrow">{{ t.admin.dashboard.needsAttention }}</h2>
          @if (hasAttentionItems()) {
            <ul class="attention__list">
              @if (d.needsAttention.staleComplaints > 0) {
                <li>
                  <span class="ltr">{{ d.needsAttention.staleComplaints }}</span>
                  {{ t.admin.dashboard.staleComplaints }}
                </li>
              }
              @if (d.needsAttention.overdueViolations > 0) {
                <li>
                  <span class="ltr">{{ d.needsAttention.overdueViolations }}</span>
                  {{ t.admin.dashboard.overdueViolations }}
                </li>
              }
              @if (d.needsAttention.uninspectedEstablishments > 0) {
                <li>
                  <span class="ltr">{{ d.needsAttention.uninspectedEstablishments }}</span>
                  {{ t.admin.dashboard.uninspectedEstablishments }}
                </li>
              }
            </ul>
          } @else {
            <p class="muted">{{ t.admin.dashboard.allClear }}</p>
          }
        </section>

        <div class="charts">
          <section class="chart">
            <h2 class="eyebrow">{{ t.admin.dashboard.gradeDistribution }}</h2>
            @if (gradeBars().length) {
              <app-bar-chart [bars]="gradeBars()" />
            } @else {
              <p class="muted">{{ t.admin.dashboard.noData }}</p>
            }
          </section>

          <section class="chart">
            <h2 class="eyebrow">{{ t.admin.dashboard.complaintsOverTime }}</h2>
            @if (weekBars().length) {
              <app-bar-chart [bars]="weekBars()" />
            } @else {
              <p class="muted">{{ t.admin.dashboard.noData }}</p>
            }
          </section>
        </div>
      }
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
        gap: var(--s5);
      }
      .page__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }
      .muted {
        color: var(--ink-muted);
        font-size: var(--text-caption);
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--s3);
      }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        padding: var(--s4);
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
      }
      .kpi__value {
        font-size: 32px;
        font-weight: 700;
        color: var(--ink);
      }
      .kpi__label {
        font-size: 12px;
        color: var(--ink-muted);
      }
      .attention {
        padding: var(--s4);
        background: var(--warn-bg);
        border-radius: var(--radius-lg);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }
      .attention__list {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        font-size: var(--text-caption);
        font-weight: 700;
        color: var(--ink-2);
      }
      .charts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--s4);
      }
      .chart {
        padding: var(--s4);
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
    `,
  ],
})
export class AdminDashboardComponent {
  readonly t = T;
  private admin = inject(AdminService);

  readonly data = signal<DashboardData | null>(null);
  readonly error = signal<string | null>(null);

  readonly hasAttentionItems = computed(() => {
    const n = this.data()?.needsAttention;
    return !!n && (n.staleComplaints > 0 || n.overdueViolations > 0 || n.uninspectedEstablishments > 0);
  });

  readonly gradeBars = computed<BarDatum[]>(
    () =>
      this.data()?.gradeDistribution.map((g) => ({
        label: g.grade,
        value: g.count,
        color: GRADE_COLOR[g.grade],
      })) ?? [],
  );

  readonly weekBars = computed<BarDatum[]>(
    () =>
      this.data()?.complaintsOverTime.map((w) => ({ label: w.weekStart.slice(5), value: w.count })) ??
      [],
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.data.set(await this.admin.dashboard());
    } catch {
      this.error.set(T.admin.dashboard.loadFailed);
    }
  }
}
