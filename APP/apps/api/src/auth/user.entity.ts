import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type UserRole = 'INSPECTOR' | 'OWNER' | 'ADMIN';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar' })
  role!: UserRole;

  @Column({ type: 'varchar' })
  displayNameAr!: string;

  /** Set for OWNER accounts only — owner endpoints scope from this, never from a URL param. */
  @Column({ type: 'varchar', nullable: true })
  establishmentId!: string | null;
}
