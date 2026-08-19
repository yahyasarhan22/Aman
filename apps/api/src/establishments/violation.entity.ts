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

  @Column()
  category!: string;

  @Column({ type: 'varchar' })
  severity!: Severity;

  @Column({ type: 'varchar', default: 'OPEN' })
  status!: ViolationStatus;

  @Column({ type: 'datetime', nullable: true })
  respondedAt!: Date | null;
}
