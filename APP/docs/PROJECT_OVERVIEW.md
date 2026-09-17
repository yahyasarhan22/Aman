# أمان (Aman) — Project Overview & Tutorial

This document explains, end to end, what was built, how it works, and how to use it — for
anyone joining the project cold: a teammate, a judge, or future you.

---

## 1. What problem this solves

In Nablus (and Palestinian municipalities generally), food safety inspection results are
invisible to the public. A restaurant could have failed its last three inspections and a
customer would have no way to know before walking in. Meanwhile, inspectors work from paper
checklists and visit establishments in whatever order they've always visited them — not
necessarily the ones that most need a visit right now.

Aman closes both gaps with one system:

1. **Citizens** can see a restaurant's real hygiene grade before they order, and can report a
   problem in under a minute.
2. **Inspectors** get a daily list ordered by actual risk, not habit, and do the inspection on
   a phone that works with no signal.
3. **Owners** get told exactly what's wrong and how to fix it, and can prove they fixed it
   without waiting for someone to notice.
4. **The municipality** gets a dashboard of the whole city's risk picture and a paper trail for
   every decision.

**The one rule everything else is built around: Aman never issues a grade.** Only a submitted
inspection can write a grade — not an admin, not a complaint. This is enforced in the backend
service layer, not just the UI, and there's a dedicated test (`grade-integrity.spec.ts`) whose
entire job is to fail loudly if that boundary is ever crossed. A complaint can only ever move an
establishment up the inspection *queue* — it cannot touch the grade itself. This matters
legally: only the municipality holds inspection authority, so Aman is positioned as a tool the
authority uses, never as a private certifier.

---

## 2. Tech stack, and why

| Layer | Choice | Why |
|---|---|---|
| Shared logic | Plain TypeScript (`packages/shared`) | The risk-scoring formula and grading logic run byte-identical on the server and inside the offline inspector app. If this were duplicated in two languages/codebases, they would eventually disagree — and a disagreement between "what the app calculated offline" and "what the server calculated" is the kind of bug nobody notices until an inspector's numbers don't match. |
| Backend | NestJS 10 + TypeORM + MySQL 8 | Structured, testable service layers with dependency injection — needed because a lot of this system's correctness lives in *rules being enforced somewhere specific* (only inspections write grades, complainant identity never reaches an owner, audit log is append-only). Nest makes "which class is responsible for enforcing this" an explicit, testable question. |
| Frontend | Angular 22, standalone components, signals, zoneless change detection | Arabic RTL is the default UI direction for every screen across four different roles, with an offline-capable inspector app as one of those roles — Angular's built-in router guards, forms, and change detection cover all of that without extra libraries. Signals + zoneless CD keep the reactivity model simple to reason about. |
| Database | MySQL 8 | Relational integrity matters here — a violation belongs to exactly one inspection, a complaint belongs to exactly one establishment, an audit row must never be edited. Foreign keys and transactions do real work. |
| Offline storage (inspector app) | IndexedDB, hand-rolled thin wrapper | The inspector app must survive a full day with no signal: draft inspections, an outbox of unsent submissions, and downloaded photos all live in IndexedDB until connectivity returns. |

No external AI/ML API, no cloud vendor lock-in, no CDN-hosted fonts (self-hosted Arabic font,
for both reliability on poor connections and digital sovereignty — a foreign cloud dependency
that could be blocked is a real weakness for a municipal system). Everything can run entirely
on a local machine or a self-hosted server.

---

## 3. Is there "AI" in this, and what kind

Honest answer: **no machine-learning model, and that's a deliberate design choice, not a gap.**

The brief that this project answers explicitly rules out an ML risk model. The reasoning: an
inspector who gets sent to a restaurant must be able to explain *why* to that restaurant's
owner, and an owner who sees their establishment ranked high must be able to understand and
challenge that ranking. A black-box model can't give either of those people a real answer. A
transparent, weighted formula can — every number the queue shows can be traced back to a
specific violation, a specific complaint, a specific number of days.

So what Aman actually has is **rule-based decision logic**, engineered carefully enough that it
does the job an ML model would otherwise be reached for:

- The **Risk Score** (§4 below) is a weighted formula over four measurable factors, tunable live
  by an admin, with every contributing factor shown next to the ranking it produced.
- The **grading algorithm** applies a deterministic point system with a critical-failure
  override (a single critical failure structurally caps a grade at C, no matter how well
  everything else scored) — again fully explainable, not learned.
