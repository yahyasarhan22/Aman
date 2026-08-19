import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EstablishmentPublicDto {
  slug: string;
  nameAr: string;
  nameEn: string | null;
  category: string;
  address: string | null;
  grade: 'A' | 'B' | 'C' | 'D' | null;
  score: number | null;
  lastInspectionAt: string | null;
  openViolations: { category: string; ownerResponded: boolean }[];
  history: { date: string; grade: string; violationCount: number }[];
  status: string;
}

@Injectable({ providedIn: 'root' })
export class EstablishmentService {
  private readonly baseUrl = 'http://localhost:3000/api/public/establishments';

  constructor(private http: HttpClient) {}

  getBySlug(slug: string): Observable<EstablishmentPublicDto> {
    return this.http.get<EstablishmentPublicDto>(`${this.baseUrl}/${slug}`);
  }
}
