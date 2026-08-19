# Aman — Week 1: Foundation & Public Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first vertical slice — a citizen can scan a QR code, land on `/e/:slug`, and see a real grade computed from seeded data, served end-to-end through MySQL → NestJS → Angular.

**Architecture:** npm workspaces monorepo with three packages: `packages/shared` (pure TypeScript — grading algorithm, types, no framework deps, imported by both server and future offline client), `apps/api` (NestJS + TypeORM + MySQL), `apps/web` (Angular, RTL-first). No auth in Week 1 — the public page requires none, and login/roles are deferred to Week 2 when the inspector app first needs them (vertical-slice discipline: build what this week's demo needs, not what the full spec eventually needs).

**Tech Stack:** Node.js LTS, npm workspaces, TypeScript, NestJS 10, TypeORM, MySQL 8, Angular 18 (standalone components), Jest (backend + shared), Karma/Jasmine (Angular default), `qrcode` npm package.

## Global Constraints

- Public establishment page must never expose inspector names or raw inspector notes — only violation category and status (spec §8.1).
- Every public page carries the attribution line: grade issued by the municipality (spec §0, §5.1) — even in this minimal Week 1 version.
- Grade badge shows colour **and** letter together, never colour alone (spec §5.1, §10.2). Grade colours (`#1e8449` A, `#b7950b` B, `#ca6f1e` C, `#a93226` D) are reserved exclusively for grade badges (spec §10.2).
- Public URLs use a slug, never a raw database id (spec §4): `/e/golden-oven-nablus`, not `/e/47`.
- `<html dir="rtl" lang="ar">` is the default from the first commit, not a toggle (spec §10.1). Numbers/dates inside Arabic text stay LTR via `<span dir="ltr">` (spec §10.1, §10.3).
- Self-host the Arabic font (IBM Plex Sans Arabic or Cairo) — no Google Fonts CDN call (spec §10.3).
- "Never inspected" establishments show a grey "—" badge, never a fake grade (spec §5.1 empty states).
- The grading algorithm (`calculateScore`) lives only in `packages/shared` and must exactly match spec §6.1, including the critical-failure override. It is the single most consequential piece of logic in the whole system — get its tests right now, because Week 2 (live inspector checklist) and Week 3 (risk engine) both build on it.

---

## File Structure

```
aman/
├── package.json                          # npm workspaces root
├── tsconfig.base.json
├── packages/
│   └── shared/
│       ├── package.json
│       ├── src/
│       │   ├── grading.ts                # calculateScore() + Grade/Severity types
│       │   └── grading.test.ts
│       └── tsconfig.json
├── apps/
│   ├── api/                              # NestJS
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── establishments/
│   │   │   │   ├── establishment.entity.ts
│   │   │   │   ├── inspection.entity.ts
│   │   │   │   ├── violation.entity.ts
│   │   │   │   ├── establishments.module.ts
│   │   │   │   ├── establishments.service.ts
│   │   │   │   ├── establishments.service.spec.ts
│   │   │   │   ├── establishments.controller.ts
│   │   │   │   ├── establishments.controller.spec.ts
│   │   │   │   └── dto/establishment-public.dto.ts
│   │   │   └── seed.ts
│   │   └── scripts/generate-qr.ts
│   └── web/                              # Angular
│       └── src/
│           ├── index.html                # dir="rtl" lang="ar", self-hosted font
│           ├── main.ts
│           └── app/
│               ├── app.routes.ts
│               ├── establishment/
│               │   ├── establishment.component.ts
│               │   ├── establishment.component.html
│               │   └── establishment.service.ts
│               └── grade-badge/
│                   └── grade-badge.component.ts
└── docs/
    └── superpowers/plans/                # this file lives here
```

Rationale: `packages/shared` has zero NestJS/Angular imports so it can be unit-tested in isolation and later imported unmodified by the offline inspector code in Week 2 — this is what "never duplicate the grading logic" (spec §2) actually requires in practice.

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`

**Interfaces:**
- Produces: an npm workspace where `apps/api` and `apps/web` can `import { calculateScore } from '@aman/shared'`.

- [ ] **Step 1: Create the root workspace manifest**

`package.json`:
```json
{
  "name": "aman",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test:shared": "npm run test --workspace=packages/shared",
    "test:api": "npm run test --workspace=apps/api",
    "dev:api": "npm run start:dev --workspace=apps/api",
    "dev:web": "npm run start --workspace=apps/web"
  }
}
```

- [ ] **Step 2: Create the base tsconfig**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true
  }
}
```

- [ ] **Step 3: Scaffold `packages/shared`**

