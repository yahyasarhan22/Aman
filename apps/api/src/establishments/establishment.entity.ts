import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Inspection } from './inspection.entity';

export type EstablishmentCategory = 'BUTCHER' | 'RESTAURANT' | 'BAKERY' | 'CAFE' | 'RETAIL';
export type EstablishmentStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type Grade = 'A' | 'B' | 'C' | 'D';

@Entity('establishments')
export class Establishment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  slug!: string;

  @Column()
  nameAr!: string;

  @Column({ nullable: true })
  nameEn?: string;

  @Column({ type: 'varchar' })
  category!: EstablishmentCategory;

  @Column({ nullable: true })
  address?: string;

  @Column({ type: 'char', length: 1, nullable: true })
  currentGrade!: Grade | null;

  @Column({ type: 'int', nullable: true })
  currentScore!: number | null;

  @Column({ type: 'datetime', nullable: true })
  lastInspectionAt!: Date | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status!: EstablishmentStatus;

  @OneToMany(() => Inspection, (inspection) => inspection.establishment)
  inspections!: Inspection[];
}
