import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { T } from '../core/strings';

/**
 * Risk reads as a number plus a filled meter, in a palette deliberately darker
 * and flatter than the grade colours — so on a queue screen the only saturated
 * colour is still the grade (spec §10.2).
 */
@Component({
  selector: 'app-risk-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="risk" [style.--risk]="color()">
      <div class="risk__head">
        <span class="risk__label">{{ t.queue.riskLabel }}</span>
        <span class="risk__band">{{ band() }}</span>
      </div>
      <div class="risk__value ltr">{{ value() }}</div>
      <div
        class="risk__meter"
        role="meter"
        [attr.aria-valuenow]="value()"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-label]="t.queue.riskLabel"
      >
        <span [style.inline-size.%]="value()"></span>
      </div>
    </div>
  `,
  styles: [
    `
      .risk {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-inline-size: 74px;
      }

      .risk__head {
        display: flex;
        align-items: baseline;
        gap: var(--s1);
      }

      .risk__label {
        font-size: 11px;
        font-weight: 700;
        color: var(--ink-muted);
      }

      .risk__band {
        font-size: 11px;
        font-weight: 700;
        color: var(--risk);
      }

      .risk__value {
        font-size: 26px;
        font-weight: 700;
        line-height: 1.05;
        color: var(--risk);
      }

      .risk__meter {
        inline-size: 100%;
        block-size: 4px;
        border-radius: 2px;
        background: var(--rule);
        overflow: hidden;
      }

      .risk__meter > span {
        display: block;
        block-size: 100%;
        background: var(--risk);
      }
    `,
  ],
})
export class RiskBadgeComponent {
  readonly t = T;
  readonly value = input.required<number>();

  readonly color = computed(() => {
    const v = this.value();
    if (v >= 70) return 'var(--risk-high)';
    return v >= 40 ? 'var(--risk-mid)' : 'var(--risk-low)';
  });

  readonly band = computed(() => {
    const v = this.value();
    if (v >= 70) return T.queue.riskHigh;
    return v >= 40 ? T.queue.riskMid : T.queue.riskLow;
  });
}
