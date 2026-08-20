import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { T } from '../core/strings';

export interface RiskFactorView {
  key: string;
  normalized: number;
  weight: number;
  contribution: number;
  labelAr: string;
  detailAr: string;
}

/**
 * Spec §6.2: the breakdown, not just the number. A number without its
 * derivation is not auditable, and an unauditable number has no place in a
 * regulatory system — so this is a real table an owner could argue with, not
 * a tooltip that disappears when you reach for it.
 */
@Component({
  selector: 'app-risk-factors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="factors">
      <thead>
        <tr>
          <th scope="col">{{ t.admin.planning.factor }}</th>
          <th scope="col" class="num">{{ t.queue.riskLabel }}</th>
          <th scope="col" class="num">{{ t.admin.planning.weight }}</th>
          <th scope="col" class="num">{{ t.admin.planning.contribution }}</th>
        </tr>
      </thead>
      <tbody>
        @for (factor of factors(); track factor.key) {
          <tr>
            <th scope="row">
              <span class="factors__label">{{ factor.labelAr }}</span>
              <span class="factors__detail">{{ factor.detailAr }}</span>
            </th>
            <td class="num ltr">{{ factor.normalized }}</td>
            <td class="num ltr">{{ factor.weight }}%</td>
            <td class="num ltr">{{ factor.contribution.toFixed(1) }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [
    `
      .factors {
        inline-size: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .factors th,
      .factors td {
        padding: var(--s2) var(--s3);
        text-align: start;
        border-block-end: 1px solid var(--rule);
        vertical-align: top;
        font-weight: 400;
      }

      .factors thead th {
        font-size: 11px;
        font-weight: 700;
        color: var(--ink-muted);
        letter-spacing: 0.03em;
      }

      .factors tbody tr:last-child th,
      .factors tbody tr:last-child td {
        border-block-end: 0;
      }

      .factors__label {
        display: block;
        font-weight: 700;
        color: var(--ink);
      }

      .factors__detail {
        display: block;
        color: var(--ink-muted);
      }

      .num {
        text-align: end;
        white-space: nowrap;
      }
    `,
  ],
})
export class RiskFactorsComponent {
  readonly t = T;
  readonly factors = input.required<RiskFactorView[]>();
}
