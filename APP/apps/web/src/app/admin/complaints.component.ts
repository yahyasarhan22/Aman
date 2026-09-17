import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AdminService,
  type AdminComplaint,
  type ComplaintAction,
  type InspectorOption,
} from './admin.service';
import { API_BASE } from '../core/api';
import { T } from '../core/strings';

const REJECTION_REASONS = [
  'OUT_OF_JURISDICTION',
  'INSUFFICIENT_DETAIL',
  'NOT_FOOD_SAFETY',
  'ESTABLISHMENT_CLOSED',
  'ABUSIVE_OR_SPAM',
];

const STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'INSPECTED',
  'CLOSED',
  'DUPLICATE',
  'REJECTED',
];

/** Nothing more to decide once a complaint reaches one of these. */
const SETTLED = new Set(['CLOSED', 'DUPLICATE', 'REJECTED']);

interface RowMessage {
  text: string;
  kind: 'ok' | 'error';
}

@Component({
  selector: 'app-admin-complaints',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './complaints.component.html',
  styleUrl: './complaints.component.css',
})
export class AdminComplaintsComponent {
  readonly t = T;
  readonly rejectionReasons = REJECTION_REASONS;
  readonly statuses = STATUSES;

  private admin = inject(AdminService);

  readonly rows = signal<AdminComplaint[]>([]);
  readonly inspectors = signal<InspectorOption[]>([]);
  readonly busy = signal(false);
  readonly acting = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  private readonly rowMessages = signal<Record<string, RowMessage>>({});

  readonly statusFilter = signal('');
  readonly evidenceFilter = signal('');

  constructor() {
    void this.load();
    void this.loadInspectors();
  }

  isSettled(row: AdminComplaint): boolean {
    return SETTLED.has(row.status);
  }

  /** Reject/close stay available until the complaint is actually settled —
   *  only "assign" itself is done once an inspector is on the record. */
  hideAssign(row: AdminComplaint): boolean {
    return !!row.assignedInspectorNameAr;
  }

  rowMessage(id: string): RowMessage | undefined {
    return this.rowMessages()[id];
  }

  photoUrl(id: string): string {
    return `${API_BASE}/uploads/${id}`;
  }

  setStatus(value: string): void {
    this.statusFilter.set(value);
    void this.load();
  }

  setEvidence(value: string): void {
    this.evidenceFilter.set(value);
    void this.load();
  }

  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const filter: Record<string, string> = {};
      if (this.statusFilter()) filter['status'] = this.statusFilter();
      if (this.evidenceFilter()) filter['hasEvidence'] = this.evidenceFilter();
      this.rows.set(await this.admin.listComplaints(filter));
    } catch {
      this.error.set(T.admin.loadFailed);
    } finally {
      this.busy.set(false);
    }
  }

  private async loadInspectors(): Promise<void> {
    try {
      this.inspectors.set(await this.admin.inspectors());
    } catch {
      this.inspectors.set([]);
    }
  }

  async assign(row: AdminComplaint, inspectorId: string): Promise<void> {
    if (!inspectorId) {
      this.setRowMessage(row.id, { text: T.admin.complaints.chooseInspectorFirst, kind: 'error' });
      return;
    }
    await this.act(row, { action: 'assign', inspectorId });
  }

  async reject(row: AdminComplaint, reason: string): Promise<void> {
    if (!reason) {
      this.setRowMessage(row.id, { text: T.admin.complaints.chooseReasonFirst, kind: 'error' });
      return;
    }
    // A rejection is permanent and attributed. Say so before it happens, not
    // after — this is the action the whole audit trail exists to defend.
    if (!confirm(T.admin.complaints.confirmReject)) return;
    await this.act(row, { action: 'reject', reason });
  }

  async close(row: AdminComplaint): Promise<void> {
    await this.act(row, { action: 'close' });
  }

  private setRowMessage(id: string, message: RowMessage | null): void {
    this.rowMessages.update((current) => {
      const next = { ...current };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  private async act(
    row: AdminComplaint,
    body: { action: ComplaintAction; inspectorId?: string; reason?: string },
  ): Promise<void> {
    this.acting.set(row.id);
    this.error.set(null);
    this.setRowMessage(row.id, null);
    try {
      await this.admin.act(row.id, body);
      await this.load();
      this.setRowMessage(row.id, {
        text:
          body.action === 'assign'
            ? T.admin.complaints.assignedOk
            : body.action === 'reject'
              ? T.admin.complaints.rejectedOk
              : T.admin.complaints.closedOk,
        kind: 'ok',
      });
    } catch (error) {
      const message = (error as { error?: { message?: string } })?.error?.message;
      this.setRowMessage(row.id, { text: message ?? T.admin.loadFailed, kind: 'error' });
    } finally {
      this.acting.set(null);
    }
  }
}
