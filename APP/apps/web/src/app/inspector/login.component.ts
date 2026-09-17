import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/api';
import { T } from '../core/strings';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <header class="masthead">
      <div class="masthead__inner">
        <span class="masthead__mark">{{ t.app.name }}</span>
        <span class="masthead__divider" aria-hidden="true"></span>
        <span class="masthead__authority">{{ t.app.authority }} · {{ t.app.department }}</span>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <header class="card__head">
          <h1 class="card__title">{{ t.auth.title }}</h1>
          <p class="card__sub">{{ t.auth.subtitle }}</p>
        </header>

        <form class="form" (ngSubmit)="submit()">
          <div class="field">
            <label for="email">{{ t.auth.email }}</label>
            <input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              autocomplete="username"
              required
              [(ngModel)]="email"
            />
          </div>

          <div class="field">
            <label for="password">{{ t.auth.password }}</label>
            <input
              id="password"
              name="password"
              type="password"
              dir="ltr"
              autocomplete="current-password"
              required
              [(ngModel)]="password"
            />
          </div>

          @if (error()) {
            <p class="notice" role="alert">{{ error() }}</p>
          }

          <button class="btn btn--block" type="submit" [disabled]="busy()">
            {{ busy() ? t.auth.signingIn : t.auth.submit }}
          </button>
        </form>
      </section>

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

      .page {
        max-inline-size: 480px;
        margin-inline: auto;
        padding: var(--s7) var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .card {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-card);
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s5);
      }

      .card__head {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        padding-block-end: var(--s4);
        border-block-end: 1px solid var(--rule);
      }

      .card__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }

      .card__sub {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }

      .form {
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .attribution {
        font-size: 13px;
        color: var(--ink-muted);
        text-align: center;
      }
    `,
  ],
})
export class LoginComponent {
  readonly t = T;

  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.login(this.email, this.password);
      // One login form, three destinations — an admin has no queue and an
      // owner has no inspections.
      const role = this.auth.user()?.role;
      const home =
        role === 'ADMIN' ? '/admin/dashboard' : role === 'OWNER' ? '/portal' : '/app/today';
      await this.router.navigate([home]);
    } catch {
      this.error.set(T.auth.failed);
    } finally {
      this.busy.set(false);
    }
  }
}