`packages/shared/package.json`:
```json
{
  "name": "@aman/shared",
  "version": "0.0.1",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "jest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "@types/jest": "^29.5.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 4: Install and verify workspace linking**

Run: `npm install`
Expected: `node_modules/@aman/shared` is a symlink into `packages/shared` (npm workspaces auto-link).

- [ ] **Step 5: Commit**

```bash
git init
git add package.json tsconfig.base.json packages/shared/package.json packages/shared/tsconfig.json
git commit -m "chore: scaffold npm workspaces monorepo"
```

---

## Task 2: Grading algorithm in `packages/shared` (TDD)

This is the spec's §6.1 algorithm verbatim, including the critical-failure override. Write the tests first — this function will be trusted by every later week.

**Files:**
- Create: `packages/shared/src/grading.ts`
- Create: `packages/shared/src/grading.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR';
  type ItemResult = 'PASS' | 'FAIL' | 'NA';
  interface ChecklistResult { severity: Severity; result: ItemResult; }
  function calculateScore(items: ChecklistResult[]): number | null;
  function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D';
  const SEVERITY_POINTS: Record<Severity, number>;
  ```
- Consumed by: Task 5 (seed script uses `scoreToGrade` to keep seeded grades consistent with the algorithm), and by Week 2's live checklist submission.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/grading.test.ts`:
```typescript
import { calculateScore, scoreToGrade } from './grading';

describe('calculateScore', () => {
  it('returns null when every item is N/A', () => {
    expect(calculateScore([{ severity: 'MAJOR', result: 'NA' }])).toBeNull();
  });

  it('scores 100 when everything passes', () => {
    const items = [
      { severity: 'CRITICAL', result: 'PASS' },
      { severity: 'MAJOR', result: 'PASS' },
      { severity: 'MINOR', result: 'PASS' },
    ] as const;
    expect(calculateScore([...items])).toBe(100);
  });

  it('excludes N/A items from the denominator entirely', () => {
    const items = [
      { severity: 'CRITICAL', result: 'PASS' },
      { severity: 'MAJOR', result: 'NA' },
    ] as const;
    // only the CRITICAL item counts: 10/10 = 100
    expect(calculateScore([...items])).toBe(100);
  });

  it('computes the percentage of points earned', () => {
    const items = [
      { severity: 'CRITICAL', result: 'PASS' }, // 10 earned / 10 avail
      { severity: 'MAJOR', result: 'FAIL' },     // 0 earned / 5 avail
      { severity: 'MINOR', result: 'PASS' },     // 2 earned / 2 avail
    ] as const;
    // earned 12 / available 17 = 70.6 -> rounds to 71
    expect(calculateScore([...items])).toBe(71);
  });

  it('caps score at 79 when there is one critical failure, even if raw score is higher', () => {
    const items = [
      { severity: 'CRITICAL', result: 'FAIL' }, // 0/10
      { severity: 'MAJOR', result: 'PASS' },     // 5/5
      { severity: 'MINOR', result: 'PASS' },     // 2/2
    ] as const;
    // raw = 7/17 = 41, already below 79, so test a case where raw would be high:
    const highRaw = [
      { severity: 'CRITICAL', result: 'FAIL' },  // 0/10
      { severity: 'MINOR', result: 'PASS' },      // 2/2
    ] as const;
    // raw = 2/12 = 17 -> min(17, 79) = 17, override doesn't matter here.
    // Use a case where raw score exceeds 79 despite one critical fail:
    const manyPasses = [
      { severity: 'CRITICAL', result: 'FAIL' },
      ...Array(20).fill({ severity: 'MINOR', result: 'PASS' }),
    ] as const;
    // earned = 40, available = 10 + 40 = 50 -> raw = 80 -> capped to 79
    expect(calculateScore([...manyPasses])).toBe(79);
  });

  it('caps score at 59 when there are three or more critical failures', () => {
    const items = [
      { severity: 'CRITICAL', result: 'FAIL' },
      { severity: 'CRITICAL', result: 'FAIL' },
      { severity: 'CRITICAL', result: 'FAIL' },
      ...Array(20).fill({ severity: 'MINOR', result: 'PASS' }),
    ] as const;
    // earned = 40, available = 30 + 40 = 70 -> raw = 57 (already < 59)
    // force a high raw: use passes only for the non-critical items, few criticals counted as available too
    const items2 = [
      { severity: 'CRITICAL', result: 'FAIL' },
      { severity: 'CRITICAL', result: 'FAIL' },
      { severity: 'CRITICAL', result: 'FAIL' },
      ...Array(80).fill({ severity: 'MINOR', result: 'PASS' }),
    ] as const;
    // earned = 160, available = 30 + 160 = 190 -> raw = 84 -> capped to 59
    expect(calculateScore([...items2])).toBe(59);
  });
});

describe('scoreToGrade', () => {
  it.each([
    [95, 'A'], [90, 'A'],
    [89, 'B'], [80, 'B'],
    [79, 'C'], [60, 'C'],
    [59, 'D'], [0, 'D'],
  ])('maps score %i to grade %s', (score, grade) => {
    expect(scoreToGrade(score)).toBe(grade);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=packages/shared`
Expected: FAIL with "Cannot find module './grading'"

- [ ] **Step 3: Implement `grading.ts`**

