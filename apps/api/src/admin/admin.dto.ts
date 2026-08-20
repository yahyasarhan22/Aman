import type { RiskFactorDto } from '../inspector/inspector.dto';
import type {
  ComplaintCategory,
  ComplaintStatus,
  RejectionReason,
} from '../complaints/complaint.entity';

export interface AdminComplaintDto {
  id: string;
  reference: string;
  establishmentId: string;
  establishmentNameAr: string;
  category: ComplaintCategory;
  description: string;
  hasEvidence: boolean;
  photoIds: string[];
  /** Admin-only (§3.1). Decrypted on read, never persisted in the clear, and
   *  never returned by a public, inspector or owner endpoint. */
  contactPhone: string | null;
  ageDays: number;
  status: ComplaintStatus;
  assignedInspectorId: string | null;
  assignedInspectorNameAr: string | null;
  rejectionReason: RejectionReason | null;
  duplicateOfId: string | null;
  /** Shared by every complaint the 72-hour rule groups together (§5.9). */
  duplicateGroupId: string;
  duplicateGroupSize: number;
  createdAt: string;
}

export interface ComplaintFilter {
  status?: ComplaintStatus;
  category?: ComplaintCategory;
  hasEvidence?: boolean;
  establishmentId?: string;
}

export interface PlanningRowDto {
  establishmentId: string;
  slug: string;
  nameAr: string;
  category: string;
  currentGrade: string | null;
  lastInspectionAt: string | null;
  risk: number;
  factors: RiskFactorDto[];
}

export interface InspectorOptionDto {
  id: string;
  displayNameAr: string;
}
