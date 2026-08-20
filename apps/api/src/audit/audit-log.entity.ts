import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Spec §7.1, §11: append-only. No update path, no delete path, not even for
 * admins. When someone challenges the fairness of a decision, this table is
 * the answer — and a log that can be edited answers nothing.
 */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** User id, or `owner:<establishmentId>` / `system` for non-user actors. */
  @Column({ type: 'varchar' })
  actorId!: string;

  @Index()
  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar' })
  entityType!: string;

  @Index()
  @Column({ type: 'varchar' })
  entityId!: string;

  @Column({ type: 'text', nullable: true })
  beforeJson!: string | null;

  @Column({ type: 'text', nullable: true })
  afterJson!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipHash!: string | null;

  /** Millisecond precision — several audited actions can land in one second,
   *  and a log whose order is ambiguous is a weaker record. */
  @Column({ type: 'datetime', precision: 3 })
  createdAt!: Date;
}

/** The minimum set §7.1 requires. Add to it; never remove from it. */
export const AUDIT_ACTIONS = {
  GRADE_CHANGED: 'GRADE_CHANGED',
  COMPLAINT_ASSIGNED: 'COMPLAINT_ASSIGNED',
  COMPLAINT_MARKED_DUPLICATE: 'COMPLAINT_MARKED_DUPLICATE',
  COMPLAINT_REJECTED: 'COMPLAINT_REJECTED',
  COMPLAINT_CLOSED: 'COMPLAINT_CLOSED',
  RISK_WEIGHTS_CHANGED: 'RISK_WEIGHTS_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  ESTABLISHMENT_STATUS_CHANGED: 'ESTABLISHMENT_STATUS_CHANGED',
  VIOLATION_VERIFIED: 'VIOLATION_VERIFIED',
  VIOLATION_OWNER_RESPONDED: 'VIOLATION_OWNER_RESPONDED',
} as const;
