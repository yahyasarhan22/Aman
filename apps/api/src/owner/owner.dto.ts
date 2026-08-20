export interface OwnerViolationDto {
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

export interface OwnerOverviewDto {
  establishment: {
    nameAr: string;
    slug: string;
    currentGrade: string | null;
    currentScore: number | null;
    lastInspectionAt: string | null;
  };
  openViolations: OwnerViolationDto[];
  resolvedViolations: OwnerViolationDto[];
}

export interface RespondDto {
  note: string;
  photoIds: string[];
}
