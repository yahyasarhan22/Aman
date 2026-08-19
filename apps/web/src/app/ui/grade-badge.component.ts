import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Grade } from '@aman/shared';
import { T } from '../core/strings';

const GRADE_COLOR: Record<string, string> = {
  A: 'var(--grade-a)',
  B: 'var(--grade-b)',
  C: 'var(--grade-c)',
  D: 'var(--grade-d)',
};

/**
 * The municipal stamp. Text inside the ring names the issuing authority, which
 * is the product's governing constraint made visible: Aman never issues a
 * grade, the municipality does.
 *
 * `chip` is the same colour and letter at list scale, where ring text would be
 * unreadable — colour is never carried alone (spec §5.1, §10.2).
 */
@Component({
  selector: 'app-grade-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'seal') {
      <div class="seal" [style.--seal]="color()" [attr.aria-label]="label()" role="img">
        <div class="seal__ring">
          <span class="seal__authority">{{ t.app.authority }}</span>
          <span class="seal__rule"></span>
          <span class="seal__letter" aria-hidden="true">{{ grade() ?? '—' }}</span>
          <span class="seal__rule"></span>
          <span class="seal__authority">{{ t.app.department }}</span>
        </div>
      </div>
    } @else {
      <span class="chip" [style.--seal]="color()" [attr.aria-label]="label()" role="img">
        <span aria-hidden="true">{{ grade() ?? '—' }}</span>
      </span>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .seal {
        --size: 172px;
        inline-size: var(--size);
        block-size: var(--size);
        margin-inline: auto;
        border-radius: 50%;
        background: var(--seal);
        display: grid;
        place-items: center;
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--seal) 70%, #000),
          0 10px 30px -18px color-mix(in srgb, var(--seal) 90%, #000);
      }

      .seal__ring {
        inline-size: calc(var(--size) - 22px);
        block-size: calc(var(--size) - 22px);
        border-radius: 50%;
        border: 1.5px solid rgba(255, 255, 255, 0.62);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        color: #fff;
        padding: 10px;
      }

      .seal__authority {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        line-height: 1.2;
        white-space: nowrap;
      }

      .seal__rule {
        inline-size: 46px;
        block-size: 1px;
        background: rgba(255, 255, 255, 0.5);
      }

      .seal__letter {
        font-family: var(--font-data);
        font-size: 76px;
        font-weight: 700;
        line-height: 0.92;
        letter-spacing: -0.02em;
      }

      .chip {
        display: inline-grid;
        place-items: center;
        inline-size: 28px;
        block-size: 28px;
        border-radius: 3px;
        background: var(--seal);
        color: #fff;
        font-family: var(--font-data);
        font-size: 15px;
        font-weight: 700;
      }
    `,
  ],
})
export class GradeBadgeComponent {
  readonly t = T;
  readonly grade = input<Grade | null>(null);
  readonly variant = input<'seal' | 'chip'>('seal');

  readonly color = computed(() => (this.grade() ? GRADE_COLOR[this.grade()!] : 'var(--grade-none)'));

  readonly label = computed(() => {
    const grade = this.grade();
    return grade ? `${T.grade.label} ${grade} — ${T.grade.meaning[grade]}` : T.grade.notInspected;
  });
}
