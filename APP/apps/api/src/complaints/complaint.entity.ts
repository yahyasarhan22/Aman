import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** The six options on the §5.2 form. */
export type ComplaintCategory =
  | 'HYGIENE'
  | 'EXPIRED'
  | 'REFRIGERATION'
  | 'STAFF'
  | 'PESTS'
  | 'OTHER';

/** Spec §6.3. */
export type ComplaintStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ASSIGNED'
  | 'INSPECTED'
  | 'CLOSED'
  | 'DUPLICATE'
  | 'REJECTED';

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'HYGIENE',
  'EXPIRED',
  'REFRIGERATION',
  'STAFF',
  'PESTS',
  'OTHER',
];

/**
 * Spec §5.9: rejection needs a reason from a fixed list, not free text —
 * fixed reasons are countable, and countability is the defence against
 * "they just delete complaints".
 */
export const REJECTION_REASONS = [
  'OUT_OF_JURISDICTION',
  'INSUFFICIENT_DETAIL',
  'NOT_FOOD_SAFETY',
  'ESTABLISHMENT_CLOSED',
  'ABUSIVE_OR_SPAM',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Short human-friendly code, e.g. 4821 (spec §7.1). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 8 })
  reference!: string;

  @Column({ type: 'varchar' })
  establishmentId!: string;

  @Column({ type: 'varchar' })
  category!: ComplaintCategory;

  @Column({ type: 'varchar', length: 300 })
  description!: string;

  /** Drives the ×3 weighting in the Risk Score (§6.2, §7.1). */
  @Column({ type: 'boolean', default: false })
  hasEvidence!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoIds!: string | null;

  /** AES-256-GCM. Admin-visible only — never returned by a public endpoint. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  contactPhoneEncrypted!: string | null;

  /** Hashed, for rate limiting only. Never a raw IP (§11). */
  @Column({ type: 'varchar', length: 64 })
  ipHash!: string;

  @Column({ type: 'varchar', default: 'SUBMITTED' })
  status!: ComplaintStatus;

  @Column({ type: 'varchar', nullable: true })
  duplicateOfId!: string | null;

  /** Required when status is REJECTED (§7.1). */
  @Column({ type: 'varchar', nullable: true })
  rejectionReason!: RejectionReason | null;

  @Column({ type: 'varchar', nullable: true })
  assignedInspectorId!: string | null;

  /** Traceability from complaint to visit (§7.1). */
  @Column({ type: 'varchar', nullable: true })
  inspectionId!: string | null;

  @Column({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime' })
  updatedAt!: Date;
}
