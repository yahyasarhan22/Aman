import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../core/api';

export type ComplaintCategory =
  | 'HYGIENE'
  | 'EXPIRED'
  | 'REFRIGERATION'
  | 'STAFF'
  | 'PESTS'
  | 'OTHER';

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'HYGIENE',
  'EXPIRED',
  'REFRIGERATION',
  'STAFF',
  'PESTS',
  'OTHER',
];

export interface ComplaintTimelineStep {
  key: string;
  reached: boolean;
  at: string | null;
}

export interface ComplaintStatus {
  reference: string;
  status: string;
  establishmentNameAr: string;
  establishmentSlug: string;
  submittedAt: string;
  timeline: ComplaintTimelineStep[];
}

@Injectable({ providedIn: 'root' })
export class ComplaintService {
  private http = inject(HttpClient);

  /** Unauthenticated upload — a citizen never signs in. Shares the server-side
   *  EXIF stripping and magic-byte validation with the inspector path. */
  async uploadPhoto(blob: Blob): Promise<string> {
    const form = new FormData();
    form.append('file', blob, 'complaint.jpg');
    const response = await firstValueFrom(
      this.http.post<{ id: string }>(`${API_BASE}/api/public/uploads`, form),
    );
    return response.id;
  }

  submit(payload: {
    slug: string;
    category: ComplaintCategory;
    description: string;
    photoIds: string[];
    contactPhone: string | null;
    honeypot: string;
  }): Promise<{ reference: string }> {
    return firstValueFrom(
      this.http.post<{ reference: string }>(`${API_BASE}/api/public/complaints`, payload),
    );
  }

  track(reference: string): Promise<ComplaintStatus> {
    return firstValueFrom(
      this.http.get<ComplaintStatus>(
        `${API_BASE}/api/public/complaints/${encodeURIComponent(reference)}`,
      ),
    );
  }
}
