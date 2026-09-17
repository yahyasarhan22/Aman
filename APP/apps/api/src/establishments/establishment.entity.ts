import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Inspection } from './inspection.entity';
import type { Grade } from '@aman/shared';

export type { Grade };
export type EstablishmentCategory = 'BUTCHER' | 'RESTAURANT' | 'BAKERY' | 'CAFE' | 'RETAIL';
export type EstablishmentStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

@Entity('establishments')
export class Establishment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  slug!: string;

  @Column()
  nameAr!: string;

  @Column({ type: 'varchar', nullable: true })
  nameEn!: string | null;

  @Column({ type: 'varchar' })
  category!: EstablishmentCategory;

  @Column({ type: 'varchar', nullable: true })
  address!: string | null;

  @Column({ type: 'char', length: 1, nullable: true })
  currentGrade!: Grade | null;

  @Column({ type: 'int', nullable: true })
  currentScore!: number | null;

  @Column({ type: 'datetime', nullable: true })
  lastInspectionAt!: Date | null;

  /** Denormalized for fast list reads (spec §7.1). The authoritative
   *  derivation lives in risk_score_snapshots — never treat this column as
   *  the record, only as a cached headline. */
  @Column({ type: 'int', default: 0 })
  currentRiskScore!: number;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: EstablishmentStatus;

  @OneToMany(() => Inspection, (inspection) => inspection.establishment)
  inspections!: Inspection[];
}
