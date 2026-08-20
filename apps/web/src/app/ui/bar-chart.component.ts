import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarDatum {
  label: string;
  value: number;
  /** Optional CSS colour; defaults to the primary token. */
  color?: string;
}

/**
 * Spec §10.1: charts mirror in RTL — axis on the right, bars growing
 * leftward. This is one <svg>, drawn right-to-left in its own coordinate
 * space rather than relying on the page's `dir` attribute, so it is correct
 * regardless of what wraps it.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + width + ' ' + height()" [attr.height]="height()" role="img">
      @for (bar of positioned(); track bar.label) {
        <text
          [attr.x]="width - 4"
          [attr.y]="bar.y + rowHeight / 2 - 4"
          class="label"
          text-anchor="end"
        >
          {{ bar.label }}
        </text>
        <rect
          [attr.x]="width - barMax - bar.barWidth"
          [attr.y]="bar.y + rowHeight / 2"
          [attr.width]="bar.barWidth"
          [attr.height]="8"
          [attr.fill]="bar.color"
          rx="2"
        />
        <text
          [attr.x]="width - barMax - bar.barWidth - 6"
          [attr.y]="bar.y + rowHeight / 2 + 8"
          class="value ltr"
          text-anchor="end"
        >
          {{ bar.value }}
        </text>
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      svg {
        inline-size: 100%;
      }
      .label {
        font-size: 12px;
        fill: var(--ink-2);
      }
      .value {
        font-size: 11px;
        fill: var(--ink-muted);
        font-family: var(--font-data);
      }
    `,
  ],
})
export class BarChartComponent {
  readonly bars = input.required<BarDatum[]>();

  readonly width = 320;
  readonly rowHeight = 28;
  readonly barMax = 160;

  readonly height = computed(() => this.bars().length * this.rowHeight + 8);

  readonly positioned = computed(() => {
    const max = Math.max(1, ...this.bars().map((b) => b.value));
    return this.bars().map((bar, i) => ({
      ...bar,
      y: i * this.rowHeight,
      barWidth: (bar.value / max) * this.barMax,
      color: bar.color ?? 'var(--primary)',
    }));
  });
}
