import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';

export interface StepperStep {
  labelAr: string;
  reached: boolean;
  at: string | null;
}

/**
 * Spec §5.3: a vertical stepper is what separates Aman from every complaint
 * box citizens have stopped trusting. Dates and status only — never a name.
 */
@Component({
  selector: 'app-status-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <ol class="stepper">
      @for (step of steps(); track step.labelAr) {
        <li class="step" [class.step--done]="step.reached">
          <span class="step__marker" aria-hidden="true"></span>
          <span class="step__label">{{ step.labelAr }}</span>
          <span class="step__at">
            @if (step.at) {
              <span class="ltr">{{ step.at | date: 'yyyy-MM-dd' }}</span>
            } @else {
              {{ pendingLabel() }}
            }
          </span>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      .stepper {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
      }

      .step {
        display: grid;
        grid-template-columns: 16px 1fr auto;
        align-items: center;
        gap: var(--s3);
        padding-block: var(--s3);
        position: relative;
        color: var(--ink-muted);
      }

      .step--done {
        color: var(--ink-2);
      }

      /* The connector runs between markers, never past the last one. */
      .step:not(:last-child)::before {
        content: '';
        position: absolute;
        inset-inline-start: 7px;
        inset-block-start: 50%;
        block-size: 100%;
        inline-size: 1px;
        background: var(--rule);
      }

      .step__marker {
        inline-size: 15px;
        block-size: 15px;
        border-radius: 50%;
        border: 2px solid var(--rule-strong);
        background: var(--card);
        position: relative;
        z-index: 1;
      }

      .step--done .step__marker {
        border-color: var(--primary);
        background: var(--primary);
      }

      .step__label {
        font-size: var(--text-body);
      }

      .step--done .step__label {
        font-weight: 700;
      }

      .step__at {
        font-size: 13px;
      }
    `,
  ],
})
export class StatusStepperComponent {
  readonly steps = input.required<StepperStep[]>();
  readonly pendingLabel = input<string>('');
}
