# Prompt for Claude Code CLI — Aman Project

> Copy everything below the line into Claude Code, with `Aman_Web_Build_Spec.pdf` in the project folder.
> Claude will open with questions about your team before recommending anything — answer them and the stack discussion follows from there.

---

## Context

I'm on a student team competing in a Palestinian municipal innovation hackathon organized around 18 challenges from a "Techno Park" challenge brief. We're building **"أمان" (Aman)** for **Challenge #8: food safety inspection, public health, and consumer protection**. Our target city is **Nablus**, and we're also folding in two adjacent challenges from the same brief: the citizen complaints challenge and the proactive municipal communication challenge.

The hackathon judges on: real social impact, a practical MVP that could actually be deployed, meaningful AI use, a sustainable business model, and above all **"quick wins"** — high impact, low effort, deployable fast. Deliverables include a working prototype and a pitch. **We have roughly 4 weeks and this is a prototype, not production software.**

## What Aman is

A food safety transparency platform with four user types sharing one system:

- **Citizens** scan a QR sticker on a restaurant door and see its public hygiene grade (A/B/C/D), last inspection date, and open violations. They can file a complaint with a photo and track its status.
- **Inspectors** (municipality employees) get a daily visit queue ranked by a transparent **Risk Score**, and fill a digital checklist that works fully offline, replacing paper forms.
- **Establishment owners** see their violations with concrete improvement recommendations, upload proof of fixes, and request re-verification.
- **Municipality admins** get a dashboard, complaint triage, risk-ranked inspection planning, and QR generation.

The core loop: citizen complains → Risk Score rises → establishment moves up the inspection queue → inspector visits → grade updates → public QR page reflects it immediately.

## The one constraint that governs every decision

**Aman never issues a grade. The municipality does.**

In Palestine, food inspection authority is shared between the Ministry of Health and municipalities — there is no legal basis for a private company to inspect or certify. So we deliberately positioned Aman as a **tool used by the authority that already holds the power**, not as a replacement or a private certifier. This also avoids the conflict-of-interest trap where the inspected business pays the certifier.

Practical consequences you must respect throughout the codebase:

- Every public page carries an attribution line: the grade is issued by the municipality.
- **Only a submitted inspection can write a grade.** Not admins, not complaints. Enforce this in the service layer and cover it with a test.
- A complaint changes the **queue order**, never the grade.
- Complainant identity is never exposed to owners or inspectors, and photo EXIF must be stripped on upload.

If a screen or an API response ever makes it look like Aman is the certifying body, that's a bug, not a styling choice.

## The reference document

I'm giving you a build spec PDF: **`Aman_Web_Build_Spec.pdf`** (22 pages). Read it fully before responding. It contains:

- §3 roles and a permission matrix
- §4 complete route map for all four roles
- §5 screen-by-screen specs with mockups, behaviour rules, and empty/edge states
- §6 the algorithms — grading with a critical-failure override, the weighted Risk Score with a worked example, complaint and violation state machines
- §7 data model, §8 API endpoints
- §9 offline strategy, §10 design system, §11 security rules
- §12 a 4-week build order, §13 a demo script

**Treat §5, §6, §7 as the product requirements — the behaviour, algorithms, and data relationships are decided and I don't want them redesigned.** But see the next section about the stack.

## What I want from you FIRST — do not write code yet

The spec proposes a stack in §2 (React + Vite, Express, PostgreSQL, Prisma). **I want to reconsider this.** I'm not attached to it, and I'd rather pick deliberately than inherit a default.

So your first task is a **stack discussion, not implementation**. Specifically:

1. **Start by asking me questions — this is your entire first response.** Don't recommend anything yet, and don't assume answers. Ask me about whatever would actually change your recommendation. At minimum I'd expect you to want to know:

   - How many of us there are, and what languages/frameworks we're each comfortable with
   - Whether anyone has real backend and database experience, or if we're all frontend-leaning
   - Where this gets deployed — a university server, a VPS, or just a laptop for the demo
   - How many hours per week we realistically have across the 4 weeks
   - Whether we need to hand this over to a municipality afterwards, or it stops at the demo
   - Anything we already know we want to use, or want to avoid

   Ask them conversationally, a handful at a time — don't hand me a giant form. If my answers are vague or contradictory, push back and get specifics before moving on. **Wait for my answers before doing anything else.**

