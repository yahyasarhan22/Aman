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
    <main class="login">
      <div class="login__card">
        <header class="login__head">
          <span class="login__mark">{{ t.app.name }}</span>
          <h1 class="login__title">{{ t.auth.title }}</h1>
          <p class="login__sub">{{ t.auth.subtitle }}</p>
        </header>

        <form class="login__form" (ngSubmit)="submit()">
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
      </div>
    </main>
  `,
  styles: [
    `
      .login {
        min-block-size: 100dvh;
        display: grid;
        place-items: center;
        padding: var(--s4);
        background: var(--ink);
      }

      .login__card {
        inline-size: 100%;
        max-inline-size: 400px;
        background: var(--card);
        border-radius: var(--radius-lg);
        padding: var(--s6) var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s5);
      }

      .login__head {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        padding-block-end: var(--s4);
        border-block-end: 1px solid var(--rule);
      }

      .login__mark {
        font-size: var(--text-lede);
        font-weight: 700;
        color: var(--primary);
      }

      .login__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }

      .login__sub {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }

      .login__form {
        display: flex;
        flex-direction: column;
        gap: var(--s4);
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
        role === 'ADMIN' ? '/admin/complaints' : role === 'OWNER' ? '/portal' : '/app/today';
      await this.router.navigate([home]);
    } catch {
      this.error.set(T.auth.failed);
    } finally {
      this.busy.set(false);
    }
  }
}
