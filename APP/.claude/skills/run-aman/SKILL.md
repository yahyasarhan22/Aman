---
name: run-aman
description: Launch and smoke-test the Aman app locally (NestJS API + Angular web + MySQL). Use when asked to run, start, or verify the app is working.
---

# Running Aman locally

Monorepo: `packages/shared` (framework-free TS, built to `dist/`), `apps/api`
(NestJS 10 + TypeORM + MySQL 8), `apps/web` (Angular 22, zoneless).
`apps/api` and `apps/web` both depend on `@aman/shared` via npm workspaces
(symlinked into `node_modules/@aman/*`).

## Prerequisites

- Node.js 20+, npm
- MySQL 8 running locally and reachable with the credentials in `apps/api/.env`
  (copy from `apps/api/.env.example` if missing — see root `README.md`)

Check MySQL is up (Windows):

```bash
powershell.exe -NoProfile -Command "Get-Service -Name '*mysql*' | Select Name,Status"
```

## Known gotcha: stale workspace symlinks after moving/renaming the repo

If `apps/api` fails to compile with a wall of
`Cannot find module '@aman/shared' or its corresponding type declarations.`
errors, `node_modules/@aman/shared` and `node_modules/@aman/api` are almost
certainly symlinks left over from *before* the repo was moved or restructured
(e.g. the "struct the files" reorg into this `APP/` subfolder). Confirm:

```bash
ls -la node_modules/@aman
```

If the symlink targets don't resolve to paths under the current repo root,
fix it with a clean reinstall (do **not** try to hand-patch the symlinks):

```bash
rm -rf node_modules && npm install
```

## Steps

1. Install deps (skip if `node_modules/` already present and healthy):
   ```bash
   npm install
   ```
2. Build the shared package — both apps import compiled `dist/` output from it,
   so this must happen before either dev server, and after any shared-package edit:
   ```bash
   npm run build:shared
   ```
3. Seed demo data (safe to re-run; wipes + re-seeds demo rows only, preserves
   saved risk-weight config):
   ```bash
   npm run seed
   ```
4. Start API and web in separate background processes:
   ```bash
   npm run dev:api    # NestJS on http://localhost:3000 (routes under /api/*)
   npm run dev:web    # Angular on http://localhost:4200
   ```

## Verify it's actually running

Don't stop at "the process started" — confirm both servers actually serve
traffic and the DB round-trip works:

```bash
curl -s http://localhost:4200/ -o /dev/null -w "web: %{http_code}\n"

curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nablus.ps","password":"aman1234"}' \
  -w "\nlogin http: %{http_code}\n"
```

Expect `web: 200` and `login http: 201` with an `accessToken` in the body.
A 404/connection-refused on the API root is fine (no route mounted there);
the login call is the real health check since it touches MySQL end-to-end.

## Demo logins

All seeded accounts use password `aman1234`:

| Role | Email |
|---|---|
| Inspector | `inspector@nablus.ps` |
| Admin | `admin@nablus.ps` |
| Owner (Golden Oven) | `owner@golden-oven.ps` |

Public pages (`/`, `/e/:slug`, complaint form/tracking) need no login.
