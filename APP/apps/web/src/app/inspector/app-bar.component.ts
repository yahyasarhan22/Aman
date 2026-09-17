import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PENDING_INSPECTION_FORMS, arabicCount } from '@aman/shared';
import { AuthService } from '../core/api';
import { InspectorService } from '../core/inspector.service';
import { T } from '../core/strings';

/**
 * Spec §9: the pending count is a persistent badge, never a silent sync — an
 * inspector has to be able to confirm their work was delivered.
 */
@Component({
  selector: 'app-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header class="bar">
      <div class="bar__row">
        <div class="bar__titles">
          <h1 class="bar__title">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="bar__sub">{{ subtitle() }}</p>
          }
        </div>

        <a class="sync" routerLink="/app/sync" [class.sync--pending]="inspector.pendingCount() > 0">
          <span class="sync__dot" [class.sync__dot--off]="!inspector.online()"></span>
          <span class="sync__text">
            @if (inspector.pendingCount() > 0) {
              {{ pendingLabel() }}
            } @else {
              {{ inspector.online() ? t.sync.online : t.sync.offline }}
            }
          </span>
        </a>
      </div>

      <div class="bar__meta">
        <span>{{ auth.user()?.displayNameAr }}</span>
        <button type="button" class="bar__signout" (click)="auth.signOut()">
          {{ t.auth.signOut }}
        </button>
      </div>
    </header>
  `,
  styles: [
    `
      .bar {
        position: sticky;
        inset-block-start: 0;
        z-index: 10;
        background: var(--ink);
        color: #fff;
        padding: var(--s3) var(--s4) var(--s2);
        border-block-end: 3px solid var(--primary);
      }

      .bar__row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--s3);
      }

      .bar__title {
        font-size: var(--text-lede);
        font-weight: 700;
        line-height: 1.3;
      }

      .bar__sub {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.72);
      }

      .sync {
        display: inline-flex;
        align-items: center;
        gap: var(--s2);
        min-block-size: 32px;
        padding: 0 var(--s3);
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 999px;
        color: #fff;
        text-decoration: none;
        font-size: 13px;
        white-space: nowrap;
      }

      .sync--pending {
        border-color: transparent;
        background: var(--attention);
        font-weight: 700;
      }

      .sync__dot {
        inline-size: 7px;
        block-size: 7px;
        border-radius: 50%;
        background: #6ee7b7;
      }

      .sync__dot--off {
        background: #f0a68c;
      }

      .bar__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        margin-block-start: var(--s2);
        padding-block-start: var(--s2);
        border-block-start: 1px solid rgba(255, 255, 255, 0.16);
        font-size: 13px;
        color: rgba(255, 255, 255, 0.72);
      }

      .bar__signout {
        background: none;
        border: 0;
        padding: var(--s1) 0;
        color: rgba(255, 255, 255, 0.86);
        text-decoration: underline;
        cursor: pointer;
      }
    `,
  ],
})
export class AppBarComponent {
  readonly t = T;
  readonly auth = inject(AuthService);
  readonly inspector = inject(InspectorService);

  readonly pendingLabel = computed(() =>
    arabicCount(this.inspector.pendingCount(), PENDING_INSPECTION_FORMS),
  );

  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
}
