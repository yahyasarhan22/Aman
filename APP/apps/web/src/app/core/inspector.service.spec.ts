import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { backoffDelayMs, InspectorService } from './inspector.service';
import { AuthService } from './api';

/**
 * InspectorService's constructor fire-and-forgets a call into IndexedDB
 * (refreshPendingCount), and this test environment has no indexedDB global.
 * Angular's unit-test builder also disallows `vi.mock` on relative imports,
 * so the real fix is a minimal in-memory IndexedDB — just enough of the
 * request/event shape `idb.ts` actually calls — rather than swallowing the
 * unhandled rejection this constructor would otherwise throw on every spec
 * in this file.
 */
beforeAll(() => {
  if (typeof indexedDB !== 'undefined') return;

  class FakeRequest<T> {
    result!: T;
    error: unknown = null;
    onsuccess: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onupgradeneeded: (() => void) | null = null;
    private settle(result: T): void {
      this.result = result;
      queueMicrotask(() => this.onsuccess?.());
    }
    static resolved<T>(result: T): FakeRequest<T> {
      const r = new FakeRequest<T>();
      r.settle(result);
      return r;
    }
  }

  const store = new Map<string, unknown>();

  class FakeObjectStore {
    get(key: string) {
      return FakeRequest.resolved(store.get(key));
    }
    put(value: unknown, key: string) {
      store.set(key, value);
      return FakeRequest.resolved(undefined);
    }
    delete(key: string) {
      store.delete(key);
      return FakeRequest.resolved(undefined);
    }
    getAllKeys() {
      return FakeRequest.resolved([...store.keys()]);
    }
  }

  class FakeTransaction {
    objectStore() {
      return new FakeObjectStore();
    }
  }

  class FakeDatabase {
    createObjectStore() {
      return new FakeObjectStore();
    }
    transaction() {
      return new FakeTransaction();
    }
  }

  (globalThis as any).indexedDB = {
    open() {
      const request = new FakeRequest<FakeDatabase>();
      queueMicrotask(() => {
        request.result = new FakeDatabase();
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
});

describe('backoffDelayMs', () => {
  it('doubles from a five-second base', () => {
    expect(backoffDelayMs(0)).toBe(5_000);
    expect(backoffDelayMs(1)).toBe(10_000);
    expect(backoffDelayMs(2)).toBe(20_000);
  });

  it('caps at five minutes so a stuck outbox does not back off forever', () => {
    expect(backoffDelayMs(10)).toBe(5 * 60_000);
  });
});

describe('InspectorService — automatic retry scheduling', () => {
  function build() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { authHeaders: () => ({}), handleAuthError: vi.fn() } },
      ],
    });
    return TestBed.inject(InspectorService);
  }

  it('schedules an automatic retry after the backoff delay for that attempt count', () => {
    vi.useFakeTimers();
    const service = build();
    const drainSpy = vi.spyOn(service, 'drainOutbox').mockResolvedValue(0);

    service.scheduleRetry(0); // first failure — a retry is still allowed
    expect(drainSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(backoffDelayMs(0) - 1);
    expect(drainSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(drainSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('stops scheduling once the automatic-attempt cap is reached, leaving it for the manual button', () => {
    vi.useFakeTimers();
    const service = build();
    const drainSpy = vi.spyOn(service, 'drainOutbox').mockResolvedValue(0);

    // MAX_AUTO_ATTEMPTS is 3 — an entry that has already failed 3 times must
    // not schedule a 4th automatic attempt.
    service.scheduleRetry(3);
    vi.advanceTimersByTime(10 * 60_000);
    expect(drainSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('does not double-schedule the same attempt count', () => {
    vi.useFakeTimers();
    const service = build();
    const drainSpy = vi.spyOn(service, 'drainOutbox').mockResolvedValue(0);

    service.scheduleRetry(1);
    service.scheduleRetry(1);
    vi.advanceTimersByTime(backoffDelayMs(1));
    expect(drainSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
