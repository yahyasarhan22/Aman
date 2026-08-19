import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export const API_BASE = 'http://localhost:3000';

export type UserRole = 'INSPECTOR' | 'OWNER' | 'ADMIN';

export interface SessionUser {
  id: string;
  role: UserRole;
  displayNameAr: string;
}

const TOKEN_KEY = 'aman.token';
const USER_KEY = 'aman.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly user = signal<SessionUser | null>(readStoredUser());
  readonly isSignedIn = computed(() => this.token() !== null);

  async login(email: string, password: string): Promise<void> {
    const result = await firstValueFrom(
      this.http.post<{ accessToken: string; user: SessionUser }>(`${API_BASE}/api/auth/login`, {
        email,
        password,
      }),
    );
    localStorage.setItem(TOKEN_KEY, result.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    this.token.set(result.accessToken);
    this.user.set(result.user);
  }

  signOut(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
    void this.router.navigate(['/app/login']);
  }

  authHeaders(): HttpHeaders {
    const token = this.token();
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  /** A 401 means the session is gone, not that the request was malformed. */
  handleAuthError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) this.signOut();
  }
}

function readStoredUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