- **Violation recommendations** are not generated by a language model — they come from
  per-checklist-item template strings stored in the database (e.g. *"Get valid health cards for
  all staff within {deadline}."*), with the deadline filled in per violation. This means the
  municipality can edit exactly what advice an owner receives without redeploying code, and
  every recommendation an owner sees is guaranteed to make sense (a template, not a generation
  that could hallucinate).
- **Complaint deduplication** (grouping repeat complaints about the same establishment and
  category within a 72-hour window into one) is a fixed time-window rule, not a similarity
  model.

If you're presenting this and get asked "where's the AI," the honest and defensible answer is:
*we deliberately chose an explainable rules engine over an ML model, because in a regulatory
system the people affected by a decision need to be able to understand and contest it — that
was a design decision, not a shortcut.*

---

## 4. The two algorithms, in full

### 4.1 Grading — `calculateScore()` / `scoreToGrade()` (`packages/shared/src/grading.ts`)

Each checklist item has a severity: **CRITICAL** (10 points), **MAJOR** (5 points), or
**MINOR** (2 points). During an inspection every item is marked PASS, FAIL, or N/A.

```
score = round( (points earned from PASSed items) / (points available from PASS+FAIL items) × 100 )
```

N/A items don't count toward either side — they simply don't apply to that establishment.

**Critical-failure override:** no matter how high the raw percentage comes out,
- 1+ critical failures caps the score at **79** (can never reach an A or B)
- 3+ critical failures caps the score at **59** (forces a D)

This exists because a restaurant that aces 24 out of 25 checklist items but fails "cold storage
held below 4°C" is not safe to eat at, and a purely arithmetic score could still hand it a B.

Grade bands: **A** ≥ 90, **B** ≥ 80, **C** ≥ 60, **D** below that.

### 4.2 Risk Score — `calculateRisk()` (`packages/shared/src/risk.ts`)

This is what orders the inspector's daily queue. Four factors, each normalized to 0–100, each
multiplied by an admin-configurable weight (defaults: Prior Violations 40%, Complaint Pressure
30%, Time Since Inspection 20%, Category 10% — must always sum to 100):

1. **Prior Violations** — every violation in the last 12 months contributes its severity points,
   linearly decayed to zero as it approaches the 12-month mark (an old violation matters less
   than a fresh one), scaled onto the 0–100 band.
2. **Complaint Pressure** — complaints from the last 90 days, deduplicated (same establishment +
   same category within 72 hours count once, keeping the strongest evidence from the group),
   weighted 3× for a documented complaint (has a photo/receipt) vs 1× for an undocumented one.
3. **Time Since Inspection** — days since the last inspection, saturating at 180 days (never
   inspected = maximum, treated as if 365 days had passed).
4. **Category** — a fixed base risk per establishment type: Butcher 100, Restaurant 80, Bakery
   60, Cafe 40, Retail 20 (raw food handling carries structurally more risk than packaged goods).

```
total = round( Σ (normalized_factor × weight / 100) )
```

The queue and the admin planning screen never show just the number — every entry shows the four
factors that produced it, in Arabic, e.g. *"3 complaints in the last 90 days, 2 with attached
evidence"*. Risk bands: **HIGH** ≥ 70, **MEDIUM** 40–69, **LOW** below 40.

A complaint raises factor #2 and therefore the total — it never touches the grade (§1).

---

## 5. Data flow — the core loop

```
Citizen files a complaint on establishment X
        ↓
Complaint Pressure factor rises for X (once deduplicated against recent duplicates)
        ↓
X's Risk Score rises → X moves up the inspector's queue
        ↓
Inspector visits X, fills the offline checklist, submits
        ↓
calculateScore() runs → grade computed → violations created for each FAIL
        ↓
X's public page updates immediately with the new grade + open violations
        ↓
Owner sees the violations + auto-filled recommendations, uploads proof of a fix
        ↓
Inspector/admin verifies the fix → violation closes → next Risk Score recalculation reflects it
```

Every step in that chain writes to the append-only **audit log** (`AUDIT_ACTIONS`: grade
changes, complaint decisions, risk-weight changes, role changes, violation verification, and
more) — nothing in that table can be edited or deleted, even by an admin. If a decision is ever
challenged, this is the record that answers it.

---

## 6. What each user can do

### 6.1 Citizen (no login required)

- **`/`** — search or browse establishments.
- **`/e/:slug`** — an establishment's public page: current grade badge (A/B/C/D), last
  inspection date, any open violations with their recommendations, and an explicit line stating
  the grade was issued by the municipality (never omitted — the system must never look like it
  is the certifying body itself).
- **`/e/:slug/complaint`** — file a complaint: pick a category (hygiene, expired product,
  refrigeration, staff conduct, pests, other), a description, an optional photo (EXIF metadata —
  including GPS — is stripped from every uploaded photo before it's stored, so a complainant's
  location is never leaked). No login, no phone number exposed to the establishment.
- **`/complaint/track`** and **`/complaint/:ref`** — check a complaint's status later using the
  reference number given at submission (`SUBMITTED → UNDER_REVIEW → ASSIGNED → INSPECTED →
  CLOSED`, or `DUPLICATE`/`REJECTED` with a reason).

A complainant's identity is never exposed to the establishment owner or the inspector — this is
a structural rule, not a UI choice.

### 6.2 Inspector (`/app/*`, requires login)

- **`/app/today`** — the day's queue: establishments ranked by Risk Score, each showing its
  score, band (HIGH/MEDIUM/LOW), and the factor breakdown explaining why it's ranked there.
- **`/app/inspect/:id`** — the 25-item, 5-section digital checklist (personal hygiene,
  temperature control, storage & expiry, premises cleanliness, pest control), each item marked
  PASS/FAIL/N/A, with photo attachment and measured-value entry (e.g. an actual fridge
  temperature reading) where the item calls for it. Works **fully offline** — the whole
  inspection record lives in IndexedDB until it's submitted.
- **`/app/inspect/:id/review`** — before submitting: see the computed grade and how it changed
  from the previous one, every failed item with its auto-filled recommendation and compliance
  deadline (deadlines are shorter for CRITICAL items), and a signature pad.
- **`/app/sync`** — the offline outbox: any inspection that couldn't reach the server (no
  signal, a flaky connection, a 500) sits here and **retries automatically** with exponential
  backoff (5s → 10s → 20s → capped at 5 minutes), up to 3 automatic attempts before it waits for
  the inspector to hit Retry manually. Submissions are idempotent by a client-generated ID, so a
  retried submission after the server actually received it the first time comes back labeled
  "already delivered" instead of creating a duplicate inspection.

