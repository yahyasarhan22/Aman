import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ChecklistItemDef, Grade, InspectionAnswer, ItemResult } from '@aman/shared';
import { API_BASE, AuthService } from './api';
import { idb } from './idb';

export interface QueueEntry {
  establishmentId: string;
  slug: string;
  nameAr: string;
  category: string;
  address: string | null;
  currentGrade: Grade | null;
  risk: number;
  reasons: string[];
}

export interface EstablishmentBundle {
  establishment: {
    id: string;
    slug: string;
    nameAr: string;
    category: string;
    address: string | null;
    currentGrade: Grade | null;
    currentScore: number | null;
    lastInspectionAt: string | null;
  };
  checklistVersionId: string;
  checklistVersion: number;
  items: ChecklistItemDef[];
  openViolations: { id: string; category: string; severity: string; deadlineAt: string | null; status: string }[];
}

/** One answered line, held locally. `photos` are IndexedDB keys, not server ids —
 *  they become server ids only at upload time. */
export interface DraftAnswer {
  result: ItemResult | null;
  measuredValue: string;
  note: string;
  photos: string[];
}

export interface InspectionDraft {
  clientId: string;
  establishmentId: string;
  bundle: EstablishmentBundle;
  answers: Record<string, DraftAnswer>;
  /** Resume exactly where the inspector left off, including the section (§9). */
  currentSection: number;
  recommendations: Record<string, string>;
  signature: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface OutboxEntry {
  clientId: string;
  establishmentNameAr: string;
  payload: {
    clientId: string;
    establishmentId: string;
    checklistVersionId: string;
    answers: InspectionAnswer[];
    recommendations: Record<string, string>;
    startedAt: string;
    inspectorSignature: string | null;
    isOfflineSubmission: boolean;
  };
  /** IndexedDB photo keys still awaiting upload, per answer. */
  pendingPhotos: Record<string, string[]>;
  attempts: number;
  lastError: string | null;
  savedAt: string;
}

export interface SubmitResult {
  inspectionId: string;
  score: number;
  grade: Grade;
  previousGrade: Grade | null;
  violationCount: number;
  duplicate: boolean;
}

const QUEUE_KEY = 'queue';
const QUEUE_AT_KEY = 'queue.fetchedAt';
const DRAFT_PREFIX = 'draft:';
const OUTBOX_PREFIX = 'outbox:';
const PHOTO_PREFIX = 'photo:';

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
/** After this many automatic attempts, stop retrying silently and let the
 *  manual Retry button in /app/sync take over — spec §9. */
const MAX_AUTO_ATTEMPTS = 3;

/** Exported so it is testable in isolation from the timer plumbing. */
export function backoffDelayMs(attempts: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempts);
}

export const emptyAnswer = (): DraftAnswer => ({
  result: null,
  measuredValue: '',
  note: '',
  photos: [],
});

