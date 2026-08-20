import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Exactly one row, id fixed at 'current'. Simpler than a real key-value store
 *  for four numbers that always change together. */
@Entity('risk_weights')
export class RiskWeightsRow {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'int' })
  priorViolations!: number;

  @Column({ type: 'int' })
  complaintPressure!: number;

  @Column({ type: 'int' })
  timeSinceInspection!: number;

  @Column({ type: 'int' })
  category!: number;

  @Column({ type: 'datetime' })
  updatedAt!: Date;

  @Column({ type: 'varchar' })
  updatedBy!: string;
}
