# Instructions for Codex agents — Dental Spa OS

You are implementing a healthcare-adjacent operations system for a Moroccan dental cabinet. Optimize for **clinical safety, patient privacy, correct state transitions, excellent UX and maintainability**; not maximum feature count.

## Scope discipline
- Follow `codex/00_START_HERE.md`, ADR-003 and the coordinator's current slice queue. Development dependencies gate implementation; operational/clinical gates still block activation and release. Make small reviewable PRs. Never claim unimplemented functionality is production-ready.
- Do not change locked stack (Next.js, NestJS, Supabase, Vercel) without documenting an ADR and approval.
- Source-derived process steps in specs are *organizational reference*, not automatically approved clinical protocols. Flag unknowns in `docs/02_CLINIC_DISCOVERY.md`.
- Never create diagnoses, prescriptions, drug advice or mandatory clinical steps by inference.

## Invariants
1. Each tenant/clinic is strongly isolated by backend policy and data-access mechanisms; default deny. Test negative cases, including object IDs from another tenant.
2. Only licensed/authorized clinicians sign clinical notes, approve plans, authorize treatment and approve patient instructions. Operations manager is **not** automatically a clinician.
3. Patient sees only own **explicitly released/approved** clinical content, not internal task checklists, financial margins, lab notes or other patients' data.
4. Appointment slot confirmation is transactional and cannot double-book constrained resources. Booking request != confirmed booking.
5. Template definitions are versioned. Runtime workflow instance pins an immutable approved version; no silent mutation.
6. Workflow states reflect *confirmed real-world actions*: calling a patient != patient roomed != clinical encounter started.
7. Dynamic staffing uses qualification, shift, team assignment, availability and task delegability; solo practice does **not** disable required clinical gates.
8. Task completions and critical actions emit audit + transactional outbox event; consumers idempotent.
9. AI writes drafts/suggestions only. Human approval precedes clinical signing, patient publication and consequential changes.
10. No persistent recording or raw transcript for Smart Notes. No accidental audio/text in logs/telemetry/analytics/storage/service-worker cache. Vendor retention and jurisdiction must be verified before real capture.
11. No speculative claims of automatic Orthalis, WhatsApp, Instagram, scanner, printer or laboratory integrations.
12. No hardcoded service journeys in React components; UI renders authorized workflows received from backend.

## Engineering norms
- Modular NestJS bounded contexts: domain/application/infrastructure/presentation. HTTP handlers thin; business validation server-side.
- OpenAPI for versioned external API; JSON schema/versioning for events and workflow templates. Stable UUID identifiers.
- Explicit transactions and row locks/constraints for booking; outbox rows in same transaction as domain write.
- Supabase service credentials are server-only, least privilege; no trusting caller-supplied `clinic_id` or `patient_id` without authorization.
- Do not assume RLS applies to privileged service-role connections; enforce server-side tenant policies and verify with tests.
- Migration files are reviewable; no destructive migration to production without explicit approval.
- Use mocks/fake fixtures for early builds; seed data must be clearly non-real.
- Separate `ui-clinic` and `ui-patient`; shared primitive tokens only where appropriate.
- Respect WCAG 2.2 AA-oriented practices; keyboard, focus, reduced motion, contrast, 44px mobile touch targets, RTL readiness.
- Support loading/empty/permission-denied/offline/conflict/error/success states; never show optimistic clinical completion before server confirmation.
- Test authentication, isolation, booking concurrency, state transitions, event idempotency, role-specific release and non-retention.
- Keep the owner-visible Build Center current: when a verified delivery changes module coverage, update `docs/MODULE_PROGRESS.json` with criterion state, evidence and linked queue tasks, plus the built/remaining descriptions in `apps/clinic-os/lib/product-roadmap.ts`. A successful build publishes these records automatically; it does not itself justify marking a capability complete. Use the package build command so failed builds never replace the last successful snapshot.

## Before every PR
List the acceptance criteria being satisfied, commands run, tests passed/failed, privacy risks, schema changes, manual test steps, and items blocked by clinical or legal sign-off.