`packages/shared/src/grading.ts`:
```typescript
export type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR';
export type ItemResult = 'PASS' | 'FAIL' | 'NA';

export interface ChecklistResult {
  severity: Severity;
  result: ItemResult;
}

export const SEVERITY_POINTS: Record<Severity, number> = {
  CRITICAL: 10,
  MAJOR: 5,
  MINOR: 2,
};

export function calculateScore(items: ChecklistResult[]): number | null {
  let earned = 0;
  let available = 0;

  for (const item of items) {
    if (item.result === 'NA') continue;
    available += SEVERITY_POINTS[item.severity];
    if (item.result === 'PASS') earned += SEVERITY_POINTS[item.severity];
  }

  if (available === 0) return null;

  let score = Math.round((earned / available) * 100);

  const criticalFails = items.filter(
    (i) => i.severity === 'CRITICAL' && i.result === 'FAIL',
  ).length;

  if (criticalFails >= 1) score = Math.min(score, 79);
  if (criticalFails >= 3) score = Math.min(score, 59);

  return score;
}

export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}
```

- [ ] **Step 4: Add jest config and run tests to verify they pass**

`packages/shared/jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
};
```

Run: `npm run test --workspace=packages/shared`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Add the package entry point and commit**

`packages/shared/src/index.ts`:
```typescript
export * from './grading';
```

```bash
git add packages/shared/src packages/shared/jest.config.js
git commit -m "feat: grading algorithm with critical-failure override, per spec §6.1"
```

---

## Task 3: NestJS API scaffold with MySQL connection

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/.env.example`

**Interfaces:**
- Consumes: nothing yet.
- Produces: a running NestJS app on `localhost:3000` connected to MySQL via TypeORM, ready for entities in Task 4.

- [ ] **Step 1: Scaffold the NestJS package**

`apps/api/package.json`:
```json
{
  "name": "@aman/api",
  "version": "0.0.1",
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/typeorm": "^10.0.2",
    "@nestjs/config": "^3.2.0",
    "typeorm": "^0.3.20",
    "mysql2": "^3.9.0",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1",
    "@aman/shared": "*"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "typescript": "^5.4.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.11.0"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "outDir": "dist",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

`apps/api/nest-cli.json`:
```json
{ "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

`apps/api/.env.example`:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=aman
```

- [ ] **Step 2: Write `app.module.ts` with TypeORM connection**

`apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstablishmentsModule } from './establishments/establishments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', 'localhost'),
        port: parseInt(config.get('DB_PORT', '3306'), 10),
        username: config.get('DB_USER', 'root'),
        password: config.get('DB_PASSWORD', ''),
        database: config.get('DB_NAME', 'aman'),
        autoLoadEntities: true,
        synchronize: true, // MVP only — replace with migrations before any real pilot
      }),
    }),
    EstablishmentsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Write `main.ts`**

`apps/api/src/main.ts`:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3000);
}
bootstrap();
```

- [ ] **Step 4: Install and boot (with a placeholder empty EstablishmentsModule)**

`apps/api/src/establishments/establishments.module.ts` (placeholder, filled in Task 4):
```typescript
import { Module } from '@nestjs/common';

@Module({})
export class EstablishmentsModule {}
```

Run: `npm install`, then create the MySQL database (`mysql -u root -e "CREATE DATABASE aman"`), then `npm run dev:api`
Expected: NestJS boots, logs "Nest application successfully started", no MySQL connection errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api package.json
git commit -m "chore: scaffold NestJS API with MySQL/TypeORM connection"
```

---

## Task 4: Establishment/Inspection/Violation entities

**Files:**
- Create: `apps/api/src/establishments/establishment.entity.ts`
- Create: `apps/api/src/establishments/inspection.entity.ts`
- Create: `apps/api/src/establishments/violation.entity.ts`

**Interfaces:**
- Consumes: TypeORM decorators only.
- Produces: `Establishment`, `Inspection`, `Violation` classes, importable by the service (Task 5) and seed script (Task 6).

> ponytail: Week 1 violations store `category` as a plain string on the row instead of a full `checklist_item` → `checklist_version` relation (spec §7's full model). The live inspector checklist that needs versioned checklist items doesn't exist until Week 2 — modeling that relation now would be speculative. Upgrade to the full `checklist_items`/`checklist_versions` tables in the Week 2 plan, when the inspector app actually writes violations from a real checklist.

- [ ] **Step 1: Write `establishment.entity.ts`**

```typescript
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Inspection } from './inspection.entity';

export type EstablishmentCategory = 'BUTCHER' | 'RESTAURANT' | 'BAKERY' | 'CAFE' | 'RETAIL';
export type EstablishmentStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type Grade = 'A' | 'B' | 'C' | 'D';

@Entity('establishments')
export class Establishment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  nameAr: string;

  @Column({ nullable: true })
  nameEn: string;

  @Column({ type: 'varchar' })
  category: EstablishmentCategory;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'char', length: 1, nullable: true })
  currentGrade: Grade | null;

  @Column({ type: 'int', nullable: true })
  currentScore: number | null;

  @Column({ type: 'datetime', nullable: true })
  lastInspectionAt: Date | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: EstablishmentStatus;

  @OneToMany(() => Inspection, (inspection) => inspection.establishment)
  inspections: Inspection[];
}
```

- [ ] **Step 2: Write `inspection.entity.ts`**

```typescript
import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Establishment, Grade } from './establishment.entity';
import { Violation } from './violation.entity';

