import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AdminSettingsComponent } from './settings.component';
import { AdminService } from './admin.service';

function build(getRiskWeights = vi.fn(), updateRiskWeights = vi.fn()) {
  TestBed.configureTestingModule({
    imports: [AdminSettingsComponent],
    providers: [{ provide: AdminService, useValue: { getRiskWeights, updateRiskWeights } }],
  });
  const fixture = TestBed.createComponent(AdminSettingsComponent);
  fixture.detectChanges();
  return fixture;
}

const VALID = {
  PRIOR_VIOLATIONS: 40,
  COMPLAINT_PRESSURE: 30,
  TIME_SINCE_INSPECTION: 20,
  CATEGORY: 10,
};

describe('AdminSettingsComponent', () => {
  it('loads the current weights on init', async () => {
    const get = vi.fn(async () => ({ weights: VALID, updatedAt: null, updatedByLabel: 'x' }));
    const fixture = build(get);
    await fixture.whenStable();
    expect(fixture.componentInstance.priorViolations()).toBe(40);
  });

  it('computes the live sum as the admin edits a field', async () => {
    const get = vi.fn(async () => ({ weights: VALID, updatedAt: null, updatedByLabel: 'x' }));
    const fixture = build(get);
    await fixture.whenStable();
    fixture.componentInstance.priorViolations.set(50);
    expect(fixture.componentInstance.sum()).toBe(110);
    expect(fixture.componentInstance.canSave()).toBe(false);
  });

  it('allows saving only when the four weights sum to 100', async () => {
    const get = vi.fn(async () => ({ weights: VALID, updatedAt: null, updatedByLabel: 'x' }));
    const fixture = build(get);
    await fixture.whenStable();
    expect(fixture.componentInstance.canSave()).toBe(true);
  });

  it('sends the edited weights on save', async () => {
    const get = vi.fn(async () => ({ weights: VALID, updatedAt: null, updatedByLabel: 'x' }));
    const update = vi.fn(async (w: any) => ({ weights: w, updatedAt: 'now', updatedByLabel: 'admin' }));
    const fixture = build(get, update);
    await fixture.whenStable();

    fixture.componentInstance.priorViolations.set(50);
    fixture.componentInstance.complaintPressure.set(20);
    await fixture.componentInstance.save();

    expect(update).toHaveBeenCalledWith({
      PRIOR_VIOLATIONS: 50,
      COMPLAINT_PRESSURE: 20,
      TIME_SINCE_INSPECTION: 20,
      CATEGORY: 10,
    });
  });

  it('reports a load failure rather than a blank form', async () => {
    const get = vi.fn(async () => Promise.reject(new Error('boom')));
    const fixture = build(get);
    // A rejected promise from the constructor's fire-and-forget load() is not
    // something whenStable() tracks under zoneless change detection — flush a
    // microtask explicitly rather than relying on it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.componentInstance.error()).toBeTruthy();
  });
});
