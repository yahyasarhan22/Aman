import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Severity } from '@aman/shared';
import { ChecklistVersion } from './checklist-version.entity';

@Entity('checklist_items')
export class ChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChecklistVersion, (v) => v.items)
  checklistVersion!: ChecklistVersion;

  @Column({ type: 'varchar' })
  checklistVersionId!: string;

  @Column({ type: 'int' })
  section!: number;

  @Column({ type: 'varchar' })
  sectionNameAr!: string;

  @Column({ type: 'varchar' })
  code!: string;

  @Column({ type: 'varchar', length: 500 })
  labelAr!: string;

  @Column({ type: 'varchar' })
  severity!: Severity;

  @Column({ type: 'boolean', default: false })
  requiresMeasurement!: boolean;

  @Column({ type: 'varchar', nullable: true })
  unit!: string | null;

  @Column({ type: 'varchar', nullable: true })
  threshold!: string | null;

  @Column({ type: 'varchar', length: 1000 })
  recommendationTemplate!: string;

  @Column({ type: 'int' })
  sortOrder!: number;
}