@Entity('inspections')
export class Inspection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Establishment, (e) => e.inspections)
  establishment: Establishment;

  @Column()
  establishmentId: string;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'char', length: 1 })
  grade: Grade;

  @Column({ type: 'char', length: 1, nullable: true })
  previousGrade: Grade | null;

  @Column({ type: 'datetime' })
  submittedAt: Date;

  @OneToMany(() => Violation, (v) => v.inspection)
  violations: Violation[];
}
```

- [ ] **Step 3: Write `violation.entity.ts`**

```typescript
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Inspection } from './inspection.entity';

export type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR';
export type ViolationStatus = 'OPEN' | 'OWNER_RESPONDED' | 'VERIFIED' | 'CLOSED' | 'OVERDUE';

@Entity('violations')
export class Violation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Inspection, (i) => i.violations)
  inspection: Inspection;

  @Column()
  inspectionId: string;

  @Column()
  establishmentId: string;

  @Column()
  category: string;

  @Column({ type: 'varchar' })
  severity: Severity;

  @Column({ type: 'varchar', default: 'OPEN' })
  status: ViolationStatus;

  @Column({ type: 'datetime', nullable: true })
  respondedAt: Date | null;
}
```

- [ ] **Step 4: Register entities and verify the app still boots with tables created**

Update `apps/api/src/establishments/establishments.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from './establishment.entity';
import { Inspection } from './inspection.entity';
import { Violation } from './violation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment, Inspection, Violation])],
})
export class EstablishmentsModule {}
```

Run: `npm run dev:api`
Expected: boots cleanly; `SHOW TABLES;` in MySQL shows `establishments`, `inspections`, `violations`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/establishments
git commit -m "feat: establishment/inspection/violation entities"
```

---

## Task 5: Establishments service + public controller (TDD)

**Files:**
- Create: `apps/api/src/establishments/dto/establishment-public.dto.ts`
- Create: `apps/api/src/establishments/establishments.service.ts`
- Create: `apps/api/src/establishments/establishments.service.spec.ts`
- Create: `apps/api/src/establishments/establishments.controller.ts`
- Create: `apps/api/src/establishments/establishments.controller.spec.ts`

**Interfaces:**
- Consumes: `Establishment`, `Inspection`, `Violation` entities from Task 4.
- Produces: `GET /api/public/establishments/:slug` returning `EstablishmentPublicDto`, matching spec §8.1 exactly — no inspector names, no raw notes.

- [ ] **Step 1: Write the DTO**

`apps/api/src/establishments/dto/establishment-public.dto.ts`:
```typescript
export interface EstablishmentPublicDto {
  slug: string;
  nameAr: string;
  nameEn: string | null;
  category: string;
  grade: 'A' | 'B' | 'C' | 'D' | null;
  score: number | null;
  lastInspectionAt: string | null;
  openViolations: { category: string; ownerResponded: boolean }[];
  history: { date: string; grade: string; violationCount: number }[];
  status: string;
}
```

- [ ] **Step 2: Write the failing service test**

`apps/api/src/establishments/establishments.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EstablishmentsService } from './establishments.service';
import { Establishment } from './establishment.entity';
import { Inspection } from './inspection.entity';
import { Violation } from './violation.entity';

describe('EstablishmentsService', () => {
  let service: EstablishmentsService;
  const mockEstablishmentRepo = { findOne: jest.fn() };
  const mockInspectionRepo = { find: jest.fn() };
  const mockViolationRepo = { find: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EstablishmentsService,
        { provide: getRepositoryToken(Establishment), useValue: mockEstablishmentRepo },
        { provide: getRepositoryToken(Inspection), useValue: mockInspectionRepo },
        { provide: getRepositoryToken(Violation), useValue: mockViolationRepo },
      ],
    }).compile();

    service = module.get(EstablishmentsService);
  });

  it('returns null when the slug does not exist', async () => {
    mockEstablishmentRepo.findOne.mockResolvedValue(null);
    const result = await service.getPublicBySlug('nonexistent');
    expect(result).toBeNull();
  });

  it('maps an establishment to the public DTO, hiding no inspector identity fields', async () => {
    mockEstablishmentRepo.findOne.mockResolvedValue({
      slug: 'golden-oven-nablus',
      nameAr: 'الفرن الذهبي',
      nameEn: null,
      category: 'BAKERY',
      currentGrade: 'B',
      currentScore: 82,
      lastInspectionAt: new Date('2026-08-05T00:00:00Z'),
      status: 'ACTIVE',
    });
    mockInspectionRepo.find.mockResolvedValue([
      { submittedAt: new Date('2026-08-05T00:00:00Z'), grade: 'B', violations: [{}, {}] },
      { submittedAt: new Date('2026-05-14T00:00:00Z'), grade: 'A', violations: [] },
    ]);
    mockViolationRepo.find.mockResolvedValue([
      { category: 'Refrigeration', status: 'OWNER_RESPONDED' },
    ]);

    const result = await service.getPublicBySlug('golden-oven-nablus');

    expect(result).toEqual({
      slug: 'golden-oven-nablus',
      nameAr: 'الفرن الذهبي',
      nameEn: null,
      category: 'BAKERY',
      grade: 'B',
      score: 82,
      lastInspectionAt: '2026-08-05T00:00:00.000Z',
      openViolations: [{ category: 'Refrigeration', ownerResponded: true }],
      history: [
        { date: '2026-08-05T00:00:00.000Z', grade: 'B', violationCount: 2 },
        { date: '2026-05-14T00:00:00.000Z', grade: 'A', violationCount: 0 },
      ],
      status: 'ACTIVE',
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- establishments.service`
Expected: FAIL — `EstablishmentsService` not defined.

