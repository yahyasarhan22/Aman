export interface EstablishmentPublicDto {
  slug: string;
  nameAr: string;
  nameEn: string | null;
  category: string;
  grade: 'A' | 'B' | 'C' | 'D' | null;
  score: number | null;
  lastInspectionAt: string | null;
  openViolations: { category: string; ownerResponded: boolean }[];
  history: { date: string; grade: string; violationCount: number }[];
  status: string;
}
