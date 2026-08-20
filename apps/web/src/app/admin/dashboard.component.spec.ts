import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AdminDashboardComponent } from './dashboard.component';
import { AdminService } from './admin.service';

const DATA = {
  kpis: { registeredCount: 4, highRiskCount: 1, complaintsThisMonth: 6, avgCloseDays: 3.2 },
  gradeDistribution: [
    { grade: 'A', count: 1 },
    { grade: 'B', count: 2 },
    { grade: 'C', count: 1 },
    { grade: 'D', count: 0 },
  ],
  complaintsOverTime: [{ weekStart: '2026-08-10', count: 3 }],
  needsAttention: { staleComplaints: 1, overdueViolations: 0, uninspectedEstablishments: 2 },
};

function build(dashboard = vi.fn(async () => DATA)) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminDashboardComponent],
    providers: [{ provide: AdminService, useValue: { dashboard } }],
  });
  const fixture = TestBed.createComponent(AdminDashboardComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AdminDashboardComponent', () => {
  it('loads and exposes the dashboard data', async () => {
    const fixture = build();
    await fixture.whenStable();
    expect(fixture.componentInstance.data()?.kpis.registeredCount).toBe(4);
  });

  it('reports a load failure instead of leaving a blank screen', async () => {
    const fixture = build(vi.fn(async () => Promise.reject(new Error('boom'))));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.componentInstance.error()).toBeTruthy();
    expect(fixture.componentInstance.data()).toBeNull();
  });

  it('reports whether anything needs attention, for the empty-state check', async () => {
    const fixture = build();
    await fixture.whenStable();
    expect(fixture.componentInstance.hasAttentionItems()).toBe(true);

    const clearFixture = build(
      vi.fn(async () => ({
        ...DATA,
        needsAttention: { staleComplaints: 0, overdueViolations: 0, uninspectedEstablishments: 0 },
      })),
    );
    await clearFixture.whenStable();
    expect(clearFixture.componentInstance.hasAttentionItems()).toBe(false);
  });

  it('builds grade bars coloured by the grade token, not the primary colour', async () => {
    const fixture = build();
    await fixture.whenStable();
    const bars = fixture.componentInstance.gradeBars();
    expect(bars.find((b) => b.label === 'A')?.color).toBe('var(--grade-a)');
    expect(bars.find((b) => b.label === 'A')?.value).toBe(1);
  });
});
