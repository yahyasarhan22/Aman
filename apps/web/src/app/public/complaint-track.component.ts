import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StatusStepperComponent, type StepperStep } from '../ui/status-stepper.component';
import { ComplaintService, type ComplaintStatus } from './complaint.service';
import { T } from '../core/strings';

@Component({
  selector: 'app-complaint-track',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, StatusStepperComponent],
  template: `
    <header class="masthead">
      <div class="masthead__inner">
        <span class="masthead__mark">{{ t.app.name }}</span>
        <span class="masthead__divider" aria-hidden="true"></span>
        <span class="masthead__authority">{{ t.app.authority }} · {{ t.app.department }}</span>
      </div>
    </header>

    <main class="page">
      <h1 class="page__title">{{ t.track.title }}</h1>

      @if (complaint(); as c) {
        <section class="card">
          <div class="card__head">
            <span class="card__ref ltr">#{{ c.reference }}</span>
            <a class="card__establishment" [routerLink]="['/e', c.establishmentSlug]">
              {{ c.establishmentNameAr }}
            </a>
          </div>

          <p class="card__meta">
            {{ t.track.submittedAt }}:
            <span class="ltr">{{ c.submittedAt | date: 'yyyy-MM-dd' }}</span>
          </p>

          @if (isTerminal()) {
            <p class="card__terminal">{{ t.track.step[c.status] }}</p>
          }

          <app-status-stepper [steps]="steps()" [pendingLabel]="t.track.pending" />

          <p class="card__note">{{ t.complaint.gradeNote }}</p>
        </section>
      } @else {
        <p class="page__lede">{{ t.track.lede }}</p>
        <form class="lookup" (submit)="lookup($event)">
          <div class="field">
            <label for="ref">{{ t.track.referenceLabel }}</label>
            <input
              id="ref"
              dir="ltr"
              inputmode="numeric"
              maxlength="5"
              [value]="input()"
              (input)="input.set($any($event.target).value)"
            />
          </div>

          @if (error()) {
            <p class="notice" role="alert">{{ error() }}</p>
          }

          <button class="btn btn--block" type="submit" [disabled]="busy() || !input().trim()">
            {{ busy() ? t.common.loading : t.track.submit }}
          </button>
        </form>
      }

      <footer class="attribution">{{ t.app.attribution }}</footer>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-block-size: 100dvh;
        background: var(--paper);
      }

      .masthead {
        background: var(--ink);
        color: #fff;
        border-block-end: 3px solid var(--primary);
      }

      .masthead__inner {
        max-inline-size: 520px;
        margin-inline: auto;
        padding: var(--s3) var(--s4);
        display: flex;
        align-items: center;
        gap: var(--s3);
      }

      .masthead__mark {
        font-size: var(--text-lede);
        font-weight: 700;
      }

      .masthead__divider {
        inline-size: 1px;
        block-size: 18px;
        background: rgba(255, 255, 255, 0.28);
      }

      .masthead__authority {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.82);
      }

      .page {
        max-inline-size: 520px;
        margin-inline: auto;
        padding: var(--s5) var(--s4) var(--s7);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
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

      .lookup {
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .card {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
        padding: var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }

      .card__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--s3);
        padding-block-end: var(--s3);
        border-block-end: 1px solid var(--rule);
      }

      .card__ref {
        font-size: 22px;
        font-weight: 700;
        color: var(--ink);
      }

      .card__establishment {
        font-size: var(--text-caption);
        color: var(--primary);
      }

      .card__meta {
        font-size: 13px;
        color: var(--ink-muted);
      }

      .card__terminal {
        padding: var(--s3);
        background: var(--warn-bg);
        border-radius: var(--radius);
        font-size: var(--text-caption);
        font-weight: 700;
      }

      .card__note {
        padding-block-start: var(--s3);
        border-block-start: 1px solid var(--rule);
        font-size: 13px;
        line-height: 1.6;
        color: var(--ink-muted);
      }

      .attribution {
        padding-block-start: var(--s4);
        border-block-start: 1px solid var(--rule);
        font-size: 13px;
        color: var(--ink-muted);
        text-align: center;
      }
    `,
  ],
})
export class ComplaintTrackComponent {
  readonly t = T;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private complaints = inject(ComplaintService);

  readonly input = signal(this.route.snapshot.paramMap.get('ref') ?? '');
  readonly complaint = signal<ComplaintStatus | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** DUPLICATE and REJECTED never appear on the stepper — they end the story
   *  rather than advance it, so they are stated plainly instead (§6.3). */
  readonly isTerminal = computed(() => {
    const status = this.complaint()?.status;
    return status === 'DUPLICATE' || status === 'REJECTED';
  });

  readonly steps = computed<StepperStep[]>(
    () =>
      this.complaint()?.timeline.map((step) => ({
        labelAr: T.track.step[step.key] ?? step.key,
        reached: step.reached,
        at: step.at,
      })) ?? [],
  );

  constructor() {
    if (this.input().trim()) void this.lookup();
  }

  /** Native submit, not ngSubmit — see the note in ComplaintFormComponent. */
  async lookup(event?: Event): Promise<void> {
    event?.preventDefault();
    const reference = this.input().trim();
    if (!reference) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      this.complaint.set(await this.complaints.track(reference));
      void this.router.navigate(['/complaint', reference.replace(/^#/, '')], {
        replaceUrl: true,
      });
    } catch (error) {
      const message = (error as { error?: { message?: string } })?.error?.message;
      this.error.set(message ?? T.track.notFound);
    } finally {
      this.busy.set(false);
    }
  }
}
