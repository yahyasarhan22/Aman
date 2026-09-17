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
    <header class="masthead">
      <div class="masthead__inner">
        <span class="masthead__mark">{{ t.app.name }}</span>
        <span class="masthead__divider" aria-hidden="true"></span>
        <span class="masthead__authority">{{ t.app.authority }} · {{ t.app.department }}</span>
      </div>
    </header>

    <main class="home">
      <section class="hero">
        <h1 class="hero__title">{{ t.app.tagline }}</h1>
        <p class="hero__lede">{{ t.home.lede }}</p>
      </section>

      <nav class="actions">
        <a class="btn btn--block" routerLink="/e/golden-oven-nablus">{{ t.home.demoLabel }}</a>
        <a class="btn btn--ghost btn--block" routerLink="/complaint/track">{{ t.home.trackComplaint }}</a>
        <a class="btn btn--ghost btn--block" routerLink="/app/login">{{ t.home.inspectorEntry }}</a>
      </nav>

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
        max-inline-size: 480px;
        margin-inline: auto;
        padding: var(--s3) var(--s4);
        display: flex;
        align-items: center;
        gap: var(--s3);
      }

      .masthead__mark {
        font-size: var(--text-lede);
        font-weight: 700;
        letter-spacing: 0.02em;
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

      .home {
        max-inline-size: 480px;
        margin-inline: auto;
        padding: var(--s7) var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s6);
      }

      .hero {
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      .hero__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
        line-height: 1.3;
      }

      .hero__lede {
        font-size: var(--text-body);
        color: var(--ink-2);
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }

      .actions .btn {
        text-decoration: none;
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
export class HomeComponent {
  readonly t = T;
}
