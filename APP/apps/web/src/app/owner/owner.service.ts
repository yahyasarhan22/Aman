import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE, AuthService } from '../core/api';

export interface OwnerViolation {
  id: string;
  category: string;
  severity: string;
  recommendation: string | null;
  deadlineAt: string | null;
  status: string;
  ownerResponse: string | null;
  respondedAt: string | null;
  verifiedAt: string | null;
  overdue: boolean;
}

export interface OwnerOverview {
  establishment: {
    nameAr: string;
    slug: string;
    currentGrade: string | null;
    currentScore: number | null;
    lastInspectionAt: string | null;
  };
  openViolations: OwnerViolation[];
  resolvedViolations: OwnerViolation[];
}

@Injectable({ providedIn: 'root' })
export class OwnerApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private get options() {
    return { headers: this.auth.authHeaders() };
  }

  /** No establishment id anywhere — the server resolves it from the token. */
  overview(): Promise<OwnerOverview> {
    return firstValueFrom(
      this.http.get<OwnerOverview>(`${API_BASE}/api/owner/establishment`, this.options),
    );
  }

  async uploadPhoto(blob: Blob): Promise<string> {
    const form = new FormData();
    form.append('file', blob, 'evidence.jpg');
    const response = await firstValueFrom(
      this.http.post<{ id: string }>(`${API_BASE}/api/uploads`, form, this.options),
    );
    return response.id;
  }

  respond(violationId: string, note: string, photoIds: string[]): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.post<{ ok: true }>(
        `${API_BASE}/api/owner/violations/${violationId}/respond`,
        { note, photoIds },
        this.options,
      ),
    );
  }
}
