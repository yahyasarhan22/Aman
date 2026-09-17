# Aman — Week 4: Polish + Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a demo-ready system per spec §12 Week 4 — admin dashboard with KPIs and needs-attention, a risk-weights settings screen, a QR batch sheet, hardened offline sync, a realistic demo dataset, and a full RTL/empty-state audit — while closing the automated-test gap on `apps/web` that Week 1–3 left open.

**Architecture:** Backend additions are thin — `AdminService.dashboard()` reads existing tables with aggregate queries, a new one-row `risk_weights` table makes the already-overridable §6.2 formula actually adjustable, and QR generation reuses the `qrcode` package already in `apps/api`. The QR "printable PDF sheet" is a browser print stylesheet, not a generated PDF binary — the browser's own Print → Save as PDF is the PDF step, which needs zero new dependencies for a 4-week prototype. Frontend test coverage is added both retroactively (on the two components that shipped real bugs) and prospectively (every new Week 4 component ships with its test).

**Tech Stack:** Unchanged — npm workspaces, TypeScript, NestJS 10 + TypeORM + MySQL 8, Angular 22 (standalone, signals, zoneless). Web tests run via `@angular/build:unit-test`, which is Vitest under the hood (`tsconfig.spec.json` already declares `types: ["vitest/globals"]`, so `describe`/`it`/`expect` are globals — no import needed, though this plan imports them explicitly for clarity when a file also imports `vi`).

## Global Constraints

Every task's requirements implicitly include this section — see Weeks 1–3 plans for the full list. Repeated here because Week 4 touches them directly:

- **Only a submitted inspection may write a grade** (§3.1, §6.3, §11). Nothing in this plan touches `establishment.currentGrade`.
- **Every risk-weight change is logged with who and when** (§5.10) — no silent tuning of the formula.
- **`<html dir="rtl" lang="ar">` is the default.** CSS logical properties only.
- **No Arabic string literals in components** — all copy lives in `apps/web/src/app/core/strings.ts`.
- **Grade colours are for grade badges only** (§10.2). Charts use `--risk-*` and neutral tones.
- **Definition of done per feature** (§12.1): RTL at 375px, empty + loading + error states, core logic unit-tested, no console errors, sensitive actions in the audit log.
- **Out of scope, still out of scope** (§1.3): no ML risk model, no payments, no multi-municipality tenancy.

**Explicit scope cut for this plan:** §5.10's settings screen also asks for a checklist-item editor and user management. Per §12's own cut order ("cut admin charts first if behind"), and because neither is load-bearing for the demo script, this plan builds only the risk-weights half of Settings — the piece where Week 3 already built the engine support (`calculateRisk` accepts an override) and only the UI was missing. Checklist editing and user management remain future work.

---

## File Structure

**`apps/api`**
- Create `src/settings/risk-weights.entity.ts`, `settings.service.ts`, `settings.module.ts`, `settings.service.spec.ts` — the one adjustable setting this plan ships.
- Modify `src/risk/risk.service.ts` — reads live weights from `SettingsService` instead of the hardcoded default.
- Modify `src/risk/risk.module.ts` — imports `SettingsModule`.
- Modify `src/admin/admin.dto.ts`, `admin.service.ts`, `admin.service.spec.ts`, `admin.controller.ts` — add `dashboard()` and QR batch.
- Create `src/admin/qr.service.ts`, `qr.service.spec.ts` — data-URL QR generation, reusing the existing `qrcode` dependency.
- Modify `src/seed.ts` — scale to 15 establishments / 45 complaints (§13.1).

**`apps/web`**
- Create `src/app/admin/dashboard.component.{ts,spec.ts}`, `settings.component.{ts,spec.ts}`, `qr-sheet.component.{ts,spec.ts}`.
- Create `src/app/ui/bar-chart.component.ts` — one small hand-rolled SVG bar chart, reused by both dashboard charts (grade distribution and complaints-over-time are both "a few labelled bars").
- Create `src/app/public/complaint-form.component.spec.ts`, `src/app/inspector/login.component.spec.ts` — regression tests retrofitted onto the two components that shipped real bugs in Week 3.
- Modify `src/app/core/inspector.service.ts` — exponential backoff for outbox auto-retry.
- Create `src/app/core/inspector.service.spec.ts` — first test file for this service.
- Modify `src/app/core/strings.ts`, `src/app/app.routes.ts`, `src/app/admin/admin-shell.component.ts`.

---

## Task 1: Web test harness — retrofit regression tests on the two components that shipped real bugs

Before writing anything new, prove the test pipeline works and lock in the two bugs Week 3 found by hand so they can never come back silently.

**Files:**
- Create: `apps/web/src/app/public/complaint-form.component.spec.ts`
- Create: `apps/web/src/app/inspector/login.component.spec.ts`

**Interfaces:**
- Consumes: `ComplaintFormComponent` (`apps/web/src/app/public/complaint-form.component.ts`), `LoginComponent` (`apps/web/src/app/inspector/login.component.ts`), both already built in Week 2–3.
- Produces: nothing new — this task is pure regression coverage.

---

- [ ] **Step 1: Write the failing test for the native-submit bug**

Week 3 shipped `(ngSubmit)` on a component with no `FormsModule` import, which silently never fires and lets the browser do a real GET navigation instead — caught only by watching the URL change to `?category=PESTS` in a live browser. Lock that in.

Create `apps/web/src/app/public/complaint-form.component.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ComplaintFormComponent } from './complaint-form.component';
import { ComplaintService } from './complaint.service';
import { EstablishmentService } from './establishment.service';

function build() {
  TestBed.configureTestingModule({
    imports: [ComplaintFormComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: new Map([['slug', 'golden-oven-nablus']]) } },
      },
      {
        provide: EstablishmentService,
        useValue: { getBySlug: () => of({ nameAr: 'الفرن الذهبي' }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ComplaintFormComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ComplaintFormComponent', () => {
  it('binds submit to the native event and calls preventDefault, never a real navigation', () => {
    // Regression test: (ngSubmit) requires FormsModule/NgForm, which this
    // signal-based component does not import. Without it, ngSubmit silently
    // never fires and the browser performs a real GET, reloading the page
    // with the form fields as a query string. This asserts the handler is
    // wired to the native `submit` event and stops that navigation.
    const fixture = build();
    const component = fixture.componentInstance;
    const form = fixture.nativeElement.querySelector('form');
    expect(form).toBeTruthy();

    const event = new Event('submit', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    component.category.set('PESTS');
    component.description.set('صراصير قرب منطقة التحضير');

    form.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
  });

  it('does not submit while no category is chosen', () => {
    const fixture = build();
    const component = fixture.componentInstance;
    expect(component.canSubmit()).toBe(false);
    component.description.set('وصف كافٍ');
    expect(component.canSubmit()).toBe(false);
  });

  it('does not submit with an empty or whitespace-only description', () => {
    const fixture = build();
    const component = fixture.componentInstance;
    component.category.set('PESTS');
    component.description.set('   ');
    expect(component.canSubmit()).toBe(false);
  });

  it('becomes submittable once both a category and a real description exist', () => {
    const fixture = build();
    const component = fixture.componentInstance;
    component.category.set('PESTS');
    component.description.set('صراصير قرب منطقة التحضير');
    expect(component.canSubmit()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify the harness works**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: PASS. If this fails on infrastructure (module resolution, missing provider) rather than assertions, fix the test setup before moving on — every later task depends on this harness working.

- [ ] **Step 3: Write the failing test for the role-redirect bug**

Week 3 also shipped a login form that sent every role to `/app/today`, so an admin who signed in landed on a screen they don't have. Create `apps/web/src/app/inspector/login.component.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../core/api';

function build(role: 'ADMIN' | 'OWNER' | 'INSPECTOR') {
  const navigate = vi.fn(async () => true);
  const login = vi.fn(async () => undefined);

  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      { provide: Router, useValue: { navigate } },
      {
        provide: AuthService,
        useValue: { login, user: () => ({ role, displayNameAr: 'x' }) },
      },
    ],
  });

  const fixture = TestBed.createComponent(LoginComponent);
  return { fixture, navigate, login };
}

describe('LoginComponent — role-based redirect', () => {
  it('sends an admin to complaint triage, not the inspector queue', async () => {
    const { fixture, navigate } = build('ADMIN');
    await fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/admin/complaints']);
  });

  it('sends an owner to the portal', async () => {
    const { fixture, navigate } = build('OWNER');
    await fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/portal']);
  });

  it('sends an inspector to today’s queue', async () => {
    const { fixture, navigate } = build('INSPECTOR');
    await fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/app/today']);
  });
});
```

- [ ] **Step 4: Run both spec files**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: PASS, 7 tests across the two files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/public/complaint-form.component.spec.ts apps/web/src/app/inspector/login.component.spec.ts
git commit -m "test: retrofit regression tests on the two components that shipped real bugs"
```

---

## Task 2: Risk-weights settings — backend

Closes the gap the Week 3 report named explicitly: `calculateRisk` already accepts an override; nothing persists one yet.

**Files:**
- Create: `apps/api/src/settings/risk-weights.entity.ts`
- Create: `apps/api/src/settings/settings.service.ts`
- Create: `apps/api/src/settings/settings.module.ts`
- Create: `apps/api/src/settings/settings.service.spec.ts`
- Modify: `apps/api/src/risk/risk.service.ts`
- Modify: `apps/api/src/risk/risk.module.ts`
- Modify: `apps/api/src/admin/admin.dto.ts`
- Modify: `apps/api/src/admin/admin.service.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/admin/admin.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `RISK_WEIGHTS`, `RiskWeights`, `calculateRisk` from `@aman/shared` (Week 3).
- Produces: `SettingsService.getWeights(): Promise<RiskWeights>`, `SettingsService.updateWeights(weights: RiskWeights, actorId: string): Promise<RiskWeights>`. `RiskService.recalculate` now calls `getWeights()` — Task 3's dashboard and every existing queue/planning caller are unaffected since the return shape is identical.

---

- [ ] **Step 1: Create the entity**

A single row is the whole requirement — there is exactly one active weight set, never a history table, because the audit log already is the history.

Create `apps/api/src/settings/risk-weights.entity.ts`:

```typescript
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
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/settings/settings.service.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { RISK_WEIGHTS } from '@aman/shared';
import { SettingsService } from './settings.service';

