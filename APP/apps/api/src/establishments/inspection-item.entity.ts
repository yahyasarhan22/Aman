import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { ItemResult } from '@aman/shared';
import { Inspection } from './inspection.entity';

/** One answered checklist line. Kept even for PASS and N/A — the full sheet is
 *  the record, and a missing row is indistinguishable from an unanswered one. */
@Entity('inspection_items')
export class InspectionItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Inspection, (i) => i.items)
  inspection!: Inspection;

  @Column({ type: 'varchar' })
  inspectionId!: string;

  @Column({ type: 'varchar' })
  checklistItemId!: string;

  @Column({ type: 'varchar' })
  result!: ItemResult;

  @Column({ type: 'varchar', nullable: true })
  measuredValue!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  /** Upload ids, comma-separated. A join table for at most a handful of photos
   *  per line would cost more than it returns at this size. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  photoIds!: string | null;
}
