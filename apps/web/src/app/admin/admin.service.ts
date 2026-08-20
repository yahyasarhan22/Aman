import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE, AuthService } from '../core/api';

export interface RiskFactor {
  key: string;
  normalized: number;
  weight: number;
  contribution: number;
  labelAr: string;
  detailAr: string;
}

export interface AdminComplaint {
  id: string;
  reference: string;
  establishmentId: string;
  establishmentNameAr: string;
  category: string;
  description: string;
  hasEvidence: boolean;
  photoIds: string[];
  contactPhone: string | null;
  ageDays: number;
  status: string;
  assignedInspectorId: string | null;
  assignedInspectorNameAr: string | null;
  rejectionReason: string | null;
  duplicateOfId: string | null;
  duplicateGroupId: string;
  duplicateGroupSize: number;
  createdAt: string;
}

export interface PlanningRow {
  establishmentId: string;
  slug: string;
  nameAr: string;
  category: string;
  currentGrade: string | null;
  lastInspectionAt: string | null;
  risk: number;
  factors: RiskFactor[];
}

export interface InspectorOption {
  id: string;
  displayNameAr: string;
}

export type ComplaintAction = 'assign' | 'duplicate' | 'reject' | 'close';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private get options() {
    return { headers: this.auth.authHeaders() };
  }

  listComplaints(filter: Record<string, string> = {}): Promise<AdminComplaint[]> {
    const query = new URLSearchParams(filter).toString();
    return firstValueFrom(
      this.http.get<AdminComplaint[]>(
        `${API_BASE}/api/admin/complaints${query ? `?${query}` : ''}`,
        this.options,
      ),
    );
  }

  inspectors(): Promise<InspectorOption[]> {
    return firstValueFrom(
      this.http.get<InspectorOption[]>(`${API_BASE}/api/admin/inspectors`, this.options),
    );
  }

  planning(): Promise<PlanningRow[]> {
    return firstValueFrom(
      this.http.get<PlanningRow[]>(`${API_BASE}/api/admin/planning`, this.options),
    );
  }

  act(
    id: string,
    body: { action: ComplaintAction; inspectorId?: string; originalId?: string; reason?: string },
  ): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.patch<{ ok: true }>(`${API_BASE}/api/admin/complaints/${id}`, body, this.options),
    );
  }
}
