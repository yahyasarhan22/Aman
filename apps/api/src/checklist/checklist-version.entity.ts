import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ChecklistItem } from './checklist-item.entity';

/**
 * Spec §5.5: every wording change is a new version, so an inspection submitted
 * last year still renders against the checklist that was actually used.
 */
@Entity('checklist_versions')
export class ChecklistVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ type: 'datetime' })
  createdAt!: Date;

  @OneToMany(() => ChecklistItem, (item) => item.checklistVersion)
  items!: ChecklistItem[];
}
