import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../core/api';

function build(role: 'ADMIN' | 'OWNER' | 'INSPECTOR') {
  const navigate = vi.fn(async () => true);
  const login = vi.fn(async () => undefined);

  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      { provide: Router, useValue: { navigate } },
      {
        provide: AuthService,
        useValue: { login, user: () => ({ role, displayNameAr: 'x' }) },
      },
    ],
  });

  const fixture = TestBed.createComponent(LoginComponent);
  return { fixture, navigate, login };
}

describe('LoginComponent — role-based redirect', () => {
  // Regression test: Week 3 shipped one destination for every role, so an
  // admin who signed in landed on the inspector queue they don't have.
  it('sends an admin to a screen they actually have', async () => {
    const { fixture, navigate } = build('ADMIN');
    await fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/admin/complaints']);
  });

  it('sends an owner to the portal', async () => {
    const { fixture, navigate } = build('OWNER');
    await fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/portal']);
  });

  it('sends an inspector to today’s queue', async () => {
    const { fixture, navigate } = build('INSPECTOR');
    await fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/app/today']);
  });
});