function build(row: any = null) {
  const saved: any[] = [];
  const audit = { record: jest.fn(async () => undefined) };
  const repo = {
    findOne: jest.fn(async () => row),
    save: jest.fn(async (r: any) => {
      saved.push(r);
      return r;
    }),
  };
  return { service: new SettingsService(repo as any, audit as any), saved, audit, repo };
}

describe('SettingsService.getWeights', () => {
  it('falls back to the spec §6.2 defaults when nothing has ever been saved', async () => {
    const { service } = build(null);
    const weights = await service.getWeights();
    expect(weights).toEqual(RISK_WEIGHTS);
  });

  it('returns the saved row once one exists', async () => {
    const { service } = build({
      priorViolations: 50,
      complaintPressure: 20,
      timeSinceInspection: 20,
      category: 10,
    });
    const weights = await service.getWeights();
    expect(weights.PRIOR_VIOLATIONS).toBe(50);
    expect(weights.COMPLAINT_PRESSURE).toBe(20);
  });
});

describe('SettingsService.updateWeights', () => {
  const valid = {
    PRIOR_VIOLATIONS: 50,
    COMPLAINT_PRESSURE: 20,
    TIME_SINCE_INSPECTION: 20,
    CATEGORY: 10,
  };

  it('rejects weights that do not sum to 100', async () => {
    const { service } = build();
    await expect(
      service.updateWeights({ ...valid, CATEGORY: 5 }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists a valid set and records who changed it', async () => {
    const { service, saved } = build();
    await service.updateWeights(valid, 'admin-1');
    expect(saved[0]).toMatchObject({
      id: 'current',
      priorViolations: 50,
      complaintPressure: 20,
      timeSinceInspection: 20,
      category: 10,
      updatedBy: 'admin-1',
    });
  });

  it('writes the change to the audit log — no silent tuning of the formula (§5.10)', async () => {
    const { service, audit } = build();
    await service.updateWeights(valid, 'admin-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_WEIGHTS_CHANGED',
        actorId: 'admin-1',
        after: valid,
      }),
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd apps/api && npx jest src/settings
```

Expected: FAIL — `Cannot find module './settings.service'`.

- [ ] **Step 4: Write the service**

Create `apps/api/src/settings/settings.service.ts`:

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RISK_WEIGHTS, type RiskWeights } from '@aman/shared';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-log.entity';
import { RiskWeightsRow } from './risk-weights.entity';

const ROW_ID = 'current';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(RiskWeightsRow) private rows: Repository<RiskWeightsRow>,
    private audit: AuditService,
  ) {}

  async getWeights(): Promise<RiskWeights> {
    const row = await this.rows.findOne({ where: { id: ROW_ID } });
    if (!row) return RISK_WEIGHTS;
    return {
      PRIOR_VIOLATIONS: row.priorViolations,
      COMPLAINT_PRESSURE: row.complaintPressure,
      TIME_SINCE_INSPECTION: row.timeSinceInspection,
      CATEGORY: row.category,
    };
  }

  /** Spec §5.10: must sum to 100, and every change is logged with who and
   *  when. Silent tuning of the formula would destroy the system's
   *  credibility — the whole point of a stated formula is that it can be
   *  checked, including checking who last touched it. */
  async updateWeights(weights: RiskWeights, actorId: string): Promise<RiskWeights> {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.round(sum) !== 100) {
      throw new BadRequestException(`مجموع الأوزان يجب أن يساوي 100، والمجموع الحالي ${sum}.`);
    }

    const before = await this.getWeights();

    await this.rows.save({
      id: ROW_ID,
      priorViolations: weights.PRIOR_VIOLATIONS,
      complaintPressure: weights.COMPLAINT_PRESSURE,
      timeSinceInspection: weights.TIME_SINCE_INSPECTION,
      category: weights.CATEGORY,
      updatedAt: new Date(),
      updatedBy: actorId,
    });

    await this.audit.record({
      actorId,
      action: AUDIT_ACTIONS.RISK_WEIGHTS_CHANGED,
      entityType: 'risk_weights',
      entityId: ROW_ID,
      before,
      after: weights,
    });

    return weights;
  }
}
```

- [ ] **Step 5: Create the module**

Create `apps/api/src/settings/settings.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskWeightsRow } from './risk-weights.entity';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([RiskWeightsRow])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

- [ ] **Step 6: Wire live weights into the risk engine**

In `apps/api/src/risk/risk.service.ts`, add the import and constructor parameter:

```typescript
import { SettingsService } from '../settings/settings.service';
```

```typescript
    @InjectRepository(RiskSnapshot) private snapshots: Repository<RiskSnapshot>,
    private settings: SettingsService,
  ) {}
```

In `recalculate`, change the `calculateRisk` call from the two-argument default to pass live weights:

```typescript
    const weights = await this.settings.getWeights();
    const breakdown = calculateRisk(
      {
        category: establishment.category as EstablishmentCategory,
        lastInspectionAt: establishment.lastInspectionAt,
        violations: violations.map((v) => ({
          severity: v.severity,
          occurredAt: v.occurredAt ?? v.deadlineAt ?? new Date(),
        })),
        complaints: complaints.map((c) => ({
          category: c.category,
          documented: c.hasEvidence,
          submittedAt: c.createdAt,
        })),
      },
      weights,
    );
```

In `apps/api/src/risk/risk.module.ts`, import `SettingsModule`:

```typescript
import { SettingsModule } from '../settings/settings.module';
```

```typescript
@Module({
  imports: [SettingsModule, TypeOrmModule.forFeature([Establishment, Violation, Complaint, RiskSnapshot])],
```

- [ ] **Step 7: Update the existing risk.service.spec.ts constructor call**

`RiskService` now takes a fifth constructor argument. In `apps/api/src/risk/risk.service.spec.ts`, in the `build()` helper, add a settings stub to the `new RiskService(...)` call:

```typescript
  const service = new RiskService(
    establishmentsRepo as any,
    violationsRepo as any,
    complaintsRepo as any,
    snapshotsRepo as any,
    { getWeights: jest.fn(async () => require('@aman/shared').RISK_WEIGHTS) } as any,
  );
```

- [ ] **Step 8: Add the admin settings endpoints**

In `apps/api/src/admin/admin.dto.ts`, add:

```typescript
import type { RiskWeights } from '@aman/shared';

export interface RiskWeightsDto {
  weights: RiskWeights;
  updatedAt: string | null;
  updatedByLabel: string;
}
```

In `apps/api/src/admin/admin.service.ts`, add `SettingsService` to the constructor and two pass-through methods:

```typescript
import { SettingsService } from '../settings/settings.service';
```

```typescript
    private risk: RiskService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}
```

```typescript
  async getRiskWeights(): Promise<RiskWeightsDto> {
    const weights = await this.settings.getWeights();
    return { weights, updatedAt: null, updatedByLabel: 'admin@nablus.ps' };
  }

  async updateRiskWeights(weights: RiskWeightsDto['weights'], actorId: string): Promise<RiskWeightsDto> {
    const saved = await this.settings.updateWeights(weights, actorId);
    return { weights: saved, updatedAt: new Date().toISOString(), updatedByLabel: actorId };
  }
```

In `apps/api/src/admin/admin.controller.ts`, add:

```typescript
import type { RiskWeights } from '@aman/shared';
```

```typescript
  @Get('settings/risk-weights')
  getWeights(): Promise<RiskWeightsDto> {
    return this.admin.getRiskWeights();
  }

  @Patch('settings/risk-weights')
  updateWeights(@Body() weights: RiskWeights, @Req() req: AuthedRequest): Promise<RiskWeightsDto> {
    return this.admin.updateRiskWeights(weights, req.user!.sub);
  }
```

Add `RiskWeightsDto` to the import from `./admin.dto`.

- [ ] **Step 9: Wire the modules**

In `apps/api/src/admin/admin.module.ts`, import `SettingsModule`:

```typescript
import { SettingsModule } from '../settings/settings.module';
```

```typescript
  imports: [RiskModule, SettingsModule, TypeOrmModule.forFeature([Complaint, Establishment, User])],
```

In `apps/api/src/app.module.ts`, add `SettingsModule` to the imports array (anywhere before `RiskModule` is fine, since `RiskModule` now depends on it — Nest resolves this by module graph, not array order, but keep it readable).

Update `apps/api/src/admin/admin.service.spec.ts`'s `build()` helper: `AdminService`'s constructor now takes a sixth argument. Add `{ getWeights: jest.fn(async () => require('@aman/shared').RISK_WEIGHTS), updateWeights: jest.fn(async (w: any) => w) } as any` after the `audit` argument.

- [ ] **Step 10: Run all tests**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && npm test
```

Expected: PASS. Fix any constructor-arity mismatches the compiler flags — `RiskService` and `AdminService` both grew a parameter this task.

- [ ] **Step 11: Verify against a live database**

```bash
npm run seed && npm run dev:api
```

```bash
ADMIN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@nablus.ps","password":"aman1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")

curl -s http://localhost:3000/api/admin/settings/risk-weights -H "Authorization: Bearer $ADMIN"
# Expect the §6.2 defaults: 40/30/20/10

curl -s -X PATCH http://localhost:3000/api/admin/settings/risk-weights -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"PRIOR_VIOLATIONS":50,"COMPLAINT_PRESSURE":20,"TIME_SINCE_INSPECTION":20,"CATEGORY":10}'

curl -s -X PATCH http://localhost:3000/api/admin/settings/risk-weights -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"PRIOR_VIOLATIONS":50,"COMPLAINT_PRESSURE":30,"TIME_SINCE_INSPECTION":20,"CATEGORY":10}'
# Sum is 110 — expect 400
```

Expected: defaults returned first, the valid update succeeds, the invalid one 400s. Then confirm the new weights actually feed the queue:

```bash
curl -s http://localhost:3000/api/inspector/queue -H "Authorization: Bearer $ADMIN" | node -pe "
JSON.parse(require('fs').readFileSync(0))[0].factors.find(f=>f.key==='PRIOR_VIOLATIONS').weight"
# Expect 50, not the default 40
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/settings apps/api/src/risk apps/api/src/admin apps/api/src/app.module.ts
git commit -m "feat: adjustable risk weights, persisted and audited (spec 5.10)"
```

---

## Task 3: Risk-weights settings — frontend

**Files:**
- Create: `apps/web/src/app/admin/settings.component.ts`
- Create: `apps/web/src/app/admin/settings.component.spec.ts`
- Modify: `apps/web/src/app/admin/admin.service.ts`
- Modify: `apps/web/src/app/admin/admin-shell.component.ts`
- Modify: `apps/web/src/app/core/strings.ts`
- Modify: `apps/web/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `GET/PATCH /api/admin/settings/risk-weights` (Task 2).
- Produces: route `/admin/settings`.

---

- [ ] **Step 1: Add the copy**

In `apps/web/src/app/core/strings.ts`, extend the existing `admin` block (add `navSettings` alongside `navComplaints`/`navPlanning`, and a new `settings` sub-object):

```typescript
    navSettings: 'الإعدادات',
```

```typescript
    settings: {
      title: 'أوزان الأولوية',
      lede: 'الأوزان الأربعة يجب أن يجمعوا إلى 100. كل تغيير يُسجَّل في سجل التدقيق.',
      priorViolations: 'المخالفات السابقة',
      complaintPressure: 'ضغط الشكاوى',
      timeSinceInspection: 'المدة منذ آخر تفتيش',
      category: 'خطورة النشاط',
      sum: 'المجموع',
      sumWarning: 'المجموع يجب أن يساوي 100.',
      save: 'حفظ',
      saving: 'جارٍ الحفظ…',
      saved: 'تم الحفظ.',
      failed: 'تعذّر الحفظ.',
      loadFailed: 'تعذّر تحميل الأوزان.',
    },
```

- [ ] **Step 2: Extend the admin API client**

In `apps/web/src/app/admin/admin.service.ts`, add:

```typescript
export interface RiskWeightsPayload {
  PRIOR_VIOLATIONS: number;
  COMPLAINT_PRESSURE: number;
  TIME_SINCE_INSPECTION: number;
  CATEGORY: number;
}

export interface RiskWeightsResponse {
  weights: RiskWeightsPayload;
  updatedAt: string | null;
  updatedByLabel: string;
}
```

```typescript
  getRiskWeights(): Promise<RiskWeightsResponse> {
    return firstValueFrom(
      this.http.get<RiskWeightsResponse>(`${API_BASE}/api/admin/settings/risk-weights`, this.options),
    );
  }

  updateRiskWeights(weights: RiskWeightsPayload): Promise<RiskWeightsResponse> {
    return firstValueFrom(
      this.http.patch<RiskWeightsResponse>(
        `${API_BASE}/api/admin/settings/risk-weights`,
        weights,
        this.options,
      ),
    );
  }
```

- [ ] **Step 3: Write the failing component test**

Create `apps/web/src/app/admin/settings.component.spec.ts`:

```typescript
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
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './settings.component'`.

- [ ] **Step 5: Write the component**

Create `apps/web/src/app/admin/settings.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminService, type RiskWeightsPayload } from './admin.service';
import { T } from '../core/strings';

/**
 * Spec §5.10: the four §6.2 weights, adjustable and audited. The live sum is
 * the whole UX — an admin should never be able to submit an invalid formula,
 * so Save is disabled rather than erroring after the fact.
 */
@Component({
  selector: 'app-admin-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <h1 class="page__title">{{ t.admin.settings.title }}</h1>
      <p class="page__lede">{{ t.admin.settings.lede }}</p>

      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      }
      @if (saved()) {
        <p class="ok">{{ t.admin.settings.saved }}</p>
      }

      <form class="form" (submit)="onSubmit($event)">
        <div class="field">
          <label for="pv">{{ t.admin.settings.priorViolations }}</label>
          <input
            id="pv"
            type="number"
            dir="ltr"
            [value]="priorViolations()"
            (input)="priorViolations.set(+$any($event.target).value)"
          />
        </div>
        <div class="field">
          <label for="cp">{{ t.admin.settings.complaintPressure }}</label>
          <input
            id="cp"
            type="number"
            dir="ltr"
            [value]="complaintPressure()"
            (input)="complaintPressure.set(+$any($event.target).value)"
          />
        </div>
        <div class="field">
          <label for="ts">{{ t.admin.settings.timeSinceInspection }}</label>
          <input
            id="ts"
            type="number"
            dir="ltr"
            [value]="timeSinceInspection()"
            (input)="timeSinceInspection.set(+$any($event.target).value)"
          />
        </div>
        <div class="field">
          <label for="cat">{{ t.admin.settings.category }}</label>
          <input
            id="cat"
            type="number"
            dir="ltr"
            [value]="category()"
            (input)="category.set(+$any($event.target).value)"
          />
        </div>

        <p class="sum" [class.sum--bad]="!canSave()">
          {{ t.admin.settings.sum }}: <span class="ltr">{{ sum() }}</span> / 100
          @if (!canSave()) {
            — {{ t.admin.settings.sumWarning }}
          }
        </p>

        <button class="btn" type="submit" [disabled]="!canSave() || busy()">
          {{ busy() ? t.admin.settings.saving : t.admin.settings.save }}
        </button>
      </form>
    </main>
  `,
  styles: [
    `
      .page {
        max-inline-size: 480px;
        margin-inline: auto;
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }
      .page__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }
      .page__lede {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }
      .form {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
      .sum {
        font-size: var(--text-caption);
        font-weight: 700;
        color: var(--ok);
      }
      .sum--bad {
        color: var(--danger);
      }
      .ok {
        color: var(--ok);
        font-size: 13px;
      }
    `,
  ],
})
export class AdminSettingsComponent {
  readonly t = T;
  private admin = inject(AdminService);

  readonly priorViolations = signal(0);
  readonly complaintPressure = signal(0);
  readonly timeSinceInspection = signal(0);
  readonly category = signal(0);

  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  readonly sum = computed(
    () => this.priorViolations() + this.complaintPressure() + this.timeSinceInspection() + this.category(),
  );
  readonly canSave = computed(() => this.sum() === 100);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const { weights } = await this.admin.getRiskWeights();
      this.priorViolations.set(weights.PRIOR_VIOLATIONS);
      this.complaintPressure.set(weights.COMPLAINT_PRESSURE);
      this.timeSinceInspection.set(weights.TIME_SINCE_INSPECTION);
      this.category.set(weights.CATEGORY);
    } catch {
      this.error.set(T.admin.settings.loadFailed);
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const payload: RiskWeightsPayload = {
        PRIOR_VIOLATIONS: this.priorViolations(),
        COMPLAINT_PRESSURE: this.complaintPressure(),
        TIME_SINCE_INSPECTION: this.timeSinceInspection(),
        CATEGORY: this.category(),
      };
      await this.admin.updateRiskWeights(payload);
      this.saved.set(true);
    } catch {
      this.error.set(T.admin.settings.failed);
    } finally {
      this.busy.set(false);
    }
  }
}
```

- [ ] **Step 6: Run the test**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 7: Wire the route and nav link**

In `apps/web/src/app/app.routes.ts`, add to the admin children:

```typescript
      { path: 'settings', component: AdminSettingsComponent },
```

with `import { AdminSettingsComponent } from './admin/settings.component';`.

In `apps/web/src/app/admin/admin-shell.component.ts`, add a nav link after planning:

```typescript
          <a routerLink="/admin/settings" routerLinkActive="on">{{ t.admin.navSettings }}</a>
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/admin/settings.component.ts apps/web/src/app/admin/settings.component.spec.ts \
  apps/web/src/app/admin/admin.service.ts apps/web/src/app/admin/admin-shell.component.ts \
  apps/web/src/app/core/strings.ts apps/web/src/app/app.routes.ts
git commit -m "feat: risk-weights settings screen"
```

---

## Task 4: Admin dashboard — backend

**Files:**
- Modify: `apps/api/src/admin/admin.dto.ts`
- Modify: `apps/api/src/admin/admin.service.ts`
- Modify: `apps/api/src/admin/admin.service.spec.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`

**Interfaces:**
- Consumes: `Establishment`, `Complaint`, `Violation` repositories already injected into `AdminService`.
- Produces: `AdminService.dashboard(): Promise<DashboardDto>`, `GET /api/admin/dashboard`.

---

- [ ] **Step 1: Add the DTO**

In `apps/api/src/admin/admin.dto.ts`, add:

```typescript
export interface DashboardKpisDto {
  registeredCount: number;
  highRiskCount: number;
  complaintsThisMonth: number;
  avgCloseDays: number | null;
}

export interface GradeDistributionDto {
  grade: 'A' | 'B' | 'C' | 'D';
  count: number;
}

export interface ComplaintsOverTimeDto {
  /** ISO date of the Monday that starts the week. */
  weekStart: string;
  count: number;
}

export interface NeedsAttentionDto {
  staleComplaints: number;
  overdueViolations: number;
  uninspectedEstablishments: number;
}

export interface DashboardDto {
  kpis: DashboardKpisDto;
  gradeDistribution: GradeDistributionDto[];
  complaintsOverTime: ComplaintsOverTimeDto[];
  needsAttention: NeedsAttentionDto;
}
```

- [ ] **Step 2: Write the failing test**

Add to `apps/api/src/admin/admin.service.spec.ts` (append; it already has a working `build()` helper from Task 2's Step 9 update — extend the mocked repositories in that helper to support `.find` calls the dashboard needs, which they already do generically):

```typescript
describe('AdminService.dashboard', () => {
  const NOW = new Date('2026-08-20T12:00:00Z');

  function establishment(over: Record<string, unknown> = {}) {
    return {
      id: 'est-x',
      currentGrade: 'A',
      currentRiskScore: 10,
      lastInspectionAt: new Date('2026-08-01T00:00:00Z'),
      status: 'ACTIVE',
      ...over,
    };
  }

  function complaintRow(over: Record<string, unknown> = {}) {
    return {
      id: 'c-x',
      status: 'SUBMITTED',
      createdAt: new Date('2026-08-15T00:00:00Z'),
      updatedAt: new Date('2026-08-15T00:00:00Z'),
      ...over,
    };
  }

  it('counts high-risk establishments at 70 and above (§5.4 band)', async () => {
    const { service } = build([complaintRow()]);
    (service as any).establishments.find = jest.fn(async () => [
      establishment({ id: 'a', currentRiskScore: 70 }),
      establishment({ id: 'b', currentRiskScore: 69 }),
    ]);
    (service as any).violations = { find: jest.fn(async () => []) };

    const result = await service.dashboard();

    expect(result.kpis.registeredCount).toBe(2);
    expect(result.kpis.highRiskCount).toBe(1);
  });

  it('counts complaints created in the current calendar month', async () => {
    const { service } = build([
      complaintRow({ id: 'in-month', createdAt: new Date('2026-08-05T00:00:00Z') }),
      complaintRow({ id: 'out-of-month', createdAt: new Date('2026-07-05T00:00:00Z') }),
    ]);
    (service as any).establishments.find = jest.fn(async () => []);
    (service as any).violations = { find: jest.fn(async () => []) };
    jest.useFakeTimers().setSystemTime(NOW);

    const result = await service.dashboard();

    expect(result.kpis.complaintsThisMonth).toBe(1);
    jest.useRealTimers();
  });

  it('flags establishments not inspected in 90+ days, including never-inspected ones', async () => {
    const { service } = build([]);
    (service as any).establishments.find = jest.fn(async () => [
      establishment({ id: 'stale', lastInspectionAt: new Date('2026-01-01T00:00:00Z') }),
      establishment({ id: 'never', lastInspectionAt: null }),
      establishment({ id: 'fresh', lastInspectionAt: new Date('2026-08-10T00:00:00Z') }),
    ]);
    (service as any).violations = { find: jest.fn(async () => []) };
    jest.useFakeTimers().setSystemTime(NOW);

    const result = await service.dashboard();

    expect(result.needsAttention.uninspectedEstablishments).toBe(2);
    jest.useRealTimers();
  });

  it('flags violations past their deadline that are still not verified or closed', async () => {
    const { service } = build([]);
    (service as any).establishments.find = jest.fn(async () => []);
    (service as any).violations = {
      find: jest.fn(async () => [
        { id: 'v1', status: 'OPEN', deadlineAt: new Date('2026-08-01T00:00:00Z') },
        { id: 'v2', status: 'VERIFIED', deadlineAt: new Date('2026-08-01T00:00:00Z') },
        { id: 'v3', status: 'OPEN', deadlineAt: new Date('2026-09-01T00:00:00Z') },
      ]),
    };
    jest.useFakeTimers().setSystemTime(NOW);

    const result = await service.dashboard();

    expect(result.needsAttention.overdueViolations).toBe(1);
    jest.useRealTimers();
  });

  it('flags complaints open longer than 7 days that are not yet settled', async () => {
    const { service } = build([
      complaintRow({ id: 'stale', status: 'SUBMITTED', createdAt: new Date('2026-08-01T00:00:00Z') }),
      complaintRow({ id: 'settled', status: 'CLOSED', createdAt: new Date('2026-08-01T00:00:00Z') }),
      complaintRow({ id: 'fresh', status: 'SUBMITTED', createdAt: new Date('2026-08-19T00:00:00Z') }),
    ]);
    (service as any).establishments.find = jest.fn(async () => []);
    (service as any).violations = { find: jest.fn(async () => []) };
    jest.useFakeTimers().setSystemTime(NOW);

    const result = await service.dashboard();

    expect(result.needsAttention.staleComplaints).toBe(1);
    jest.useRealTimers();
  });

  it('groups grade distribution across A/B/C/D, ignoring never-inspected establishments', async () => {
    const { service } = build([]);
    (service as any).establishments.find = jest.fn(async () => [
      establishment({ id: 'a1', currentGrade: 'A' }),
      establishment({ id: 'a2', currentGrade: 'A' }),
      establishment({ id: 'b1', currentGrade: 'B' }),
      establishment({ id: 'none', currentGrade: null }),
    ]);
    (service as any).violations = { find: jest.fn(async () => []) };

    const result = await service.dashboard();
    const byGrade = Object.fromEntries(result.gradeDistribution.map((g) => [g.grade, g.count]));

    expect(byGrade['A']).toBe(2);
    expect(byGrade['B']).toBe(1);
    expect(byGrade['C']).toBe(0);
    expect(byGrade['D']).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd apps/api && npx jest src/admin
```

Expected: FAIL — `service.dashboard is not a function`.

- [ ] **Step 4: Implement it**

In `apps/api/src/admin/admin.service.ts`, add:

```typescript
import type {
  AdminComplaintDto,
  ComplaintFilter,
  DashboardDto,
  InspectorOptionDto,
  PlanningRowDto,
  RiskWeightsDto,
} from './admin.dto';

const HIGH_RISK_THRESHOLD = 70;
const STALE_COMPLAINT_DAYS = 7;
const UNINSPECTED_DAYS = 90;
const CHART_WEEKS = 10;
const SETTLED_STATUSES = ['CLOSED', 'DUPLICATE', 'REJECTED'];
```

```typescript
  /** Spec §5.8: numbers first, then "what is falling through the cracks" —
   *  the needs-attention block is the one an admin actually opens the
   *  dashboard for daily, so every figure here is a real query, not a mock. */
  async dashboard(): Promise<DashboardDto> {
    const establishments = await this.establishments.find({ where: { status: 'ACTIVE' } });
    const complaints = await this.complaints.find();
    const violations = await this.violationsRepo.find();
    const now = Date.now();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const gradeCounts: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const e of establishments) {
      if (e.currentGrade) gradeCounts[e.currentGrade as 'A' | 'B' | 'C' | 'D']++;
    }

    const weeks: { weekStart: string; count: number }[] = [];
    for (let i = CHART_WEEKS - 1; i >= 0; i--) {
      const end = now - i * 7 * 86_400_000;
      const start = end - 7 * 86_400_000;
      const count = complaints.filter(
        (c) => c.createdAt.getTime() >= start && c.createdAt.getTime() < end,
      ).length;
      weeks.push({ weekStart: new Date(start).toISOString().slice(0, 10), count });
    }

    const closed = complaints.filter((c) => SETTLED_STATUSES.includes(c.status) || c.status === 'CLOSED');
    const closeDurations = closed.map((c) => (c.updatedAt.getTime() - c.createdAt.getTime()) / 86_400_000);
    const avgCloseDays =
      closeDurations.length === 0
        ? null
        : Math.round((closeDurations.reduce((a, b) => a + b, 0) / closeDurations.length) * 10) / 10;

    return {
      kpis: {
        registeredCount: establishments.length,
        highRiskCount: establishments.filter((e) => e.currentRiskScore >= HIGH_RISK_THRESHOLD).length,
        complaintsThisMonth: complaints.filter((c) => c.createdAt.getTime() >= monthStart.getTime()).length,
        avgCloseDays,
      },
      gradeDistribution: (['A', 'B', 'C', 'D'] as const).map((grade) => ({
        grade,
        count: gradeCounts[grade],
      })),
      complaintsOverTime: weeks,
      needsAttention: {
        staleComplaints: complaints.filter(
          (c) =>
            !SETTLED_STATUSES.includes(c.status) &&
            now - c.createdAt.getTime() > STALE_COMPLAINT_DAYS * 86_400_000,
        ).length,
        overdueViolations: violations.filter(
          (v: any) =>
            v.status !== 'VERIFIED' &&
            v.status !== 'CLOSED' &&
            v.deadlineAt &&
            v.deadlineAt.getTime() < now,
        ).length,
        uninspectedEstablishments: establishments.filter(
          (e) =>
            !e.lastInspectionAt || now - e.lastInspectionAt.getTime() > UNINSPECTED_DAYS * 86_400_000,
        ).length,
      },
    };
  }
```

This needs a `Violation` repository the constructor does not currently inject. Add it:

```typescript
import { Violation } from '../establishments/violation.entity';
```

```typescript
  constructor(
    @InjectRepository(Complaint) private complaints: Repository<Complaint>,
    @InjectRepository(Establishment) private establishments: Repository<Establishment>,
    @InjectRepository(Violation) private violationsRepo: Repository<Violation>,
    @InjectRepository(User) private users: Repository<User>,
    private risk: RiskService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}
```

Register `Violation` in `apps/api/src/admin/admin.module.ts`'s `TypeOrmModule.forFeature([...])` array.

- [ ] **Step 5: Add the controller route**

In `apps/api/src/admin/admin.controller.ts`, add `DashboardDto` to the type import and:

```typescript
  @Get('dashboard')
  dashboard(): Promise<DashboardDto> {
    return this.admin.dashboard();
  }
```

- [ ] **Step 6: Update the spec's build() helper for the new constructor arity**

In `apps/api/src/admin/admin.service.spec.ts`, the `build()` helper's `new AdminService(...)` call needs a `violations` repo before `users`. Update it to:

```typescript
  const service = new AdminService(
    { find: jest.fn(async () => rows) } as any,
    { find: jest.fn(async () => [/* existing establishment mock */]) } as any,
    { find: jest.fn(async () => []) } as any,
    { find: jest.fn(async () => [{ id: 'insp-1', displayNameAr: 'سامي', role: 'INSPECTOR' }]), findOne: jest.fn(async () => ({ id: 'insp-1', role: 'INSPECTOR' })) } as any,
    risk as any,
    audit as any,
    { getWeights: jest.fn(async () => require('@aman/shared').RISK_WEIGHTS), updateWeights: jest.fn(async (w: any) => w) } as any,
  );
```

Keep the existing establishment array literal from Task 2's version of this file — only the argument position changes (a bare `violations` repo is inserted before `users`).

- [ ] **Step 7: Run all API tests and typecheck**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && npm test
```

Expected: PASS.

- [ ] **Step 8: Verify against a live database**

```bash
npm run seed && npm run dev:api
```

```bash
ADMIN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@nablus.ps","password":"aman1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
curl -s http://localhost:3000/api/admin/dashboard -H "Authorization: Bearer $ADMIN" | node -pe "JSON.stringify(JSON.parse(require('fs').readFileSync(0)),null,1)"
```

Expected: real counts from the seeded data — `registeredCount: 4`, a non-empty `complaintsOverTime` array of 10 weeks, and `needsAttention` reflecting the seeded الفرن الذهبي complaint cluster.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat: admin dashboard KPIs, grade distribution, complaints-over-time, needs-attention"
```

---

## Task 5: Admin dashboard — frontend, with a reusable SVG bar chart

Spec §5.8 wants two charts. Rather than a charting dependency for two small bar charts (grade distribution: 4 bars; complaints over time: 10 bars), a ~40-line SVG component is less code and less bundle than any library would be.

**Files:**
- Create: `apps/web/src/app/ui/bar-chart.component.ts`
- Create: `apps/web/src/app/admin/dashboard.component.ts`
- Create: `apps/web/src/app/admin/dashboard.component.spec.ts`
- Modify: `apps/web/src/app/admin/admin.service.ts`
- Modify: `apps/web/src/app/admin/admin-shell.component.ts`
- Modify: `apps/web/src/app/core/strings.ts`
- Modify: `apps/web/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `GET /api/admin/dashboard` (Task 4).
- Produces: route `/admin` (the shell's default child, replacing the redirect to `complaints`), `BarChartComponent` (`bars` input: `{ label: string; value: number }[]`).

---

- [ ] **Step 1: Build the reusable bar chart**

Create `apps/web/src/app/ui/bar-chart.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarDatum {
  label: string;
  value: number;
  /** Optional CSS colour; defaults to the primary token. */
  color?: string;
}

/**
 * Spec §10.1: charts mirror in RTL — axis on the right, bars growing
 * leftward. This is one <svg>, drawn right-to-left in its own coordinate
 * space rather than relying on the page's `dir` attribute, so it is correct
 * regardless of what wraps it.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" [attr.height]="height" role="img">
      @for (bar of positioned(); track bar.label) {
        <text [attr.x]="width - 4" [attr.y]="bar.y + rowHeight / 2 - 4" class="label" text-anchor="end">
          {{ bar.label }}
        </text>
        <rect
          [attr.x]="width - barMax - bar.barWidth"
          [attr.y]="bar.y + rowHeight / 2"
          [attr.width]="bar.barWidth"
          [attr.height]="8"
          [attr.fill]="bar.color"
          rx="2"
        />
        <text [attr.x]="width - barMax - bar.barWidth - 6" [attr.y]="bar.y + rowHeight / 2 + 8" class="value ltr" text-anchor="end">
          {{ bar.value }}
        </text>
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      svg {
        inline-size: 100%;
      }
      .label {
        font-size: 12px;
        fill: var(--ink-2);
      }
      .value {
        font-size: 11px;
        fill: var(--ink-muted);
        font-family: var(--font-data);
      }
    `,
  ],
})
export class BarChartComponent {
  readonly bars = input.required<BarDatum[]>();

  readonly width = 320;
  readonly rowHeight = 28;
  readonly barMax = 160;

  readonly height = computed(() => this.bars().length * this.rowHeight + 8);

  readonly positioned = computed(() => {
    const max = Math.max(1, ...this.bars().map((b) => b.value));
    return this.bars().map((bar, i) => ({
      ...bar,
      y: i * this.rowHeight,
      barWidth: (bar.value / max) * this.barMax,
      color: bar.color ?? 'var(--primary)',
    }));
  });
}
```

- [ ] **Step 2: Extend the admin API client**

In `apps/web/src/app/admin/admin.service.ts`, add:

```typescript
export interface DashboardData {
  kpis: {
    registeredCount: number;
    highRiskCount: number;
    complaintsThisMonth: number;
    avgCloseDays: number | null;
  };
  gradeDistribution: { grade: string; count: number }[];
  complaintsOverTime: { weekStart: string; count: number }[];
  needsAttention: {
    staleComplaints: number;
    overdueViolations: number;
    uninspectedEstablishments: number;
  };
}
```

```typescript
  dashboard(): Promise<DashboardData> {
    return firstValueFrom(this.http.get<DashboardData>(`${API_BASE}/api/admin/dashboard`, this.options));
  }
```

- [ ] **Step 3: Add the copy**

In `apps/web/src/app/core/strings.ts`'s `admin` block, add a `dashboard` sub-object and a `navDashboard` line:

```typescript
    navDashboard: 'لوحة المعلومات',
```

```typescript
    dashboard: {
      title: 'لوحة المعلومات',
      registered: 'منشأة مسجّلة',
      highRisk: 'أولوية مرتفعة (٧٠+)',
      complaintsThisMonth: 'شكاوى هذا الشهر',
      avgCloseDays: 'متوسط أيام الإغلاق',
      noData: 'لا توجد بيانات كافية بعد.',
      gradeDistribution: 'توزيع الدرجات',
      complaintsOverTime: 'الشكاوى خلال آخر ١٠ أسابيع',
      needsAttention: 'يحتاج إلى متابعة',
      staleComplaints: 'شكوى مفتوحة أكثر من ٧ أيام',
      overdueViolations: 'مخالفة تجاوزت المهلة ولم يُتحقق منها',
      uninspectedEstablishments: 'منشأة لم تُفتَّش منذ ٩٠ يوماً أو أكثر',
      allClear: 'لا يوجد ما يستدعي المتابعة حالياً.',
      loadFailed: 'تعذّر تحميل لوحة المعلومات.',
    },
```

- [ ] **Step 4: Write the failing component test**

Create `apps/web/src/app/admin/dashboard.component.spec.ts`:

```typescript
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
    await fixture.whenStable();
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
});
```

- [ ] **Step 5: Run it to verify it fails**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './dashboard.component'`.

- [ ] **Step 6: Write the component**

Create `apps/web/src/app/admin/dashboard.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BarChartComponent, type BarDatum } from '../ui/bar-chart.component';
import { AdminService, type DashboardData } from './admin.service';
import { T } from '../core/strings';

const GRADE_COLOR: Record<string, string> = {
  A: 'var(--grade-a)',
  B: 'var(--grade-b)',
  C: 'var(--grade-c)',
  D: 'var(--grade-d)',
};

/**
 * Spec §5.8: "needs attention" is the most valuable block on this screen — a
 * dashboard that only reports numbers gets opened twice and abandoned. It is
 * rendered above the fold-equivalent, right under the KPI row.
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChartComponent],
  template: `
    <main class="page">
      <h1 class="page__title">{{ t.admin.dashboard.title }}</h1>

      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      } @else if (!data()) {
        <p class="muted">{{ t.common.loading }}</p>
      } @else if (data(); as d) {
        <div class="kpis">
          <div class="kpi">
            <span class="kpi__value ltr">{{ d.kpis.registeredCount }}</span>
            <span class="kpi__label">{{ t.admin.dashboard.registered }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__value ltr">{{ d.kpis.highRiskCount }}</span>
            <span class="kpi__label">{{ t.admin.dashboard.highRisk }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__value ltr">{{ d.kpis.complaintsThisMonth }}</span>
            <span class="kpi__label">{{ t.admin.dashboard.complaintsThisMonth }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__value ltr">{{ d.kpis.avgCloseDays ?? '—' }}</span>
            <span class="kpi__label">{{ t.admin.dashboard.avgCloseDays }}</span>
          </div>
        </div>

        <section class="attention">
          <h2 class="eyebrow">{{ t.admin.dashboard.needsAttention }}</h2>
          @if (hasAttentionItems()) {
            <ul class="attention__list">
              @if (d.needsAttention.staleComplaints > 0) {
                <li>
                  <span class="ltr">{{ d.needsAttention.staleComplaints }}</span>
                  {{ t.admin.dashboard.staleComplaints }}
                </li>
              }
              @if (d.needsAttention.overdueViolations > 0) {
                <li>
                  <span class="ltr">{{ d.needsAttention.overdueViolations }}</span>
                  {{ t.admin.dashboard.overdueViolations }}
                </li>
              }
              @if (d.needsAttention.uninspectedEstablishments > 0) {
                <li>
                  <span class="ltr">{{ d.needsAttention.uninspectedEstablishments }}</span>
                  {{ t.admin.dashboard.uninspectedEstablishments }}
                </li>
              }
            </ul>
          } @else {
            <p class="muted">{{ t.admin.dashboard.allClear }}</p>
          }
        </section>

        <div class="charts">
          <section class="chart">
            <h2 class="eyebrow">{{ t.admin.dashboard.gradeDistribution }}</h2>
            @if (gradeBars().length) {
              <app-bar-chart [bars]="gradeBars()" />
            } @else {
              <p class="muted">{{ t.admin.dashboard.noData }}</p>
            }
          </section>

          <section class="chart">
            <h2 class="eyebrow">{{ t.admin.dashboard.complaintsOverTime }}</h2>
            @if (weekBars().length) {
              <app-bar-chart [bars]="weekBars()" />
            } @else {
              <p class="muted">{{ t.admin.dashboard.noData }}</p>
            }
          </section>
        </div>
      }
    </main>
  `,
  styles: [
    `
      .page {
        max-inline-size: 1180px;
        margin-inline: auto;
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s5);
      }
      .page__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }
      .muted {
        color: var(--ink-muted);
        font-size: var(--text-caption);
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--s3);
      }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        padding: var(--s4);
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
      }
      .kpi__value {
        font-size: 32px;
        font-weight: 700;
        color: var(--ink);
      }
      .kpi__label {
        font-size: 12px;
        color: var(--ink-muted);
      }
      .attention {
        padding: var(--s4);
        background: var(--warn-bg);
        border-radius: var(--radius-lg);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }
      .attention__list {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        font-size: var(--text-caption);
        font-weight: 700;
        color: var(--ink-2);
      }
      .charts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--s4);
      }
      .chart {
        padding: var(--s4);
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
    `,
  ],
})
export class AdminDashboardComponent {
  readonly t = T;
  private admin = inject(AdminService);

  readonly data = signal<DashboardData | null>(null);
  readonly error = signal<string | null>(null);

  readonly hasAttentionItems = computed(() => {
    const n = this.data()?.needsAttention;
    return !!n && (n.staleComplaints > 0 || n.overdueViolations > 0 || n.uninspectedEstablishments > 0);
  });

  readonly gradeBars = computed<BarDatum[]>(
    () =>
      this.data()?.gradeDistribution.map((g) => ({
        label: g.grade,
        value: g.count,
        color: GRADE_COLOR[g.grade],
      })) ?? [],
  );

  readonly weekBars = computed<BarDatum[]>(
    () => this.data()?.complaintsOverTime.map((w) => ({ label: w.weekStart.slice(5), value: w.count })) ?? [],
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.data.set(await this.admin.dashboard());
    } catch {
      this.error.set(T.admin.dashboard.loadFailed);
    }
  }
}
```

- [ ] **Step 7: Run the test**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 8: Wire the route and make it the default admin screen**

In `apps/web/src/app/app.routes.ts`, change the admin children's default redirect and add the dashboard route:

```typescript
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'complaints', component: AdminComplaintsComponent },
```

with `import { AdminDashboardComponent } from './admin/dashboard.component';`. Also update `apps/web/src/app/inspector/login.component.ts`'s admin redirect from `/admin/complaints` to `/admin/dashboard`, and its own spec's assertion in Task 1.

In `apps/web/src/app/admin/admin-shell.component.ts`, add a nav link before `navComplaints`:

```typescript
          <a routerLink="/admin/dashboard" routerLinkActive="on">{{ t.admin.navDashboard }}</a>
```

- [ ] **Step 9: Update the Task 1 login redirect test**

In `apps/web/src/app/inspector/login.component.spec.ts`, change the admin test's expectation from `['/admin/complaints']` to `['/admin/dashboard']`.

- [ ] **Step 10: Run the whole web suite**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: PASS, all specs.

- [ ] **Step 11: Verify in a browser**

```bash
npm run dev:api    # terminal 1
npm run dev:web    # terminal 2
```

At 1280px, sign in as `admin@nablus.ps` / `aman1234`, confirm landing on `/admin/dashboard`, four KPI tiles with real numbers, a non-empty needs-attention list, and two bar charts with the axis on the right and bars growing left (RTL, §10.1). Console clean.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/app/ui/bar-chart.component.ts apps/web/src/app/admin/dashboard.component.ts \
  apps/web/src/app/admin/dashboard.component.spec.ts apps/web/src/app/admin/admin.service.ts \
  apps/web/src/app/admin/admin-shell.component.ts apps/web/src/app/core/strings.ts \
  apps/web/src/app/app.routes.ts apps/web/src/app/inspector/login.component.ts \
  apps/web/src/app/inspector/login.component.spec.ts
git commit -m "feat: admin dashboard with KPIs, needs-attention, and two RTL bar charts"
```

---

## Task 6: QR batch sheet

Spec §5.10 asks for "a printable PDF sheet." A generated PDF binary needs a new dependency (`pdfkit` or similar); a browser print stylesheet needs none — the browser's own Print → Save as PDF **is** the PDF step. That is the simplification this task makes, and it is the right one for a 4-week prototype: no dependency, and what prints is exactly what was reviewed on screen.

**Files:**
- Create: `apps/api/src/admin/qr.service.ts`
- Create: `apps/api/src/admin/qr.service.spec.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Create: `apps/web/src/app/admin/qr-sheet.component.ts`
- Create: `apps/web/src/app/admin/qr-sheet.component.spec.ts`
- Modify: `apps/web/src/app/admin/admin.service.ts`
- Modify: `apps/web/src/app/admin/admin-shell.component.ts`
- Modify: `apps/web/src/app/core/strings.ts`
- Modify: `apps/web/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `qrcode` npm package (already a dependency of `apps/api`, used by `scripts/generate-qr.ts`).
- Produces: `GET /api/admin/qr/batch` → `{ slug, nameAr, category, qrDataUrl, publicUrl }[]`; route `/admin/qr`.

---

- [ ] **Step 1: Write the failing backend test**

Create `apps/api/src/admin/qr.service.spec.ts`:

```typescript
import { QrService } from './qr.service';

function build(establishments: any[]) {
  const repo = { find: jest.fn(async () => establishments) };
  return new QrService(repo as any);
}

describe('QrService.batch', () => {
  it('returns one entry per active establishment with a data-URL QR code', async () => {
    const service = build([
      { slug: 'golden-oven-nablus', nameAr: 'الفرن الذهبي', category: 'BAKERY', status: 'ACTIVE' },
    ]);

    const [entry] = await service.batch('http://localhost:4200');

    expect(entry.slug).toBe('golden-oven-nablus');
    expect(entry.publicUrl).toBe('http://localhost:4200/e/golden-oven-nablus');
    // A PNG data URL, not a raw file path — the frontend renders it directly.
    expect(entry.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('encodes the public establishment URL, never a raw database id (§4)', async () => {
    const service = build([
      { slug: 'nour-bakery', nameAr: 'مخبز النور', category: 'BAKERY', status: 'ACTIVE' },
    ]);
    const [entry] = await service.batch('https://aman.ps');
    expect(entry.publicUrl).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // no uuid in the URL
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/api && npx jest src/admin/qr.service.spec.ts
```

Expected: FAIL — `Cannot find module './qr.service'`.

- [ ] **Step 3: Write the service**

Create `apps/api/src/admin/qr.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import QRCode from 'qrcode';
import { Establishment } from '../establishments/establishment.entity';

export interface QrBatchEntry {
  slug: string;
  nameAr: string;
  category: string;
  publicUrl: string;
  qrDataUrl: string;
}

@Injectable()
export class QrService {
  constructor(@InjectRepository(Establishment) private establishments: Repository<Establishment>) {}

  /**
   * Spec §5.10: name, QR code, municipality logo, and the short URL
   * underneath for anyone who cannot scan. The logo and print layout are the
   * frontend's job (a print stylesheet); this returns the two things that
   * cost a network round trip each — the encoded image and the URL text.
   */
  async batch(baseUrl: string): Promise<QrBatchEntry[]> {
    const rows = await this.establishments.find({ where: { status: 'ACTIVE' } });

    return Promise.all(
      rows.map(async (e) => {
        const publicUrl = `${baseUrl}/e/${e.slug}`;
        const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 300, margin: 1 });
        return { slug: e.slug, nameAr: e.nameAr, category: e.category, publicUrl, qrDataUrl };
      }),
    );
  }
}
```

- [ ] **Step 4: Wire the controller and module**

In `apps/api/src/admin/admin.controller.ts`, add:

```typescript
import { QrService } from './qr.service';
```

```typescript
  constructor(
    private readonly admin: AdminService,
    private readonly qr: QrService,
  ) {}
```

```typescript
  @Get('qr/batch')
  qrBatch(@Query('baseUrl') baseUrl?: string) {
    // The frontend origin, not the API's — the QR encodes a page for a
    // citizen's browser, and localhost:3000 would be meaningless to them.
    return this.qr.batch(baseUrl ?? 'http://localhost:4200');
  }
```

In `apps/api/src/admin/admin.module.ts`, add `QrService` to `providers`.

- [ ] **Step 5: Run the API tests**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && npm test
```

Expected: PASS.

- [ ] **Step 6: Add the web copy**

In `apps/web/src/app/core/strings.ts`'s `admin` block:

```typescript
    navQr: 'رموز الاستجابة',
```

```typescript
    qr: {
      title: 'ملصقات رموز الاستجابة',
      lede: 'ستة ملصقات في كل صفحة A4. استخدم طباعة المتصفح ثم "حفظ كملف PDF".',
      print: 'طباعة',
      loadFailed: 'تعذّر تحميل الرموز.',
      empty: 'لا توجد منشآت نشطة.',
    },
```

- [ ] **Step 7: Extend the admin API client**

In `apps/web/src/app/admin/admin.service.ts`, add:

```typescript
export interface QrEntry {
  slug: string;
  nameAr: string;
  category: string;
  publicUrl: string;
  qrDataUrl: string;
}
```

```typescript
  qrBatch(): Promise<QrEntry[]> {
    return firstValueFrom(
      this.http.get<QrEntry[]>(
        `${API_BASE}/api/admin/qr/batch?baseUrl=${encodeURIComponent(location.origin)}`,
        this.options,
      ),
    );
  }
```

- [ ] **Step 8: Write the failing component test**

Create `apps/web/src/app/admin/qr-sheet.component.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AdminQrSheetComponent } from './qr-sheet.component';
import { AdminService } from './admin.service';

const ENTRIES = [
  { slug: 'a', nameAr: 'أ', category: 'BAKERY', publicUrl: 'http://x/e/a', qrDataUrl: 'data:image/png;base64,x' },
  { slug: 'b', nameAr: 'ب', category: 'CAFE', publicUrl: 'http://x/e/b', qrDataUrl: 'data:image/png;base64,y' },
];

function build(qrBatch = vi.fn(async () => ENTRIES)) {
  TestBed.configureTestingModule({
    imports: [AdminQrSheetComponent],
    providers: [{ provide: AdminService, useValue: { qrBatch } }],
  });
  const fixture = TestBed.createComponent(AdminQrSheetComponent);
  fixture.detectChanges();
  return fixture;
}

describe('AdminQrSheetComponent', () => {
  it('loads every active establishment as a sticker entry', async () => {
    const fixture = build();
    await fixture.whenStable();
    expect(fixture.componentInstance.entries().length).toBe(2);
  });

  it('reports a load failure rather than an empty silent sheet', async () => {
    const fixture = build(vi.fn(async () => Promise.reject(new Error('x'))));
    await fixture.whenStable();
    expect(fixture.componentInstance.error()).toBeTruthy();
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: FAIL — `Cannot find module './qr-sheet.component'`.

- [ ] **Step 10: Write the component**

Create `apps/web/src/app/admin/qr-sheet.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AdminService, type QrEntry } from './admin.service';
import { T } from '../core/strings';

/**
 * Spec §5.10: A4, six stickers per page, name + QR + municipality name + the
 * short URL for anyone who cannot scan. `window.print()` and the browser's
 * own "Save as PDF" are the print pipeline — see Task 6's file header for why
 * that beats adding a PDF-generation dependency.
 */
@Component({
  selector: 'app-admin-qr-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="toolbar no-print">
      <h1 class="toolbar__title">{{ t.admin.qr.title }}</h1>
      <p class="toolbar__lede">{{ t.admin.qr.lede }}</p>
      <button type="button" class="btn" (click)="print()">{{ t.admin.qr.print }}</button>
      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      } @else if (entries().length === 0) {
        <p class="muted">{{ t.admin.qr.empty }}</p>
      }
    </main>

    <div class="sheet">
      @for (entry of entries(); track entry.slug) {
        <figure class="sticker">
          <img [src]="entry.qrDataUrl" [alt]="entry.nameAr" />
          <figcaption>
            <strong>{{ entry.nameAr }}</strong>
            <span class="ltr">{{ entry.publicUrl }}</span>
          </figcaption>
        </figure>
      }
    </div>
  `,
  styles: [
    `
      .toolbar {
        max-inline-size: 640px;
        margin-inline: auto;
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        align-items: flex-start;
      }
      .toolbar__title {
        font-size: var(--text-title);
        font-weight: 700;
        color: var(--ink);
      }
      .toolbar__lede {
        font-size: var(--text-caption);
        color: var(--ink-muted);
      }
      .muted {
        color: var(--ink-muted);
        font-size: var(--text-caption);
      }
      .sheet {
        max-inline-size: 210mm;
        margin-inline: auto;
        padding: 10mm;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8mm;
      }
      .sticker {
        margin: 0;
        padding: 6mm;
        border: 1px dashed var(--rule-strong);
        border-radius: var(--radius);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4mm;
        text-align: center;
        break-inside: avoid;
      }
      .sticker img {
        inline-size: 32mm;
        block-size: 32mm;
      }
      .sticker figcaption {
        display: flex;
        flex-direction: column;
        gap: 2mm;
        font-size: 11px;
      }
      /* Six per A4 page: three rows of two at this column count and image
         size, which is what the printed sheet is measured against. */
      @media print {
        .no-print {
          display: none;
        }
        .sheet {
          padding: 0;
        }
      }
    `,
  ],
})
export class AdminQrSheetComponent {
  readonly t = T;
  private admin = inject(AdminService);

  readonly entries = signal<QrEntry[]>([]);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.entries.set(await this.admin.qrBatch());
    } catch {
      this.error.set(T.admin.qr.loadFailed);
    }
  }

  print(): void {
    window.print();
  }
}
```

- [ ] **Step 11: Run the test**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 12: Wire the route and nav link**

In `apps/web/src/app/app.routes.ts`, add `{ path: 'qr', component: AdminQrSheetComponent }` to the admin children and its import. In `admin-shell.component.ts`, add a nav link.

- [ ] **Step 13: Verify in a browser**

```bash
npm run seed && npm run dev:api    # terminal 1
npm run dev:web                    # terminal 2
```

At `/admin/qr`, confirm real QR images render (not broken-image icons — they are `data:` URLs, so this is a genuine render, not a placeholder), scan one with a phone and confirm it opens the right `/e/:slug` page, then use the browser's print preview and confirm the toolbar disappears and stickers lay out two-wide.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/admin/qr.service.ts apps/api/src/admin/qr.service.spec.ts \
  apps/api/src/admin/admin.controller.ts apps/api/src/admin/admin.module.ts \
  apps/web/src/app/admin/qr-sheet.component.ts apps/web/src/app/admin/qr-sheet.component.spec.ts \
  apps/web/src/app/admin/admin.service.ts apps/web/src/app/admin/admin-shell.component.ts \
  apps/web/src/app/core/strings.ts apps/web/src/app/app.routes.ts
git commit -m "feat: QR batch sheet via a browser print stylesheet, no PDF dependency"
```

---

## Task 7: Offline sync — exponential backoff and duplicate visibility

Spec §9: "Exponential backoff. After 3 failures, surface a manual Retry button in /app/sync." The outbox already retries on reconnect and tracks attempt counts (Week 2); it does not yet back off automatically, and the true-409-conflict case the spec describes cannot occur under this system's idempotency design — worth stating explicitly rather than building a scenario that can't happen.

**Files:**
- Modify: `apps/web/src/app/core/inspector.service.ts`
- Create: `apps/web/src/app/core/inspector.service.spec.ts`
- Modify: `apps/web/src/app/inspector/sync.component.ts`
- Modify: `apps/web/src/app/core/strings.ts`

**Interfaces:**
- Consumes: existing `OutboxEntry`, `drainOutbox()` (Week 2).
- Produces: `backoffDelayMs(attempts: number): number` (exported, pure), `InspectorService.scheduleRetry` (private, wired into the existing failure path).

---

- [ ] **Step 1: Write the failing test for the pure backoff function**

Create `apps/web/src/app/core/inspector.service.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { backoffDelayMs, InspectorService } from './inspector.service';
import { AuthService } from './api';

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
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { authHeaders: () => ({}), handleAuthError: vi.fn() } },
      ],
    });
    return TestBed.inject(InspectorService);
  }

  it('schedules up to three automatic retries, then stops and leaves it for the manual button', () => {
    vi.useFakeTimers();
    const service = build();
    const drainSpy = vi.spyOn(service, 'drainOutbox').mockResolvedValue(0);

    service.scheduleRetry(2); // attempts=2 means a 3rd attempt is still allowed
    vi.advanceTimersByTime(backoffDelayMsFor(2));
    expect(drainSpy).toHaveBeenCalledTimes(1);

    drainSpy.mockClear();
    service.scheduleRetry(3); // a 4th attempt would exceed the auto-retry cap
    vi.advanceTimersByTime(10 * 60_000);
    expect(drainSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

function backoffDelayMsFor(attempts: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** attempts);
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: FAIL — `backoffDelayMs` and `scheduleRetry` do not exist yet.

- [ ] **Step 3: Implement backoff in the service**

In `apps/web/src/app/core/inspector.service.ts`, add near the top-level constants (after the existing `PHOTO_PREFIX` constant):

```typescript
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
/** After this many automatic attempts, stop retrying silently and let the
 *  manual Retry button in /app/sync take over — spec §9. */
const MAX_AUTO_ATTEMPTS = 3;

/** Exported so it is testable in isolation from the timer plumbing. */
export function backoffDelayMs(attempts: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempts);
}
```

Add a field to the `InspectorService` class, alongside `pendingCount`:

```typescript
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
```

Add this method to the class (public so the test can call it directly, and so `submit()`'s catch block and `drainOutbox()`'s catch block can both call it):

```typescript
  /** Schedules one automatic re-drain after a backoff delay, unless the entry
   *  has already exhausted its automatic attempts. Keyed loosely — this
   *  re-drains the whole outbox rather than one entry, which is simpler than
   *  per-entry timers and correct here since a drain that finds nothing to
   *  send is a no-op. */
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
```

Wire it into the two places that already catch a failed send. In `submit()`'s catch block, after `await this.queueEntry(entry);`, add:

```typescript
      this.scheduleRetry(entry.attempts);
```

In `drainOutbox()`'s catch block, after the `await idb.set(key, { ...value, attempts: value.attempts + 1, ... })` call, add:

```typescript
        this.scheduleRetry(value.attempts + 1);
```

- [ ] **Step 4: Run the test**

```bash
cd apps/web && npx ng test --watch=false
```

Expected: PASS.

- [ ] **Step 5: Surface duplicate submissions distinctly in the sync UI**

The idempotency design (Week 2) means a retried submission that the server already has returns 200 with `duplicate: true`, not an error — there is no true 409 conflict to handle, because the server never disagrees with a retried clientId, it just returns what it already recorded. What's missing is telling the inspector this happened, so a retry doesn't read as a fresh success. In `apps/web/src/app/core/strings.ts`'s `review` block, add:

```typescript
    alreadyDelivered: 'كان هذا التفتيش قد وصل مسبقاً — لم يُنشأ تفتيش جديد.',
```

In `apps/web/src/app/inspector/review.component.ts` (or wherever `submit()`'s result is displayed — check the existing success-state template), where the submitted result is shown, add a conditional line: when `result.duplicate` is true, show `T.review.alreadyDelivered` instead of (or above) the normal success message. This is a template-only change; locate the existing success block by searching for where `t.review.submitted` is rendered and add the sibling condition.

- [ ] **Step 6: Verify with a real outbox retry**

```bash
npm run dev:api    # terminal 1
npm run dev:web    # terminal 2
```

In a browser at `/app/inspect/:id`, complete a checklist, go offline (DevTools → Network → Offline), submit — it queues. Go back online and confirm `drainOutbox` fires on the `online` event as before (Week 2 behaviour, unchanged). Then, with DevTools still open, simulate three consecutive send failures by blocking the `POST /api/inspector/inspections` request three times in a row (DevTools request blocking or killing the API briefly) and confirm no fourth automatic attempt fires — the count stays visible in `/app/sync` and the manual Retry button is what moves it after that.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/core/inspector.service.ts apps/web/src/app/core/inspector.service.spec.ts \
  apps/web/src/app/inspector/review.component.ts apps/web/src/app/core/strings.ts
git commit -m "feat: exponential backoff on outbox auto-retry, capped at 3 attempts (spec 9)"
```

---

## Task 8: Demo dataset at §13.1 scale

Week 3 seeded 4 establishments and 6 complaints — enough to prove the loop. §13.1 wants 15 establishments across all five categories, spread across grades A–D plus one never-inspected, 45 complaints over 30 days with some deliberately duplicated, and 12 months of inspection history so trend blocks are not empty. This task is data, not logic — no TDD cycle, but every number is checked against the seed output rather than assumed.

**Files:**
- Modify: `apps/api/src/seed.ts`

**Interfaces:**
- Consumes: everything already imported in `seed.ts`.
- Produces: nothing new — same script, larger dataset.

---

- [ ] **Step 1: Extend the establishment list**

In `apps/api/src/seed.ts`, after the existing four establishments (الفرن الذهبي, مطعم السلام, مخبز النور, ملحمة الجبل), add eleven more so all five categories and a spread of grades are represented. Insert this block before the risk-snapshot computation loop:

```typescript
  const moreEstablishments: {
    slug: string;
    nameAr: string;
    category: 'BUTCHER' | 'RESTAURANT' | 'BAKERY' | 'CAFE' | 'RETAIL';
    address: string;
    score: number | null;
    daysAgo: number | null;
  }[] = [
    { slug: 'nablus-grill', nameAr: 'مشاوي نابلس', category: 'RESTAURANT', address: 'رفيديا، نابلس', score: 88, daysAgo: 20 },
    { slug: 'al-quds-cafe', nameAr: 'مقهى القدس', category: 'CAFE', address: 'وسط البلد، نابلس', score: 95, daysAgo: 5 },
    { slug: 'zaman-sweets', nameAr: 'حلويات زمان', category: 'RETAIL', address: 'البلدة القديمة، نابلس', score: 91, daysAgo: 45 },
    { slug: 'nabulsi-cheese', nameAr: 'مصنع الجبنة النابلسية', category: 'RETAIL', address: 'جبل النار، نابلس', score: 73, daysAgo: 60 },
    { slug: 'al-noor-butcher', nameAr: 'ملحمة النور', category: 'BUTCHER', address: 'رفيديا، نابلس', score: 55, daysAgo: 15 },
    { slug: 'city-bakery', nameAr: 'مخبز المدينة', category: 'BAKERY', address: 'عسكر، نابلس', score: 82, daysAgo: 30 },
    { slug: 'al-manara-cafe', nameAr: 'مقهى المنارة', category: 'CAFE', address: 'وسط البلد، نابلس', score: 67, daysAgo: 75 },
    { slug: 'balata-grill', nameAr: 'مشاوي بلاطة', category: 'RESTAURANT', address: 'مخيم بلاطة، نابلس', score: 48, daysAgo: 100 },
    { slug: 'hillside-market', nameAr: 'سوبرماركت التلة', category: 'RETAIL', address: 'جبل جرزيم، نابلس', score: 90, daysAgo: 10 },
    { slug: 'al-yasmeen-butcher', nameAr: 'ملحمة الياسمين', category: 'BUTCHER', address: 'عسكر، نابلس', score: 78, daysAgo: 40 },
    { slug: 'downtown-bakery', nameAr: 'مخبز وسط البلد', category: 'BAKERY', address: 'وسط البلد، نابلس', score: null, daysAgo: null },
  ];

  for (const e of moreEstablishments) {
    await establishmentRepo.save({
      slug: e.slug,
      nameAr: e.nameAr,
      nameEn: null,
      category: e.category,
      address: e.address,
      currentGrade: e.score === null ? null : scoreToGrade(e.score),
      currentScore: e.score,
      lastInspectionAt: e.daysAgo === null ? null : daysAgo(e.daysAgo),
      status: 'ACTIVE',
    });
  }
```

- [ ] **Step 2: Extend the complaint dataset to 45 total**

The existing `complaintSeed` array covers only الفرن الذهبي. Add a second block spreading complaints across the other fourteen establishments, with some deliberately duplicated within 72 hours so duplicate detection has more than one cluster to demonstrate. Insert immediately after the existing `complaintSeed` loop:

```typescript
  const allSlugs = [
    'al-salam-restaurant', 'nour-bakery', 'jabal-butcher',
    ...moreEstablishments.map((e) => e.slug),
  ];
  const categories: ComplaintCategory[] = ['HYGIENE', 'EXPIRED', 'REFRIGERATION', 'STAFF', 'PESTS', 'OTHER'];

  // §13.1: 45 complaints across the last 30 days, some deliberately
  // duplicated within 72h. الفرن الذهبي already has 6 from the block above;
  // this fills in the remaining ~39 across the other 14 establishments.
  let extraReference = nextReference;
  for (let i = 0; i < 39; i++) {
    const slug = allSlugs[i % allSlugs.length];
    const establishment = await establishmentRepo.findOne({ where: { slug } });
    if (!establishment) continue;

    const dayOffset = i % 30;
    // Every fifth complaint repeats the previous slug's category within 48h,
    // to seed a second duplicate cluster beyond الفرن الذهبي's.
    const category = i % 5 === 0 && i > 0 ? categories[(i - 1) % categories.length] : categories[i % categories.length];

    await complaintRepo.save({
      reference: String(++extraReference),
      establishmentId: establishment.id,
      category,
      description: 'شكوى ضمن بيانات العرض التوضيحي.',
      hasEvidence: i % 3 === 0,
      photoIds: null,
      contactPhoneEncrypted: null,
      ipHash: 'seed'.padEnd(64, '0'),
      status: i % 10 === 0 ? 'CLOSED' : 'SUBMITTED',
      duplicateOfId: null,
      rejectionReason: null,
      assignedInspectorId: null,
      inspectionId: null,
      createdAt: daysAgo(dayOffset),
      updatedAt: daysAgo(Math.max(0, dayOffset - 1)),
    });
  }
```

- [ ] **Step 3: Update the summary log line**

Change the final `console.log` to report the real totals:

```typescript
  const establishmentCount = await establishmentRepo.count();
  const complaintCount = await complaintRepo.count();
  console.log(
    `Seeded ${establishmentCount} establishments, ${items.length} checklist items, ${complaintCount} complaints, 3 users.`,
  );
```

- [ ] **Step 4: Run the seed and verify the counts**

```bash
npm run seed
```

Expected output: `Seeded 15 establishments, 25 checklist items, 45 complaints, 3 users.` If the counts are off, the loop bounds in Steps 1–2 are the place to adjust — 4 original + 11 new = 15 establishments; 6 original + 39 new = 45 complaints.

- [ ] **Step 5: Confirm idempotency**

```bash
npm run seed
```

Run it a second time immediately. Expected: same counts, no duplicate-key errors — the existing delete-then-insert pattern at the top of `seed()` already handles this; this step only confirms the new data doesn't break it.

- [ ] **Step 6: Spot-check the demo hero record still leads**

```bash
npm run dev:api
```

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"inspector@nablus.ps","password":"aman1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
curl -s http://localhost:3000/api/inspector/queue -H "Authorization: Bearer $TOKEN" | node -pe "
JSON.parse(require('fs').readFileSync(0)).slice(0,5).map((e,i)=>(i+1)+'. '+e.nameAr+'  risk='+e.risk).join('\n')"
```

Expected: الفرن الذهبي is still in the top few, ideally #1 — it has the densest, most recent complaint cluster of any establishment by construction. If a newly-added establishment has overtaken it, that is not a bug (every number still traces to real data), but confirm the demo script still opens on the right establishment before rehearsing Task 9.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/seed.ts
git commit -m "feat: scale demo dataset to spec 13.1 — 15 establishments, 45 complaints"
```

---

## Task 9: RTL audit, empty/error states, and demo rehearsal

Not TDD — this is the manual verification pass §12.1's definition of done requires ("works in RTL... checked on a real phone screen width (375px)... empty state, loading state, and error state all implemented... no console errors") applied across every screen built across all four weeks, plus one full run of the §13 script.

**Files:** none new — this task fixes whatever it finds, wherever it finds it.

**Interfaces:** none.

---

- [ ] **Step 1: RTL pass at 375px**

With the dev servers running, resize the browser to 375×812 and visit every route in turn: `/`, `/e/:slug`, `/e/:slug/complaint`, `/complaint/track`, `/complaint/:ref`, `/app/login`, `/app/today`, `/app/inspect/:id`, `/app/inspect/:id/review`, `/app/sync`, `/portal`, `/admin/dashboard`, `/admin/complaints`, `/admin/planning`, `/admin/settings`, `/admin/qr`. For each: confirm no horizontal scroll, no text clipped or overlapping, every number/date/reference wrapped in `.ltr` reads left-to-right inside the Arabic sentence, and touch targets are at least 44×44px on the inspector and owner screens (§10.3). Fix anything found directly in the offending component's template or CSS — these are one-line logical-property or `.ltr`-wrapping fixes, not new files.

- [ ] **Step 2: Empty and error states**

For each of: the public page with an unknown slug, the queue with zero assigned establishments, the sync outbox with nothing pending, the admin dashboard's needs-attention block with nothing to report, the QR sheet with zero active establishments, and the owner portal with zero open violations — confirm a real empty-state message renders (not a blank area). For each screen's data fetch, confirm a network failure shows the `notice` element with an Arabic message rather than a silent blank screen. Most of these already exist from Weeks 1–3; this step is confirmation, and any gap found gets a one-line template fix using the existing `t.*.empty` / `t.*.loadFailed` strings pattern already established throughout the codebase.

- [ ] **Step 3: Console audit**

Open DevTools console, clear it, then click through the same sixteen routes from Step 1. Expected: zero errors, zero warnings. Anything logged gets fixed before moving on — per §12.1, "no console errors" is part of the definition of done, not a nice-to-have.

- [ ] **Step 4: Run the full automated suite one more time**

```bash
cd "C:/Users/yahya_k6rln48/OneDrive/Desktop/Yahya/Hackathons/AMAN"
npm test
cd apps/web && npx ng test --watch=false
```

Expected: every shared, API, and web test passes. This is the last gate before the demo rehearsal.

- [ ] **Step 5: Rehearse the §13 demo script twice**

Reseed for a clean run (`npm run seed`), then walk the eight-minute script end to end twice:

1. `/e/golden-oven-nablus` — grade visible, note it.
2. File a complaint with a photo from `/e/golden-oven-nablus/complaint`, note the reference.
3. `/admin/planning` as `admin@nablus.ps` — الفرن الذهبي has moved, breakdown expands, **grade unchanged**.
4. `/app/today` as `inspector@nablus.ps` — same establishment ranked with reasons visible. Start the inspection, fail cold storage with a photo, **turn off wifi**, submit.
5. Refresh `/e/golden-oven-nablus` — grade has changed, before the inspector left the building.
6. `/portal` as `owner@golden-oven.ps` — recommendation visible, upload proof, status reads awaiting verification.
7. Close on the attribution line: the municipality issued the grade, Aman only gave them the tools.

Time each run. If either run misses the 8-minute mark, note which scene ran long — that is the thing to trim or pre-stage (e.g., have the second browser tab already open to the target screen) before the real demo, not a code change.

- [ ] **Step 6: Commit anything fixed during this pass**

```bash
git add -A
git commit -m "fix: RTL, empty-state, and console findings from the full audit pass"
```

If Step 1–3 found nothing to fix, skip this commit — an empty commit is not a deliverable.

---

## Self-Review

**Spec coverage.** §5.8 dashboard (KPIs, grade distribution, complaints-over-time, needs-attention) → Tasks 4–5. §5.10 settings (risk-weights half) and QR batch → Tasks 2–3, 6. §9 offline hardening (backoff, the 409 case addressed by explanation since it cannot occur under this idempotency design) → Task 7. §10.1/§10.3 RTL and touch targets → Task 9 Step 1. §12.1 definition of done (empty/error states, no console errors, unit tests) → Task 9 Steps 2–4, and Task 1's retrofit. §13.1 demo dataset scale → Task 8. §13 demo script → Task 9 Step 5.

**Deliberately not built, and why.** Checklist-item editing and user management (the other two-thirds of §5.10 Settings) — scoped out at the top of this plan; neither is load-bearing for the demo and both are real sub-features, not one-task additions. A generated PDF binary for the QR sheet — a browser print stylesheet does the same job with zero new dependencies. A true 409-conflict handler for offline sync — the system's own idempotency design (client-generated UUID, server returns the existing record) makes a genuine conflict structurally impossible, so Task 7 makes the already-correct behavior visible (`duplicate: true` → a distinct message) instead of building a code path for a case that cannot occur.

**Type consistency.** `RiskWeightsPayload` (web) matches `RiskWeights` (shared) field-for-field: `PRIOR_VIOLATIONS`, `COMPLAINT_PRESSURE`, `TIME_SINCE_INSPECTION`, `CATEGORY`. `DashboardData` (web) matches `DashboardDto` (api) — `kpis`, `gradeDistribution`, `complaintsOverTime`, `needsAttention` — field-for-field. `QrEntry` (web) matches `QrBatchEntry` (api). `BarDatum` (`label`, `value`, optional `color`) is the one shape both dashboard charts feed into `BarChartComponent`.

**Constructor-arity changes to track.** `RiskService` gains a `SettingsService` parameter (Task 2); `AdminService` gains a `Violation` repository before `users` and a `SettingsService` after `audit` (Tasks 2 and 4, in that order) — both existing spec files' `build()` helpers are updated in the same task that changes the constructor, not deferred to a later cleanup step.