- [ ] **Step 4: Implement the service**

`apps/api/src/establishments/establishments.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Establishment } from './establishment.entity';
import { Inspection } from './inspection.entity';
import { Violation } from './violation.entity';
import { EstablishmentPublicDto } from './dto/establishment-public.dto';

@Injectable()
export class EstablishmentsService {
  constructor(
    @InjectRepository(Establishment) private establishmentRepo: Repository<Establishment>,
    @InjectRepository(Inspection) private inspectionRepo: Repository<Inspection>,
    @InjectRepository(Violation) private violationRepo: Repository<Violation>,
  ) {}

  async getPublicBySlug(slug: string): Promise<EstablishmentPublicDto | null> {
    const establishment = await this.establishmentRepo.findOne({ where: { slug } });
    if (!establishment) return null;
    return this.buildDto(establishment);
  }

  private async buildDto(establishment: Establishment): Promise<EstablishmentPublicDto> {
    const inspections = await this.inspectionRepo.find({
      where: { establishmentId: (establishment as any).id },
      relations: ['violations'],
      order: { submittedAt: 'DESC' },
      take: 5,
    });

    const openViolations = await this.violationRepo.find({
      where: { establishmentId: (establishment as any).id },
    });

    return {
      slug: establishment.slug,
      nameAr: establishment.nameAr,
      nameEn: establishment.nameEn,
      category: establishment.category,
      grade: establishment.currentGrade,
      score: establishment.currentScore,
      lastInspectionAt: establishment.lastInspectionAt
        ? establishment.lastInspectionAt.toISOString()
        : null,
      openViolations: openViolations
        .filter((v) => v.status === 'OPEN' || v.status === 'OWNER_RESPONDED')
        .map((v) => ({ category: v.category, ownerResponded: v.status === 'OWNER_RESPONDED' })),
      history: inspections.map((i) => ({
        date: i.submittedAt.toISOString(),
        grade: i.grade,
        violationCount: i.violations?.length ?? 0,
      })),
      status: establishment.status,
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- establishments.service`
Expected: PASS, both tests green.

- [ ] **Step 6: Write the failing controller test**

`apps/api/src/establishments/establishments.controller.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EstablishmentsController } from './establishments.controller';
import { EstablishmentsService } from './establishments.service';

describe('EstablishmentsController', () => {
  let controller: EstablishmentsController;
  const mockService = { getPublicBySlug: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [EstablishmentsController],
      providers: [{ provide: EstablishmentsService, useValue: mockService }],
    }).compile();
    controller = module.get(EstablishmentsController);
  });

  it('throws 404 when the establishment is not found', async () => {
    mockService.getPublicBySlug.mockResolvedValue(null);
    await expect(controller.getBySlug('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns the DTO when found', async () => {
    const dto = { slug: 'golden-oven-nablus' } as any;
    mockService.getPublicBySlug.mockResolvedValue(dto);
    expect(await controller.getBySlug('golden-oven-nablus')).toBe(dto);
  });
});
```

- [ ] **Step 7: Run to verify it fails, then implement the controller**

Run: `npm run test --workspace=apps/api -- establishments.controller`
Expected: FAIL — `EstablishmentsController` not defined.

`apps/api/src/establishments/establishments.controller.ts`:
```typescript
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { EstablishmentsService } from './establishments.service';
import { EstablishmentPublicDto } from './dto/establishment-public.dto';

@Controller('api/public/establishments')
export class EstablishmentsController {
  constructor(private readonly establishmentsService: EstablishmentsService) {}

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string): Promise<EstablishmentPublicDto> {
    const dto = await this.establishmentsService.getPublicBySlug(slug);
    if (!dto) throw new NotFoundException(`No establishment registered for slug "${slug}"`);
    return dto;
  }
}
```

- [ ] **Step 8: Register service and controller in the module, run all tests**

Update `apps/api/src/establishments/establishments.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from './establishment.entity';
import { Inspection } from './inspection.entity';
import { Violation } from './violation.entity';
import { EstablishmentsService } from './establishments.service';
import { EstablishmentsController } from './establishments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment, Inspection, Violation])],
  providers: [EstablishmentsService],
  controllers: [EstablishmentsController],
  exports: [EstablishmentsService],
})
export class EstablishmentsModule {}
```

