import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashIp } from '../complaints/contact';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/**
 * Write-only by design (§11). If you ever find yourself wanting an update
 * method here, the answer is another append, not an edit.
 */
@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private logs: Repository<AuditLog>) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.logs.save({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.before === undefined ? null : JSON.stringify(entry.before),
      afterJson: entry.after === undefined ? null : JSON.stringify(entry.after),
      ipHash: entry.ip ? hashIp(entry.ip) : null,
      createdAt: new Date(),
    });
  }
}
