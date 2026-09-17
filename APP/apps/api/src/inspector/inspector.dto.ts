import type { ChecklistItemDef, Grade, InspectionAnswer } from '@aman/shared';

export interface RiskFactorDto {
  key: string;
  normalized: number;
  weight: number;
  contribution: number;
  labelAr: string;
  detailAr: string;
}

export interface QueueEntryDto {
  establishmentId: string;
  slug: string;
  nameAr: string;
  category: string;
  address: string | null;
  currentGrade: Grade | null;
  /** 0-100 from the weighted §6.2 formula. */
  risk: number;
  /** Spec §5.4: the queue must always say why. */
  reasons: string[];
  /** Full derivation, so the UI can show the factor breakdown on demand. */
  factors: RiskFactorDto[];
}

export interface CompletedTodayEntryDto {
  id: string;
  establishmentId: string;
  nameAr: string;
  grade: Grade;
  previousGrade: Grade | null;
  submittedAt: string;
}

export interface InspectionDetailItemDto {
  checklistItemId: string;
  code: string;
  labelAr: string;
  sectionNameAr: string;
  severity: string;
  unit: string | null;
  result: string;
  measuredValue: string | null;
  note: string | null;
  photoIds: string[];
}

export interface InspectionDetailViolationDto {
  id: string;
  category: string;
  severity: string;
  recommendation: string | null;
  status: string;
  deadlineAt: string | null;
}

export interface InspectionDetailDto {
  id: string;
  establishmentId: string;
  establishmentNameAr: string;
  establishmentSlug: string;
  score: number;
  grade: Grade;
  previousGrade: Grade | null;
  submittedAt: string;
  inspectorSignature: string | null;
  items: InspectionDetailItemDto[];
  violations: InspectionDetailViolationDto[];
}

export interface BundleComplaintDto {
  reference: string;
  category: string;
  description: string;
  hasEvidence: boolean;
  photoIds: string[];
  status: string;
  createdAt: string;
}

export interface EstablishmentBundleDto {
  establishment: {
    id: string;
    slug: string;
    nameAr: string;
    category: string;
    address: string | null;
    currentGrade: Grade | null;
    currentScore: number | null;
    lastInspectionAt: string | null;
  };
  checklistVersionId: string;
  checklistVersion: number;
  items: ChecklistItemDef[];
  openViolations: {
    id: string;
    category: string;
    severity: string;
    deadlineAt: string | null;
    status: string;
  }[];
  /** Not-yet-settled complaints against this place — the reason a visit may
   *  outrank another on the queue, and what the inspector should go verify. */
  complaints: BundleComplaintDto[];
}

export interface SubmitInspectionDto {
  /** Client-generated at Start. Makes the submission idempotent (spec §8.2). */
  clientId: string;
  establishmentId: string;
  checklistVersionId: string;
  answers: InspectionAnswer[];
  /** Inspector-approved recommendation text, keyed by checklist item id. The
   *  server falls back to the template when a key is absent (spec §6.5). */
  recommendations?: Record<string, string>;
  startedAt?: string;
  inspectorSignature?: string | null;
  isOfflineSubmission?: boolean;
}

export interface SubmitInspectionResultDto {
  inspectionId: string;
  score: number;
  grade: Grade;
  previousGrade: Grade | null;
  violationCount: number;
  /** True when this call matched an existing clientId and wrote nothing. */
  duplicate: boolean;
}