Run: `npm run test --workspace=apps/api`
Expected: PASS, all tests green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/establishments
git commit -m "feat: GET /api/public/establishments/:slug endpoint"
```

---

## Task 6: Seed script

**Files:**
- Create: `apps/api/src/seed.ts`

**Interfaces:**
- Consumes: `Establishment`, `Inspection`, `Violation` entities; `scoreToGrade` from `@aman/shared`.
- Produces: at minimum the hero record (`الفرن الذهبي`, slug `golden-oven-nablus`) plus 2 more establishments, so the public page and history block are never empty during the demo.

> ponytail: 3 establishments, not the spec's eventual 15 (spec §13.1) — that full demo dataset (45 complaints, duplicate detection, 12-month history) belongs to the Week 4 "polish + demo" plan, once complaints and the risk engine exist to generate it against. Three records is enough to prove the vertical slice works end to end.

- [ ] **Step 1: Write the seed script**

`apps/api/src/seed.ts`:
```typescript
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Establishment } from './establishments/establishment.entity';
import { Inspection } from './establishments/inspection.entity';
import { Violation } from './establishments/violation.entity';

async function seed() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'aman',
    entities: [Establishment, Inspection, Violation],
    synchronize: true,
  });
  await dataSource.initialize();

  const establishmentRepo = dataSource.getRepository(Establishment);
  const inspectionRepo = dataSource.getRepository(Inspection);
  const violationRepo = dataSource.getRepository(Violation);

  await violationRepo.delete({});
  await inspectionRepo.delete({});
  await establishmentRepo.delete({});

  const goldenOven = await establishmentRepo.save({
    slug: 'golden-oven-nablus',
    nameAr: 'الفرن الذهبي',
    nameEn: 'Golden Oven',
    category: 'BAKERY',
    address: 'Old City, Nablus',
    currentGrade: 'B',
    currentScore: 82,
    lastInspectionAt: new Date('2026-08-05'),
    status: 'ACTIVE',
  });

  const inspection1 = await inspectionRepo.save({
    establishmentId: goldenOven.id,
    score: 82,
    grade: 'B',
    previousGrade: 'A',
    submittedAt: new Date('2026-08-05'),
  });
  const inspection2 = await inspectionRepo.save({
    establishmentId: goldenOven.id,
    score: 96,
    grade: 'A',
    previousGrade: 'B',
    submittedAt: new Date('2026-05-14'),
  });

  await violationRepo.save({
    inspectionId: inspection1.id,
    establishmentId: goldenOven.id,
    category: 'Refrigeration temperature above limit',
    severity: 'CRITICAL',
    status: 'OWNER_RESPONDED',
    respondedAt: new Date('2026-08-08'),
  });

  await establishmentRepo.save({
    slug: 'al-salam-restaurant',
    nameAr: 'مطعم السلام',
    nameEn: null,
    category: 'RESTAURANT',
    address: 'Rafidia, Nablus',
    currentGrade: 'C',
    currentScore: 68,
    lastInspectionAt: new Date('2026-05-06'),
    status: 'ACTIVE',
  });

  await establishmentRepo.save({
    slug: 'nour-bakery',
    nameAr: 'مخبز النور',
    nameEn: null,
    category: 'BAKERY',
    address: 'Downtown, Nablus',
    currentGrade: null,
    currentScore: null,
    lastInspectionAt: null,
    status: 'ACTIVE',
  });

  console.log('Seeded 3 establishments.');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the run script and execute it**

Add to `apps/api/package.json` scripts: `"seed": "ts-node src/seed.ts"` (add `ts-node` to devDependencies).

Run: `npm run seed --workspace=apps/api`
Expected: "Seeded 3 establishments." printed, no errors.

- [ ] **Step 3: Verify against the running API**

Run: `npm run dev:api` (separate terminal), then `curl http://localhost:3000/api/public/establishments/golden-oven-nablus`
Expected: JSON response with `grade: "B"`, `openViolations` containing the refrigeration entry with `ownerResponded: true`, `history` with 2 entries.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed.ts apps/api/package.json
git commit -m "feat: seed script with hero record + 2 supporting establishments"
```

---

## Task 7: QR code generation script

**Files:**
- Create: `apps/api/scripts/generate-qr.ts`

**Interfaces:**
- Consumes: `qrcode` npm package, a slug string, and a base URL.
- Produces: a PNG file the team can print and physically scan for the demo.

> ponytail: a single CLI script, not the full admin batch-print UI from spec §5.10 (A4 sheets, 6-up, municipality logo). That's a Week 4 admin-panel task. Week 1 only needs one scannable QR code to prove the public-page loop works.

- [ ] **Step 1: Write the script**

`apps/api/scripts/generate-qr.ts`:
```typescript
import QRCode from 'qrcode';
import { writeFileSync } from 'fs';

const slug = process.argv[2];
const baseUrl = process.argv[3] ?? 'http://localhost:4200';

if (!slug) {
  console.error('Usage: ts-node scripts/generate-qr.ts <slug> [baseUrl]');
  process.exit(1);
}

