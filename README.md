# أمان (Aman)

A food-safety inspection transparency platform built for Nablus Municipality. Citizens scan a QR sticker to see a restaurant's public hygiene grade and file complaints; inspectors work a risk-ranked, offline-capable digital checklist; owners see violations and upload proof of fixes; admins triage complaints, adjust risk weights, and plan inspections from a dashboard.

Built for a Palestinian municipal innovation hackathon (Challenge #8: food safety, public health, and consumer protection). Prototype, not production software — see [Scope](#scope) below.

**The one rule that governs the whole system: Aman never issues a grade — only a submitted inspection can, and only the municipality inspects. Complaints move the inspection queue, never the grade.**

## Stack

- `packages/shared` — framework-free TypeScript: the risk-scoring formula and grading logic, shared byte-for-byte between the API and the offline inspector app so they can never drift apart.
- `apps/api` — NestJS 10 + TypeORM + MySQL 8.
- `apps/web` — Angular 22, standalone components, signals, zoneless change detection. Arabic RTL is the default state (`dir="rtl" lang="ar"`), not a toggle.

## Prerequisites

- Node.js 20+ and npm
- MySQL 8 running locally (or reachable) with an empty database created for the app

## Setup

```bash
npm install
```

Copy the API environment file and adjust it for your local MySQL instance:

```bash
cp apps/api/.env.example apps/api/.env
```

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=aman
JWT_SECRET=aman-dev-secret-change-me
CONTACT_ENCRYPTION_KEY=aman-dev-contact-key-change-me
```

Change `JWT_SECRET` and `CONTACT_ENCRYPTION_KEY` to real random values for anything beyond a local demo — the checked-in defaults are dev-only placeholders.

Seed the database with a demo dataset (15 establishments, 45 complaints, 3 users — spread across all grades and categories so the risk queue and admin dashboard both have something meaningful to show):

```bash
npm run seed
```

Safe to re-run — it wipes and re-seeds demo data every time without leaving duplicates. It does *not* wipe a persisted risk-weight configuration saved via the admin settings screen; it reads and respects it instead.

## Running it

```bash
npm run dev:api   # NestJS on http://localhost:3000
npm run dev:web   # Angular on http://localhost:4200
```

Run both in separate terminals.

## Demo logins

All seeded accounts use the password `aman1234`.

| Role | Email |
|---|---|
| Inspector | `inspector@nablus.ps` |
| Admin | `admin@nablus.ps` |
| Owner (of الفرن الذهبي / Golden Oven) | `owner@golden-oven.ps` |

The public pages (`/`, `/e/:slug`, complaint form and tracking) need no login.

## Tests

```bash
npm run test:shared
npm run test:api
npm run test --workspace=apps/web
```

Or `npm test` for shared + API together. All three suites are green as of the last commit (52 + 114 + 24 tests).

## Scope

Deliberately out of scope for this prototype (see the challenge brief): native mobile apps (the web app is an installable PWA instead), payments, a machine-learning risk model (the weighted formula is explainable by design — an inspector must be able to justify a visit), any certificate or badge issued under the Aman brand, multi-municipality tenancy, and public star ratings or free-text reviews (this is a regulatory tool, not a review site).
