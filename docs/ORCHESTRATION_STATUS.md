# Dental Spa orchestration

This chat coordinates integration in `C:/Users/platf/Documents/Dental Spa`. ADR-003 authorizes bounded autonomous development merges after independent review and current-head CI. Queue: `WORK_QUEUE.json`. Maximum three agents, isolated worktrees and disjoint ownership.

## Current evidence — 26 October 2026

- Foundation PR #1 merged as 88c9af5 after independent review and CI40342606919: application and full Supabase database both passed. No active repository hooks or deployments found.
- Intake PR #2 squash merged as c3cd0ff after current-head CI40346382279 application and full database success. No repository hooks or deployments appeared before merge.
- Patient lookup PR #3 squash merged as d4a432e after independent review and current-head CI40351974022 application/database success. The database job included all 24 new pgTAP lookup assertions. No repository hooks or deployments appeared before merge.
- Lookup evidence: lint, all typechecks, 70 unit tests, 71 integration tests, full production build and 8 configured synthetic browser/transport cases passed. The flow remains read-only and no-store; it cannot select, create, merge, link or book a patient.
- Parent inspected pearl and dark desktop plus 390px mobile lookup layouts, corrected inherited oversized radio controls and saved `qa/screenshots/patient-lookup-dark.png`. Broader installed-device PWA approval remains pending.

## Next action

Scheduling hold PR #4 squash merged as 9877ee3 after independent security/UX review and current-head CI40358746496 application/database success. The full Supabase job applied the migration and `btree_gist`, passed all 17 new pgTAP assertions and database lint; the application job passed lint, typecheck, 87 unit, 92 integration, builds and the complete browser suite. Before merge, the repository reported zero hooks and zero deployments. Parent inspected pearl/navy desktop, 390px mobile and connected released-state screenshots. The kernel exposes authorized synthetic resources, informational availability and transactional provider/chair holds only; it has no patient association or appointment confirmation.

The active branch is `codex/m02-scheduling-concurrency` from merged main. The next highest-value unblocked gate is a real independent-connection contention harness against the local Supabase CI database. It must cover shared provider, shared chair, adjacency, lock-wait expiry and rollback without hosted changes. Sequential pgTAP and embedded PGlite remain useful regression evidence but are not mislabeled as contention proof. Patient selection stays blocked until identity evidence, correction, freshness and duplicate override rules are approved.

## Activation gates

All state-changing APIs and private database switches default off. The scheduling API additionally requires `ENABLE_SCHEDULING_HOLDS=true` and trusted per-clinic private enablement; synthetic fixtures contain no accounts or memberships. No hosted migrations, real patient/resource data, appointment confirmation, AI/capture, messaging or production deployment. Hosted identity/Storage/revocation, staging restore, installed-device PWA, 200% browser zoom, live API/UI integration and real independent-connection scheduling contention remain unverified. Supabase MCP tools remain unavailable to this runtime; do not retry the unchanged blocker. Development may proceed independently under ADR-003.

Heartbeat recovery configured every ten minutes; back off when only external blockers remain. Never claim execution while the app/computer is unavailable. Prefer Git/CLI/API, keep credentials out of files/logs, respect pause/cancel.