QRCode.toFile(`${slug}.png`, `${baseUrl}/e/${slug}`, { width: 400 }, (err) => {
  if (err) throw err;
  console.log(`Wrote ${slug}.png -> ${baseUrl}/e/${slug}`);
});
```

- [ ] **Step 2: Add the dependency and run it**

Add `qrcode` and `@types/qrcode` to `apps/api/package.json` dependencies/devDependencies.

Run: `npm install`, then `npx ts-node apps/api/scripts/generate-qr.ts golden-oven-nablus`
Expected: `golden-oven-nablus.png` written to disk, scannable, points to `http://localhost:4200/e/golden-oven-nablus`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/scripts apps/api/package.json
git commit -m "feat: QR code generation script for demo stickers"
```

---

## Task 8: Angular app scaffold with RTL default

**Files:**
- Create: `apps/web/package.json`, `apps/web/angular.json`, `apps/web/tsconfig.json`
- Create: `apps/web/src/index.html`
- Create: `apps/web/src/main.ts`
- Create: `apps/web/src/app/app.routes.ts`
- Create: `apps/web/src/app/app.component.ts`

**Interfaces:**
- Produces: an Angular dev server on `localhost:4200` with `dir="rtl" lang="ar"` set globally, ready for the establishment route in Task 9.

- [ ] **Step 1: Scaffold via Angular CLI**

Run: `npx -p @angular/cli ng new web --directory=apps/web --routing --style=css --ssr=false --standalone --skip-git`
Expected: Angular workspace created inside `apps/web`.

- [ ] **Step 2: Set RTL/Arabic as the default document state**

Edit `apps/web/src/index.html` — change `<html lang="en">` to:
```html
<html dir="rtl" lang="ar">
```

And add a self-hosted font `@font-face` in `apps/web/src/styles.css` (font files added when design work starts — for Week 1, reference a placeholder path so the pattern is established, not deferred to later retrofit):
```css
@font-face {
  font-family: 'IBM Plex Sans Arabic';
  src: url('/assets/fonts/IBMPlexSansArabic-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

body {
  font-family: 'IBM Plex Sans Arabic', sans-serif;
}
```

- [ ] **Step 3: Verify the dev server boots**

Run: `npm run start --workspace=apps/web` (or `ng serve` inside `apps/web`)
Expected: `http://localhost:4200` loads, page source shows `<html dir="rtl" lang="ar">`.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "chore: scaffold Angular app, RTL/Arabic as default document state"
```

---

## Task 9: GradeBadge component + establishment page

**Files:**
- Create: `apps/web/src/app/grade-badge/grade-badge.component.ts`
- Create: `apps/web/src/app/establishment/establishment.service.ts`
- Create: `apps/web/src/app/establishment/establishment.component.ts`
- Create: `apps/web/src/app/establishment/establishment.component.html`
- Modify: `apps/web/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `GET /api/public/establishments/:slug` from Task 5.
- Produces: the `/e/:slug` route rendering the full public page per spec §5.1: grade badge, last-inspected date, open violations, history, attribution line, empty states for never-inspected and not-found.

- [ ] **Step 1: Write the GradeBadge component**

`apps/web/src/app/grade-badge/grade-badge.component.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

const GRADE_COLORS: Record<string, string> = {
  A: '#1e8449',
  B: '#b7950b',
  C: '#ca6f1e',
  D: '#a93226',
};

@Component({
  selector: 'app-grade-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="grade-badge"
      [style.background-color]="color"
      [attr.aria-label]="grade ? 'الدرجة: ' + grade : 'لم يتم التفتيش بعد'"
    >
      {{ grade ?? '—' }}
    </div>
  `,
  styles: [
    `.grade-badge {
      width: 96px;
      height: 96px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 48px;
      font-weight: bold;
      border-radius: 12px;
      margin: 0 auto;
    }`,
  ],
})
export class GradeBadgeComponent {
  @Input() grade: 'A' | 'B' | 'C' | 'D' | null = null;

  get color(): string {
    return this.grade ? GRADE_COLORS[this.grade] : '#9e9e9e';
  }
}
```

- [ ] **Step 2: Write the establishment service**

`apps/web/src/app/establishment/establishment.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EstablishmentPublicDto {
  slug: string;
  nameAr: string;
  nameEn: string | null;
  category: string;
  grade: 'A' | 'B' | 'C' | 'D' | null;
  score: number | null;
  lastInspectionAt: string | null;
  openViolations: { category: string; ownerResponded: boolean }[];
  history: { date: string; grade: string; violationCount: number }[];
  status: string;
}

@Injectable({ providedIn: 'root' })
export class EstablishmentService {
  private readonly baseUrl = 'http://localhost:3000/api/public/establishments';

  constructor(private http: HttpClient) {}

  getBySlug(slug: string): Observable<EstablishmentPublicDto> {
    return this.http.get<EstablishmentPublicDto>(`${this.baseUrl}/${slug}`);
  }
}
```

- [ ] **Step 3: Write the establishment page component**

`apps/web/src/app/establishment/establishment.component.ts`:
```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GradeBadgeComponent } from '../grade-badge/grade-badge.component';
import { EstablishmentPublicDto, EstablishmentService } from './establishment.service';

@Component({
  selector: 'app-establishment',
  standalone: true,
  imports: [CommonModule, GradeBadgeComponent],
  templateUrl: './establishment.component.html',
})
export class EstablishmentComponent implements OnInit {
  establishment: EstablishmentPublicDto | null = null;
  notFound = false;

