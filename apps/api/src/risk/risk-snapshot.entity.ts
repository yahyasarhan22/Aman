import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RiskTrigger = 'COMPLAINT' | 'INSPECTION' | 'VERIFICATION' | 'MANUAL';

/**
 * Spec §6.2: persist each factor's contribution alongside the total. The queue
 * must be able to display why an establishment ranks where it does, and the
 * history is what defends the formula to a judge, an owner, or a court.
 */
@Entity('risk_score_snapshots')
export class RiskSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar' })
  establishmentId!: string;

  @Column({ type: 'int' })
  total!: number;

  /** Serialized RiskFactor[] — the full derivation, not just the number. */
  @Column({ type: 'text' })
  factorsJson!: string;

  /** What caused the recalculation, so a jump in the ranking is explainable. */
  @Column({ type: 'varchar' })
  trigger!: RiskTrigger;

  /**
   * Millisecond precision, not the MySQL `datetime` default of whole seconds.
   * Several events can land inside one second — three complaints filed in a
   * row each trigger a recalculation — and at second precision the rows tie,
   * so "latest" became whichever one the engine happened to return. That
   * silently served a stale ranking that had counted only the first complaint.
   */
  @Column({ type: 'datetime', precision: 3 })
  calculatedAt!: Date;
}