@Injectable({ providedIn: 'root' })
export class InspectorService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly online = signal(navigator.onLine);
  readonly pendingCount = signal(0);
  readonly queueFetchedAt = signal<string | null>(null);

  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    addEventListener('online', () => {
      this.online.set(true);
      void this.drainOutbox();
    });
    addEventListener('offline', () => this.online.set(false));
    void this.refreshPendingCount();
  }

  // --- queue --------------------------------------------------------------

  async getQueue(): Promise<{ entries: QueueEntry[]; stale: boolean }> {
    if (navigator.onLine) {
      try {
        const entries = await firstValueFrom(
          this.http.get<QueueEntry[]>(`${API_BASE}/api/inspector/queue`, {
            headers: this.auth.authHeaders(),
          }),
        );
        const at = new Date().toISOString();
        await idb.set(QUEUE_KEY, entries);
        await idb.set(QUEUE_AT_KEY, at);
        this.queueFetchedAt.set(at);
        return { entries, stale: false };
      } catch (error) {
        this.auth.handleAuthError(error);
        if (!(await idb.get<QueueEntry[]>(QUEUE_KEY))) throw error;
      }
    }
    const cached = (await idb.get<QueueEntry[]>(QUEUE_KEY)) ?? [];
    this.queueFetchedAt.set((await idb.get<string>(QUEUE_AT_KEY)) ?? null);
    return { entries: cached, stale: true };
  }

  // --- drafts -------------------------------------------------------------

  getDraft(establishmentId: string): Promise<InspectionDraft | undefined> {
    return idb.get<InspectionDraft>(DRAFT_PREFIX + establishmentId);
  }

  /** Tapping Start pulls the whole record down before the checklist opens, so
   *  losing signal mid-inspection is harmless (spec §5.4). */
  async startInspection(establishmentId: string): Promise<InspectionDraft> {
    const existing = await this.getDraft(establishmentId);
    if (existing) return existing;

    const bundle = await firstValueFrom(
      this.http.get<EstablishmentBundle>(
        `${API_BASE}/api/inspector/establishments/${establishmentId}/bundle`,
        { headers: this.auth.authHeaders() },
      ),
    );

    const now = new Date().toISOString();
    const draft: InspectionDraft = {
      clientId: crypto.randomUUID(),
      establishmentId,
      bundle,
      answers: Object.fromEntries(bundle.items.map((item) => [item.id, emptyAnswer()])),
      currentSection: bundle.items[0]?.section ?? 1,
      recommendations: {},
      signature: null,
      startedAt: now,
      updatedAt: now,
    };
    await this.saveDraft(draft);
    return draft;
  }

  async saveDraft(draft: InspectionDraft): Promise<void> {
    await idb.set(DRAFT_PREFIX + draft.establishmentId, { ...draft, updatedAt: new Date().toISOString() });
  }

  async discardDraft(draft: InspectionDraft): Promise<void> {
    for (const answer of Object.values(draft.answers)) {
      for (const key of answer.photos) await idb.del(key);
    }
    await idb.del(DRAFT_PREFIX + draft.establishmentId);
  }

  // --- photos -------------------------------------------------------------

  async storePhoto(blob: Blob): Promise<string> {
    const key = PHOTO_PREFIX + crypto.randomUUID();
    await idb.set(key, blob);
    return key;
  }

  getPhoto(key: string): Promise<Blob | undefined> {
    return idb.get<Blob>(key);
  }

  // --- submission ---------------------------------------------------------

  /**
   * Builds the payload once, then tries the network. Anything that fails —
   * offline, flaky signal, a 500 — lands in the outbox under the same
   * clientId, so a later retry is idempotent server-side (spec §8.2).
   */
  async submit(draft: InspectionDraft): Promise<{ result: SubmitResult | null; queued: boolean }> {
    const answers: InspectionAnswer[] = draft.bundle.items.map((item) => {
      const answer = draft.answers[item.id] ?? emptyAnswer();
      return {
        checklistItemId: item.id,
        result: answer.result as ItemResult,
        measuredValue: answer.measuredValue || null,
        note: answer.note || null,
        photoIds: [],
      };
    });

    const pendingPhotos: Record<string, string[]> = {};
    for (const item of draft.bundle.items) {
      const photos = draft.answers[item.id]?.photos ?? [];
      if (photos.length) pendingPhotos[item.id] = photos;
    }

    const entry: OutboxEntry = {
      clientId: draft.clientId,
      establishmentNameAr: draft.bundle.establishment.nameAr,
      payload: {
        clientId: draft.clientId,
        establishmentId: draft.establishmentId,
        checklistVersionId: draft.bundle.checklistVersionId,
        answers,
        recommendations: draft.recommendations,
        startedAt: draft.startedAt,
        inspectorSignature: draft.signature,
        isOfflineSubmission: !navigator.onLine,
      },
      pendingPhotos,
      attempts: 0,
      lastError: null,
      savedAt: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      await this.queueEntry(entry);
      return { result: null, queued: true };
    }

    try {
      const result = await this.send(entry);
      await this.discardDraft(draft);
      return { result, queued: false };
    } catch (error) {
      this.auth.handleAuthError(error);
      entry.attempts = 1;
      entry.lastError = describe(error);
      await this.queueEntry(entry);
      this.scheduleRetry(entry.attempts);
      return { result: null, queued: true };
    }
  }

  /** Photos first, then the inspection with the returned file ids (spec §9). */
  private async send(entry: OutboxEntry): Promise<SubmitResult> {
    const uploaded: Record<string, string[]> = {};
    for (const [itemId, keys] of Object.entries(entry.pendingPhotos)) {
      uploaded[itemId] = [];
      for (const key of keys) {
        const blob = await this.getPhoto(key);
        if (!blob) continue;
        const form = new FormData();
        form.append('file', blob, 'photo.jpg');
        const response = await firstValueFrom(
          this.http.post<{ id: string }>(`${API_BASE}/api/uploads`, form, {
            headers: this.auth.authHeaders(),
          }),
        );
        uploaded[itemId].push(response.id);
      }
    }

    const payload = {
      ...entry.payload,
      answers: entry.payload.answers.map((a) => ({
        ...a,
        photoIds: uploaded[a.checklistItemId] ?? a.photoIds ?? [],
      })),
    };

    const result = await firstValueFrom(
      this.http.post<SubmitResult>(`${API_BASE}/api/inspector/inspections`, payload, {
        headers: this.auth.authHeaders(),
      }),
    );

    for (const keys of Object.values(entry.pendingPhotos)) {
      for (const key of keys) await idb.del(key);
    }
    return result;
  }

  // --- outbox -------------------------------------------------------------

  getOutbox(): Promise<{ key: string; value: OutboxEntry }[]> {
    return idb.prefixed<OutboxEntry>(OUTBOX_PREFIX);
  }

  private async queueEntry(entry: OutboxEntry): Promise<void> {
    await idb.set(OUTBOX_PREFIX + entry.clientId, entry);
    await this.refreshPendingCount();
  }

  async refreshPendingCount(): Promise<void> {
    this.pendingCount.set((await this.getOutbox()).length);
  }

  /** Schedules one automatic re-drain after a backoff delay, unless the entry
   *  has already exhausted its automatic attempts. Keyed by attempt count
   *  rather than per-entry — this re-drains the whole outbox rather than one
   *  entry, which is simpler than per-entry timers and correct here since a
   *  drain that finds nothing to send is a no-op. */
  scheduleRetry(attempts: number): void {
    if (attempts >= MAX_AUTO_ATTEMPTS) return;
    const key = `attempt-${attempts}`;
    if (this.retryTimers.has(key)) return;
    const timer = setTimeout(() => {
      this.retryTimers.delete(key);
      void this.drainOutbox();
    }, backoffDelayMs(attempts));
    this.retryTimers.set(key, timer);
  }

  /** Returns how many entries went out. Never throws — a failed drain leaves
   *  the entry in place with its error visible in /app/sync. */
  async drainOutbox(): Promise<number> {
    if (!navigator.onLine) return 0;
    let sent = 0;
    for (const { key, value } of await this.getOutbox()) {
      try {
        await this.send(value);
        await idb.del(key);
        await idb.del(DRAFT_PREFIX + value.payload.establishmentId);
        sent++;
      } catch (error) {
        this.auth.handleAuthError(error);
        const attempts = value.attempts + 1;
        await idb.set(key, {
          ...value,
          attempts,
          lastError: describe(error),
        } satisfies OutboxEntry);
        this.scheduleRetry(attempts);
      }
    }
    await this.refreshPendingCount();
    return sent;
  }
}

function describe(error: unknown): string {
  if (typeof error === 'object' && error && 'error' in error) {
    const body = (error as { error?: { message?: string } }).error;
    if (body?.message) return body.message;
  }
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'تعذّر الاتصال بالخادم';
}
