# Dental Spa orchestration

This chat coordinates integration in `C:/Users/platf/Documents/Dental Spa`. ADR-003 authorizes bounded autonomous development merges after independent review and current-head CI. Queue: `WORK_QUEUE.json`. Maximum three agents, isolated worktrees and disjoint ownership.

## Current evidence — 26 October 2026

- Foundation PR #1 merged as 88c9af5 after independent review and CI40342606919: application and full Supabase database both passed. No active repository hooks or deployments found.
- Intake PR #2 squash merged as c3cd0ff after current-head CI40346382279 application and full database success. No repository hooks or deployments appeared before merge.
- Patient lookup PR #3 squash merged as d4a432e after independent review and current-head CI40351974022 application/database success. The database job included all 24 new pgTAP lookup assertions. No repository hooks or deployments appeared before merge.
- Lookup evidence: lint, all typechecks, 70 unit tests, 71 integration tests, full production build and 8 configured synthetic browser/transport cases passed. The flow remains read-only and no-store; it cannot select, create, merge, link or book a patient.
- Parent inspected pearl and dark desktop plus 390px mobile lookup layouts, corrected inherited oversized radio controls and saved `qa/screenshots/patient-lookup-dark.png`. Broader installed-device PWA approval remains pending.

## Next action

The active branch is `codex/m02-scheduling-contract` on merged main d4a432e. Three independent reviews converged on a smaller safe next slice: staff-only synthetic provider/chair availability plus transactional holds, with no patient association or appointment confirmation. `docs/SCHEDULING_HOLD_V1_CONTRACT.md` and strict shared schemas define UTC/display-zone handling, truthful states, default-off activation, role/tenant checks, durable idempotency, audit/outbox and a clinic-lock plus PostgreSQL exclusion-constraint concurrency model. Privacy/security and UX re-reviews found no remaining contract blocker after corrections for target-bound release idempotency, replay reconciliation, millisecond precision, timezone validation, interval containment/order, partial-result truth and event/status matching. Contracts-package typecheck and 15 focused tests pass. Next: commit this frozen gate, then dispatch isolated API/SQL and Clinic UI lanes from the same commit. Patient selection stays blocked until identity evidence, correction, freshness and duplicate override rules are approved.

## Activation gates

All state-changing APIs and private database switches default off. Synthetic data only. No hosted migrations, real patient/resource data, appointment confirmation, AI/capture, messaging or production deployment. Hosted identity/Storage/revocation, staging restore, installed-device PWA and real multi-connection scheduling contention remain unverified. Supabase MCP tools remain unavailable to this runtime; do not retry the unchanged blocker. Development may proceed independently under ADR-003.

Heartbeat recovery configured every ten minutes; back off when only external blockers remain. Never claim execution while the app/computer is unavailable. Prefer Git/CLI/API, keep credentials out of files/logs, respect pause/cancel.
