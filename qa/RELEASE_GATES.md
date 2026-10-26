# Formal QA & Operational Release Gates

## Gate M01 — Foundation
- [ ] Separate apps start locally and retain separate UX
- [ ] Correct Supabase auth and deny-by-default clinic membership guard
- [ ] Tenant A / Tenant B negative tests (browser, API, file access and privileged backend access)
- [ ] Private Storage policy and patient account-linking design
- [ ] Correlation ID, redacted audit/outbox skeleton, idempotence approach
- [ ] CI lint/typecheck/unit/integration/e2e and repeatable migrations
- [ ] Staging backup + **tested restore**, not only configured backup
- [ ] No production deployment or patient data

## Gate M02 — Booking
- [ ] Verified constrained availability and transactionally confirmed slot
- [ ] No double booking under concurrent test
- [ ] Public request/hold/confirmed state distinction and idempotency
- [ ] Lead provenance/owner/due workflow, cancellation/reschedule audit
- [ ] Patient/role-isolated appointment view

## Gate M03 — Staff workflow
- [ ] Template versions immutable on active instances
- [ ] Correct solo/assistant/multi-staff role resolution
- [ ] Missing qualified person → blocked/exception (not secretly reassigned)
- [ ] `called`, `roomed` and `consultation_started` are separate explicit transitions
- [ ] Clinical gates cannot be bypassed via client or service-role access
- [ ] Duplicate events don't duplicate tasks

## Gate M04 — Clinical & Journey
- [ ] Clinician signature and amendment versioning
- [ ] Case phases, loops, lab revisits, pause and cancellation tracked
- [ ] Patient sees approved projection only
- [ ] Clinician validates exact treatment templates

## Gate M06 — Smart Notes
- [ ] Patient information/consent and clear active-mic UI
- [ ] No raw audio/transcript persistence anywhere in Dental OS logs/store/cache
- [ ] Model/provider security, region, retention and contracts checked (before real patient)
- [ ] Draft errors and uncertain clinical details surfaced
- [ ] Clinical note and patient instructions signed/published separately
- [ ] Stop/disconnect drains ephemeral buffers

## Gate production real-data pilot
- [ ] Qualified Moroccan privacy/CNDP and cross-border hosting review
- [ ] Signed professional SOPs, retention and clinical governance
- [ ] Legal and operational go/no-go, backup/restore, downtime and migration rollback
- [ ] Training for clinical safety despite intuitive UI