### 6.3 Establishment owner (`/portal`, requires login)

- See every open violation on their establishment, each with the plain-language recommendation
  and the compliance deadline.
- Upload proof of a fix (a photo) against a specific violation, which flips it to
  "awaiting inspector verification" — a re-verification request, not a self-certified fix. Only
  an inspector/admin action actually closes the violation.
- See their establishment's inspection history and current public-facing grade — exactly what a
  citizen sees, so there's no surprise.

### 6.4 Admin (`/admin/*`, requires login + ADMIN role)

- **`/admin/dashboard`** — city-wide KPIs (registered establishments, how many are currently
  high-risk, complaints this month, average days to close a violation), a grade-distribution
  chart, a 10-week complaints trend chart, and a "needs attention" list: complaints stuck
  unsettled >7 days, violations past their deadline, and establishments not inspected in >90
  days (or never inspected at all).
- **`/admin/complaints`** — triage every incoming complaint: assign to an inspector, mark as a
  duplicate of an existing one, reject with a required reason, or close it out. Every action is
  audit-logged.
- **`/admin/planning`** — the same risk-ranked queue an inspector sees, for planning inspection
  routes/assignments at the municipality level.
- **`/admin/settings`** — live-adjust the four Risk Score weights (must sum to 100; the UI
  blocks saving otherwise). A change here **immediately** recalculates every establishment's
  ranking — it doesn't wait for the next unrelated event to trigger a recompute.
- **`/admin/qr`** — a print-ready sheet of QR codes for every active establishment (6 per A4
  page), each linking straight to that establishment's public page — this is what actually gets
  stuck on a restaurant's door in the real world.

---

## 7. Security & integrity rules worth knowing

- **Only a submitted inspection can write a grade.** Enforced structurally (no other service
  exposes a grade-writing method) and covered by a dedicated regression test.
- **Complainant identity is never exposed** to an owner or inspector.
- **Photo EXIF metadata (including GPS) is stripped on upload**, hand-rolled by walking the JPEG
  marker table rather than pulling in a metadata library for one format.
- **File type is verified by magic bytes, never by filename** — you cannot rename a file to fake
  its way past the upload check.
- **The audit log is append-only** — no update or delete path exists for it, not even for an
  admin.
- **Submissions are idempotent** by a client-generated ID, so retrying a submission (offline
  sync, a flaky network) can never create a duplicate inspection.
- Environment secrets (`JWT_SECRET`, `CONTACT_ENCRYPTION_KEY`, DB credentials) live in a
  git-ignored `.env`, never committed.

---

## 8. Testing

190 automated tests across three packages, all green as of the last commit:

| Package | What it covers | Tests |
|---|---|---|
| `packages/shared` | Grading, risk scoring, Arabic pluralization/formatting, checklist logic | 52 |
| `apps/api` | Every service (complaints, establishments, risk, admin, settings, owner, audit, uploads/EXIF, QR), plus the grade-integrity structural test | 114 |
| `apps/web` | Component behavior across public, inspector, and admin screens; the offline-sync retry/backoff logic | 24 |

Run them: `npm run test:shared`, `npm run test:api`, `npm run test --workspace=apps/web`.

---

## 9. Where to look for more detail

- `README.md` (repo root) — setup, environment variables, seeding, running both apps, demo
  logins.
- `Aman_Web_Build_Spec.pdf` — the full 22-page build spec this project implements (roles &
  permissions, complete route map, screen-by-screen behavior, the algorithms with worked
  examples, data model, API endpoints, offline strategy, design system, security rules, the
  4-week build order, and the demo script).
- `docs/superpowers/plans/2026-08-20-aman-week4-polish-and-demo.md` — the detailed task-by-task
  plan for the final polish week (dashboard, offline hardening, RTL audit, demo dataset, QR
  sheet, settings screen).
