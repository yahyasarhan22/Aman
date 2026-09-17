# Aman — Week 2: the inspection loop

**Deliverable (spec §12):** a full inspection can be completed on a phone, offline, and the grade it produces appears on the public page.

Week 1 shipped the public page over seeded data. Week 2 makes that data real: an inspector logs in, works a risk-ordered queue, fills a 25-item checklist with no connectivity, signs, submits, and the public QR page reflects the new grade.

---

## What runs

```
packages/shared     grading · checklist rules · Arabic pluralisation   (no framework deps)
apps/api            NestJS + TypeORM + MySQL
apps/web            Angular 22, standalone + signals, zoneless, RTL-first
```

### Commands

```bash
npm run seed        # reset the database to demo state (idempotent)
npm run dev:api     # http://localhost:3000
npm run dev:web     # http://localhost:4200
npm test            # 49 tests: shared (29) + api (20)
npm run build       # production build of all three packages
```

**Inspector login:** `inspector@nablus.ps` / `aman1234`
**Admin login:** `admin@nablus.ps` / `aman1234` (no admin screens yet — Week 4)

---

## Routes added

| Route | Screen |
| --- | --- |
| `/` | Front door: QR target + inspector entrance |
| `/app/login` | Inspector sign-in |
| `/app/today` | Risk-ordered queue with visible reasons |
| `/app/inspect/:id` | The checklist — offline, autosaving |
| `/app/inspect/:id/review` | Failures, recommendations, signature, submit |
| `/app/sync` | Outbox of queued submissions |

## Endpoints added

| Method | Endpoint | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/login` | JWT, 12h. 5 failures → 15-minute lockout (§11) |
| `GET` | `/api/inspector/queue` | Sorted by risk, each entry carries its reasons |
| `GET` | `/api/inspector/establishments/:id/bundle` | Everything the offline app needs, in one call |
| `POST` | `/api/inspector/inspections` | Idempotent on `clientId`. **The only path that writes a grade.** |
| `POST` | `/api/uploads` | Magic-byte validated, EXIF stripped, 5MB cap |

---

## The rules that are enforced, not just documented

- **Only an inspection writes a grade** (§3.1, §6.3, §11). `InspectorService.submitInspection` is the single writer of `establishment.currentGrade`. `grade-integrity.spec.ts` asserts no other service exposes a grade-writing or mutating method, and fails loudly if a later week adds one.
- **A critical failure requires a photo** (§5.5). Blocked in the UI *and* re-checked server-side, because the client is the side an inspector could work around. Verified live: the server returns 400.
- **A partial sheet is refused, never scored.** Answer count must equal the checklist version's item count.
- **Retries cannot double-grade** (§8.2). Three identical POSTs with one `clientId` returned one inspection id and wrote one grade — verified against the live API.
- **EXIF never lands on disk.** The browser re-encodes through a canvas (which discards metadata and compresses to ≤200KB / 1600px), and the server strips every APPn and comment segment again. Verified on a stored file: markers are `DQT, SOF0, DHT, SOS` only, no `Exif`, no `JFIF`.
- **Grade colours are reserved for grades** (§10.2). Risk uses a darker desaturated family; "needs attention" has its own `--attention` token. Nothing else may use `--grade-*`.

## Arabic correctness

The spec treats Arabic as the primary language, so two classes of bug got real fixes rather than being left to look "close enough":

- **Counts inflect.** `arabicCount` in `@aman/shared` selects between zero / singular / dual / 3–10 plural / 11+ forms. `1 مخالفة مفتوحة` is wrong; `مخالفة واحدة مفتوحة` is right, and `خلال 2 يوماً` is now `خلال يومان`. Used by both the API (queue reasons) and the web app.
- **Numerals stay LTR.** Values substituted into stored Arabic text are wrapped in Unicode bidi isolates (`U+2066…U+2069`) — the plain-text equivalent of `<span dir="ltr">`, needed because these strings are built server-side and stored as text. Without it the freezer threshold `-18` rendered as `18-`.

All UI copy lives in `apps/web/src/app/core/strings.ts` (§12.1). No Arabic literals in components.

---

## Deliberate shortcuts (`ponytail:` in source)

- **Queue ranking is a proxy, not the Risk Score.** Week 2 ranks on time-since-inspection plus open violations. The weighted §6.2 formula — prior violations, complaint pressure, category risk — is Week 3 and replaces one function; the DTO and the queue UI already speak in `risk` + `reasons`, so nothing above it changes. *Consequence for the demo:* الفرن الذهبي currently ranks #4, not #1. It reaches #1 once complaint pressure exists.
- **Login lockout counts in process memory.** Fine for one API process; needs a shared store if it is ever run with more than one worker.
- **No Dexie.** `core/idb.ts` is a ~40-line key/value wrapper over IndexedDB. Drafts, the outbox, the cached queue and photo Blobs are all values under a prefixed key, which is the whole requirement.
- **No bcrypt.** `node:crypto` scrypt — same job, no native build step on Windows.
- **Photo ids are a comma-separated column,** not a join table. At a handful of photos per line, a table costs more than it returns.

## Not built this week (by design)

Complaints, the Risk Score engine, owner portal, admin dashboard, QR batch printing. All Week 3–4 per §12. The public page shows the complaint affordance as "coming soon" rather than a dead button.

Sync hardening is partial: the outbox retries on reconnect and on manual retry, and surfaces attempt counts and errors. Exponential backoff (§9) is Week 4.

---

## Gotcha worth knowing

`@aman/shared` ships CommonJS, so Vite used to prebundle and cache it — edits to `packages/shared` were silently ignored by the running dev server until the cache was deleted by hand. `apps/web/angular.json` now sets `serve.options.prebundle.exclude: ["@aman/shared"]`. Verified: a string changed in `shared` reaches the running server after `npm run build:shared`, with no restart.