  constructor(private route: ActivatedRoute, private service: EstablishmentService) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug')!;
    this.service.getBySlug(slug).subscribe({
      next: (data) => (this.establishment = data),
      error: () => (this.notFound = true),
    });
  }
}
```

`apps/web/src/app/establishment/establishment.component.html`:
```html
<div *ngIf="notFound" class="empty-state">
  <p>هذا الرمز غير مسجل — This code is not registered.</p>
</div>

<div *ngIf="establishment as e">
  <app-grade-badge [grade]="e.grade"></app-grade-badge>
  <h1>{{ e.nameAr }}</h1>

  <p *ngIf="e.lastInspectionAt">
    آخر تفتيش: <span dir="ltr">{{ e.lastInspectionAt | date:'yyyy-MM-dd' }}</span>
  </p>
  <p *ngIf="!e.lastInspectionAt">لم يتم التفتيش بعد — not yet inspected.</p>

  <div *ngIf="e.status === 'SUSPENDED' || e.status === 'CLOSED'" class="closed-banner">
    هذا المنشأة مغلقة أو موقوفة.
  </div>

  <section *ngIf="e.openViolations.length > 0">
    <h2>مخالفة مفتوحة قيد الإصلاح</h2>
    <div *ngFor="let v of e.openViolations">
      <p>{{ v.category }}</p>
      <p *ngIf="v.ownerResponded">تم رد صاحب المنشأة</p>
    </div>
  </section>

  <section>
    <h2>سجل التفتيش</h2>
    <div *ngFor="let h of e.history">
      <span dir="ltr">{{ h.date | date:'yyyy-MM-dd' }}</span>
      — {{ h.grade }} — {{ h.violationCount }} مخالفة
    </div>
  </section>

  <footer *ngIf="e.status !== 'SUSPENDED' && e.status !== 'CLOSED'">
    <a [routerLink]="['/e', e.slug, 'complaint']">إرسال شكوى</a>
  </footer>

  <p class="attribution">الدرجة صادرة عن بلدية نابلس · Grade issued by Nablus Municipality</p>
</div>
```

- [ ] **Step 4: Wire the route and HttpClient provider**

`apps/web/src/app/app.routes.ts`:
```typescript
import { Routes } from '@angular/router';
import { EstablishmentComponent } from './establishment/establishment.component';

export const routes: Routes = [
  { path: 'e/:slug', component: EstablishmentComponent },
];
```

Ensure `apps/web/src/app/app.config.ts` includes `provideHttpClient()` alongside `provideRouter(routes)`.

- [ ] **Step 5: Manual verification against the real API**

Run: `npm run dev:api` and `npm run dev:web` in two terminals, then open `http://localhost:4200/e/golden-oven-nablus`
Expected: grade badge shows "B" in the correct amber colour, name renders in Arabic RTL, refrigeration violation shows with "owner responded", history shows both inspections, attribution line is present. Then open `http://localhost:4200/e/nour-bakery` and confirm the never-inspected empty state (grey "—" badge, "لم يتم التفتيش بعد") renders instead of a fake grade. Then open `http://localhost:4200/e/does-not-exist` and confirm the not-found message renders.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app
git commit -m "feat: public establishment page, RTL, grade badge, empty/not-found states"
```

---

## Week 1 Definition of Done

- [ ] `npm run test --workspace=packages/shared` passes — grading algorithm fully covered, including the critical-failure override.
- [ ] `npm run test --workspace=apps/api` passes — service and controller tests green.
- [ ] Seeded data loads via `npm run seed --workspace=apps/api`.
- [ ] `/e/golden-oven-nablus` renders correctly end to end (grade, violations, history, attribution).
- [ ] `/e/nour-bakery` shows the never-inspected empty state, not a fake grade.
- [ ] `/e/does-not-exist` shows the not-found message.
- [ ] A generated QR PNG scans on a phone and opens the correct page.
- [ ] `<html dir="rtl" lang="ar">` confirmed in rendered page source.

---

## Roadmap: Weeks 2–4 (to be written as separate plans when reached)

**Week 2 — Inspection (spec §12):** checklist data model + seed 25 items (with proper `checklist_versions`/`checklist_items`, replacing Week 1's simplified `violation.category` string) · inspector login/JWT auth/roles (first time auth is actually needed) · queue UI · checklist UI consuming `calculateScore` from `@aman/shared` · photo capture with EXIF stripping · offline IndexedDB via Dexie.js · review/submit with idempotency key.

**Week 3 — The loop (spec §12):** complaint form + tracking · Risk Score engine (§6.2) + unit tests in `@aman/shared` · queue sorted by risk with factor breakdown · admin complaint triage with duplicate detection · owner portal + fix verification. This is where the "admin cannot write grades" invariant (spec §3.1, §6.3) gets its enforcement test.

**Week 4 — Polish + demo (spec §12):** admin dashboard/charts · offline sync hardening (exponential backoff, conflict handling) · full RTL audit on every screen at 375px · realistic seed dataset (15 establishments, 45 complaints per spec §13.1) · QR batch-print sheet · rehearse the 8-minute demo script (spec §13) twice end to end.