2. Then **propose 2–3 genuinely different options**, not three flavors of the same thing. Consider seriously: a full-stack framework (Next.js, Nuxt, SvelteKit, Laravel, Django), a BaaS-backed approach (Supabase/Pocketbase + a thin frontend), and a conventional split frontend/backend. For each, give me:
   - How fast a 4-person student team ships a working demo with it
   - How it handles the hard requirements: **offline-capable PWA**, **Arabic RTL**, file/photo uploads, role-based auth
   - Whether it can be **self-hosted locally** — digital sovereignty was an explicit requirement in the challenge brief, and depending on a foreign cloud service that could be blocked is a real weakness we'd be asked about
   - What it costs us in the demo (setup time, deployment friction, things that break live)
   - The honest downside

3. **Give me your actual recommendation and defend it**, including where the spec's original choice was right or wrong. Push back on me if I pick something for bad reasons.

Don't hedge into "it depends." I want an opinion with reasoning I can evaluate.

## Arabic is the primary language — not a translation layer

The entire interface is in **Arabic**, right-to-left, for Palestinian users. This is a first-class requirement and it must shape the architecture from the first commit, not get retrofitted:

- `<html dir="rtl" lang="ar">` is the default state, not a toggle.
- Use CSS logical properties everywhere (`margin-inline-start`, `padding-inline-end`). In Tailwind: `ms-*`/`me-*`, never `ml-*`/`mr-*`.
- **Numbers, temperatures, dates, reference numbers, and Latin identifiers must stay LTR** inside Arabic sentences — wrap them properly or they render mangled. `8°C` and `#4821` inside Arabic text is a real bug source; handle it with a component, not ad-hoc spans.
- Directional icons (arrows, chevrons, progress) mirror. Non-directional icons (camera, warning, check) don't.
- Charts mirror: axis right, bars grow leftward.
- Self-host the Arabic font (IBM Plex Sans Arabic or Cairo) — no Google Fonts CDN call, for both sovereignty and reliability on poor connections.
- All UI strings live in one place from day one. Don't scatter Arabic literals through components.

Include RTL correctness in your stack evaluation — some frameworks and component libraries handle it well and some fight you the whole way. That should influence the recommendation.

## Scope discipline — please enforce this on me

The spec's §1.3 lists what's explicitly out of scope. Hold me to it. If I ask for something on this list mid-build, remind me it's out of scope and ask if I'm sure:

- No native mobile apps (PWA covers it)
- No payments or billing of any kind
- No machine-learning risk model — the weighted formula is a deliberate choice for explainability, since an inspector must be able to justify a visit and an owner must be able to understand their ranking
- No certificate or badge issued under the Aman brand
- No multi-municipality tenancy, heat maps, or computer vision
- No public star ratings or free-text reviews — this is a regulatory tool, not a review site

## How I want you to work with me

- **Discuss before building.** For this first message, respond with questions and the stack analysis only. No code, no file creation.
- Once we agree on a stack, propose a build plan mapped to the spec's §12 four-week order before implementing.
- **Build vertically, not in layers.** One complete working feature end to end beats four half-finished layers. The first vertical slice should be the public QR establishment page with seeded data — I want something demoable at the end of week one.
- Implement the scoring and Risk Score logic **first**, in shared code with unit tests, before any UI. Both the server and the offline inspector app must run the identical code — never duplicate that logic.
- Check in with me at each milestone rather than generating huge amounts of code at once.
- Tell me when something in the spec is wrong, impractical, or would take longer than it's worth for a 4-week prototype. I'd rather hear it now.

**Start now: read the spec, then ask me your questions.**
