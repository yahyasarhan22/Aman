import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { T } from '../core/strings';

/**
 * The full public directory is a Week 3 screen. This is the demo's front door:
 * the QR target and the inspector entrance, nothing invented in between.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <main class="home">
      <div class="home__card">
        <span class="home__mark">{{ t.app.name }}</span>
        <h1 class="home__title">{{ t.app.tagline }}</h1>
        <p class="home__lede">{{ t.home.lede }}</p>

        <div class="home__actions">
          <a class="btn btn--block" routerLink="/e/golden-oven-nablus">{{ t.home.demoLabel }}</a>
          <a class="btn btn--ghost btn--block" routerLink="/app/login">{{ t.home.inspectorEntry }}</a>
        </div>

        <p class="home__attribution">{{ t.app.attribution }}</p>
      </div>
    </main>
  `,
  styles: [
    `
      .home {
        min-block-size: 100dvh;
        display: grid;
        place-items: center;
        padding: var(--s4);
        background: var(--ink);
      }

      .home__card {
        inline-size: 100%;
        max-inline-size: 420px;
        background: var(--card);
        border-radius: var(--radius-lg);
        padding: var(--s6) var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }

      .home__mark {
        font-size: var(--text-lede);
        font-weight: 700;
        color: var(--primary);
      }

      .home__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
        line-height: 1.3;
      }

      .home__lede {
        font-size: var(--text-body);
        color: var(--ink-2);
      }

      .home__actions {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        margin-block-start: var(--s3);
      }

      .home__actions .btn {
        text-decoration: none;
      }

      .home__attribution {
        margin-block-start: var(--s3);
        padding-block-start: var(--s3);
        border-block-start: 1px solid var(--rule);
        font-size: 13px;
        color: var(--ink-muted);
      }
    `,
  ],
})
export class HomeComponent {
  readonly t = T;
}
