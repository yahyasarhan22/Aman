import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Establishment, Grade } from './establishment.entity';
import { Violation } from './violation.entity';

@Entity('inspections')
export class Inspection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Establishment, (e) => e.inspections)
  establishment!: Establishment;

  @Column()
  establishmentId!: string;

  @Column({ type: 'int' })
  score!: number;

  @Column({ type: 'char', length: 1 })
  grade!: Grade;

  @Column({ type: 'char', length: 1, nullable: true })
  previousGrade!: Grade | null;

  @Column({ type: 'datetime' })
  submittedAt!: Date;

  @OneToMany(() => Violation, (v) => v.inspection)
  violations!: Violation[];
}
