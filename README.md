# Dental Spa OS — Foundation workspace

Milestone 01 now includes three Next.js apps, a NestJS API, shared visual primitives, Supabase migrations and regression tests. Use **[SETUP.md](SETUP.md)** to run it locally and **[M01_SECURITY_AND_LIMITS.md](docs/M01_SECURITY_AND_LIMITS.md)** for the exact implementation boundary. This is a synthetic development foundation, not an accepted production release.

## Original handoff package v1.0 (source requirements)

**Status:** Implementation-ready *foundation* with explicitly open clinical, compliance and integration decisions. This is a **specification package**, not an already implemented clinic application.

## Mission
Build Dental OS, a future multi-tenant clinic operations platform, beginning with Dr Amina's Dental Spa pilot. The product's primary unit of value is **a complete patient journey**, not isolated CRUD screens. A real service may span many visits/phases/tasks and staff configurations; Clinic OS and Patient Pass show different projections of the same authorized facts.

## Locked technology direction
- Frontends: separate **Next.js + TypeScript** apps: `clinic-os` (desktop-first), `patient-pass` (mobile-first PWA), `public-booking` (responsive).
- Backend: **NestJS modular monolith**, versioned REST contracts and event outbox; **not** dozens of services in V1.
- Platform: **Supabase PostgreSQL, Auth, private Storage**, selected Realtime updates.
- Hosting targets: **Vercel** for Next.js and API *only after supported runtime/connection pattern is validated*. Durable/background workers may need a separate runtime; verify instead of assuming long-lived workers fit Vercel Functions.
- Repo: **pnpm + Turborepo**, testable packages/contracts. Python-only services may be added later for AI.
- Shared brand tokens but separate Clinic/Patient component libraries. Strictly separate auth/permission experiences.

## Start here
1. Read `AGENTS.md` and `codex/00_START_HERE.md`.
2. Read **all twelve** numbered specification documents in `docs/`, plus `docs/13_WORKFLOW_ENGINE.md`, `docs/14_SMART_NOTES.md`, `docs/15_PATIENT_PASS_UX.md`, `docs/16_SOURCE_TRACEABILITY.md`.
3. Read `docs/adr/` and `qa/RELEASE_GATES.md`.
4. Execute **only** `codex/M01_FOUNDATION_PROMPT.md` first. Do not attempt all product modules at once.
5. Review `contracts/` and `templates/` as draft interfaces/templates; do not treat example templates as approved clinical practice.

## Deliverable philosophy
**Design full boundaries. Build one reliable vertical slice.** Begin with synthetic data, audit, tenancy, authentication, design shells and tests. Then patient inquiry/booking → check-in → dentist calls patient → staff handoff → eligible visit workflow → patient-facing progress.

## Source fidelity / provenance
See `sources/README.md` and `docs/16_SOURCE_TRACEABILITY.md`. The source material provided by the user is a set of *working organizational mockups* requiring clinical sign-off. The official master guide is included as a read-only reference PDF. Other uploaded source documents were reviewed through document extraction but their original file bytes could not be included in this ZIP; reattach them separately to Codex if exact line-by-line re-extraction is needed.

## Mandatory no-go items before real patient pilots
Clinical SOP approval; Moroccan privacy/CNDP and cross-border hosting assessment; retention/consent review; security testing; verified backups/restores; legacy migration plan; staff training on clinical safety (even if navigation is designed to need little training); real-device PWA validation. No real audio capture before independent consent/retention/vendor reviews.
