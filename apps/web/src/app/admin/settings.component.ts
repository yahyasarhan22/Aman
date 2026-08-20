import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminService, type RiskWeightsPayload } from './admin.service';
import { T } from '../core/strings';

/**
 * Spec §5.10: the four §6.2 weights, adjustable and audited. The live sum is
 * the whole UX — an admin should never be able to submit an invalid formula,
 * so Save is disabled rather than erroring after the fact.
 */
@Component({
  selector: 'app-admin-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <h1 class="page__title">{{ t.admin.settings.title }}</h1>
      <p class="page__lede">{{ t.admin.settings.lede }}</p>

      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      }
      @if (saved()) {
        <p class="ok">{{ t.admin.settings.saved }}</p>
      }

      <form class="form" (submit)="onSubmit($event)">
        <div class="field">
          <label for="pv">{{ t.admin.settings.priorViolations }}</label>
          <input
            id="pv"
            type="number"
            dir="ltr"
            [value]="priorViolations()"
            (input)="priorViolations.set(+$any($event.target).value)"
          />
        </div>
        <div class="field">
          <label for="cp">{{ t.admin.settings.complaintPressure }}</label>
          <input
            id="cp"
            type="number"
            dir="ltr"
            [value]="complaintPressure()"
            (input)="complaintPressure.set(+$any($event.target).value)"
          />
        </div>
        <div class="field">
          <label for="ts">{{ t.admin.settings.timeSinceInspection }}</label>
          <input
            id="ts"
            type="number"
            dir="ltr"
            [value]="timeSinceInspection()"
            (input)="timeSinceInspection.set(+$any($event.target).value)"
          />
        </div>
        <div class="field">
          <label for="cat">{{ t.admin.settings.category }}</label>
          <input
            id="cat"
            type="number"
            dir="ltr"
            [value]="category()"
            (input)="category.set(+$any($event.target).value)"
          />
        </div>

        <p class="sum" [class.sum--bad]="!canSave()">
          {{ t.admin.settings.sum }}: <span class="ltr">{{ sum() }}</span> / 100
          @if (!canSave()) {
            — {{ t.admin.settings.sumWarning }}
          }
        </p>

        <button class="btn" type="submit" [disabled]="!canSave() || busy()">
          {{ busy() ? t.admin.settings.saving : t.admin.settings.save }}
        </button>
      </form>
    </main>
  `,
  styles: [
    `
      .page {
        max-inline-size: 480px;
        margin-inline: auto;
        padding: var(--s5);
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
      .form {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
      .sum {
        font-size: var(--text-caption);
        font-weight: 700;
        color: var(--ok);
      }
      .sum--bad {
        color: var(--danger);
      }
      .ok {
        color: var(--ok);
        font-size: 13px;
      }
    `,
  ],
})
export class AdminSettingsComponent {
  readonly t = T;
  private admin = inject(AdminService);

  readonly priorViolations = signal(0);
  readonly complaintPressure = signal(0);
  readonly timeSinceInspection = signal(0);
  readonly category = signal(0);

  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  readonly sum = computed(
    () =>
      this.priorViolations() + this.complaintPressure() + this.timeSinceInspection() + this.category(),
  );
  readonly canSave = computed(() => this.sum() === 100);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const { weights } = await this.admin.getRiskWeights();
      this.priorViolations.set(weights.PRIOR_VIOLATIONS);
      this.complaintPressure.set(weights.COMPLAINT_PRESSURE);
      this.timeSinceInspection.set(weights.TIME_SINCE_INSPECTION);
      this.category.set(weights.CATEGORY);
    } catch {
      this.error.set(T.admin.settings.loadFailed);
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const payload: RiskWeightsPayload = {
        PRIOR_VIOLATIONS: this.priorViolations(),
        COMPLAINT_PRESSURE: this.complaintPressure(),
        TIME_SINCE_INSPECTION: this.timeSinceInspection(),
        CATEGORY: this.category(),
      };
      await this.admin.updateRiskWeights(payload);
      this.saved.set(true);
    } catch {
      this.error.set(T.admin.settings.failed);
    } finally {
      this.busy.set(false);
    }
  }
}
