import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Establishment, Grade } from './establishment.entity';
import { Violation } from './violation.entity';
import { InspectionItem } from './inspection-item.entity';

export type InspectionType = 'ROUTINE' | 'COMPLAINT_DRIVEN' | 'FOLLOW_UP';

@Entity('inspections')
export class Inspection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Client-generated UUID, set when the inspector taps Start (spec §8.2). A
   * retry after a flaky connection returns the existing record instead of
   * writing a second grade for one visit.
   */
  @Column({ type: 'varchar', unique: true, nullable: true })
  clientId!: string | null;

  @ManyToOne(() => Establishment, (e) => e.inspections)
  establishment!: Establishment;

  @Column()
  establishmentId!: string;

  @Column({ type: 'varchar', nullable: true })
  inspectorId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  checklistVersionId!: string | null;

  @Column({ type: 'varchar', default: 'ROUTINE' })
  type!: InspectionType;

  @Column({ type: 'int' })
  score!: number;

  @Column({ type: 'char', length: 1 })
  grade!: Grade;

  @Column({ type: 'char', length: 1, nullable: true })
  previousGrade!: Grade | null;

  @Column({ type: 'datetime', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime' })
  submittedAt!: Date;

  /** Base64 canvas image — the inspector's signature on the record. */
  @Column({ type: 'mediumtext', nullable: true })
  inspectorSignature!: string | null;

  @Column({ type: 'boolean', default: false })
  isOfflineSubmission!: boolean;

  @OneToMany(() => Violation, (v) => v.inspection)
  violations!: Violation[];

  @OneToMany(() => InspectionItem, (i) => i.inspection)
  items!: InspectionItem[];
}
