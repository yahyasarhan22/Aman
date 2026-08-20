import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Inspection } from './inspection.entity';
import type { Severity } from '@aman/shared';

export type { Severity };
export type ViolationStatus = 'OPEN' | 'OWNER_RESPONDED' | 'VERIFIED' | 'CLOSED' | 'OVERDUE';

@Entity('violations')
export class Violation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Inspection, (i) => i.violations)
  inspection!: Inspection;

  @Column()
  inspectionId!: string;

  @Column()
  establishmentId!: string;

  @Column({ type: 'varchar', nullable: true })
  checklistItemId!: string | null;

  /** Snapshot of the checklist wording at the time of the visit. Kept as text
   *  so an edit to the live checklist can never rewrite a past record. */
  @Column()
  category!: string;

  @Column({ type: 'varchar' })
  severity!: Severity;

  @Column({ type: 'varchar', nullable: true })
  measuredValue!: string | null;

  /** Generated from the item's template, then inspector-approved (spec §6.5). */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  recommendation!: string | null;

  /** The submission date of the inspection that recorded it. The risk engine
   *  decays by age, and deadlineAt cannot stand in for this — deadlines vary
   *  by severity (48h vs 30 days), so using them would make a minor violation
   *  look more recent than a critical one from the very same visit. */
  @Column({ type: 'datetime', nullable: true })
  occurredAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  deadlineAt!: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoIds!: string | null;

  @Column({ type: 'varchar', default: 'OPEN' })
  status!: ViolationStatus;

  @Column({ type: 'datetime', nullable: true })
  respondedAt!: Date | null;
}
