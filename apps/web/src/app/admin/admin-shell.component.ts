import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/api';
import { T } from '../core/strings';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="bar">
      <div class="bar__inner">
        <span class="bar__mark">{{ t.app.name }}</span>
        <span class="bar__divider" aria-hidden="true"></span>
        <span class="bar__title">{{ t.admin.title }}</span>

        <nav class="bar__nav">
          <a routerLink="/admin/complaints" routerLinkActive="on">{{ t.admin.navComplaints }}</a>
          <a routerLink="/admin/planning" routerLinkActive="on">{{ t.admin.navPlanning }}</a>
          <a routerLink="/admin/settings" routerLinkActive="on">{{ t.admin.navSettings }}</a>
        </nav>

        <span class="bar__user">{{ auth.user()?.displayNameAr }}</span>
        <button type="button" class="bar__signout" (click)="auth.signOut()">
          {{ t.auth.signOut }}
        </button>
      </div>
    </header>

    <router-outlet />
  `,
  styles: [
    `
      :host {
        display: block;
        min-block-size: 100dvh;
        background: var(--paper);
      }

      .bar {
        background: var(--ink);
        color: #fff;
        border-block-end: 3px solid var(--primary);
      }

      .bar__inner {
        max-inline-size: 1180px;
        margin-inline: auto;
        padding: var(--s3) var(--s5);
        display: flex;
        align-items: center;
        gap: var(--s4);
        flex-wrap: wrap;
      }

      .bar__mark {
        font-size: var(--text-lede);
        font-weight: 700;
      }

      .bar__divider {
        inline-size: 1px;
        block-size: 18px;
        background: rgba(255, 255, 255, 0.28);
      }

      .bar__title {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.82);
      }

      .bar__nav {
        display: flex;
        gap: var(--s2);
        margin-inline-start: var(--s5);
      }

      .bar__nav a {
        min-block-size: 34px;
        display: inline-flex;
        align-items: center;
        padding: 0 var(--s3);
        border-radius: var(--radius);
        color: rgba(255, 255, 255, 0.82);
        text-decoration: none;
        font-size: var(--text-caption);
      }

      .bar__nav a.on {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
        font-weight: 700;
      }

      .bar__user {
        margin-inline-start: auto;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.72);
      }

      .bar__signout {
        background: none;
        border: 0;
        color: rgba(255, 255, 255, 0.86);
        text-decoration: underline;
        cursor: pointer;
      }
    `,
  ],
})
export class AdminShellComponent {
  readonly t = T;
  readonly auth = inject(AuthService);
}
