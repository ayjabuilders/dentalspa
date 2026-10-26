# Dental Spa orchestration

This chat coordinates integration in `C:/Users/platf/Documents/Dental Spa`. ADR-003 authorizes bounded autonomous development merges after independent review and current-head CI. Queue: `WORK_QUEUE.json`. Maximum three agents, isolated worktrees and disjoint ownership.

## Current evidence — 26 October 2026

- Foundation PR #1 merged as 88c9af5 after independent review and CI40342606919: application and full Supabase database both passed. No active repository hooks or deployments found.
- Intake PR #2 squash merged as c3cd0ff after current-head CI40346382279 application and full database success. No repository hooks or deployments appeared before merge.
- Patient lookup PR #3 squash merged as d4a432e after independent review and current-head CI40351974022 application/database success. The database job included all 24 new pgTAP lookup assertions. No repository hooks or deployments appeared before merge.
- Lookup evidence: lint, all typechecks, 70 unit tests, 71 integration tests, full production build and 8 configured synthetic browser/transport cases passed. The flow remains read-only and no-store; it cannot select, create, merge, link or book a patient.
- Parent inspected pearl and dark desktop plus 390px mobile lookup layouts, corrected inherited oversized radio controls and saved `qa/screenshots/patient-lookup-dark.png`. Broader installed-device PWA approval remains pending.

## Next action

The active branch is `codex/m02-scheduling-contract`. Frozen contract 6c92b5a, fixed-offset-zone correction 0fdc5e1, API/SQL e08d349, Clinic agenda a8b2b56 and generated API/replay evidence c111448 are integrated. The kernel exposes authorized synthetic resources, informational availability and transactional provider/chair holds only; it has no patient association or appointment confirmation. Independent security review found no blocking defect. Combined lint, all eight package typechecks, API/Clinic production builds, 87 unit and 92 integration tests pass. The focused scheduling subset is 38 checks after adding replay-after-revocation/disablement negatives. Seven focused production-browser cases pass; parent inspected pearl/navy desktop, 390px mobile and connected released-state screenshots. Next: commit evidence, push a bounded PR, run current-head application and full Supabase CI (including 17 new pgTAP assertions), verify no deployment surface, and merge only if green. Patient selection stays blocked until identity evidence, correction, freshness and duplicate override rules are approved.

## Activation gates

All state-changing APIs and private database switches default off. The scheduling API additionally requires `ENABLE_SCHEDULING_HOLDS=true` and trusted per-clinic private enablement; synthetic fixtures contain no accounts or memberships. No hosted migrations, real patient/resource data, appointment confirmation, AI/capture, messaging or production deployment. Hosted identity/Storage/revocation, staging restore, installed-device PWA, 200% browser zoom, live API/UI integration and real independent-connection scheduling contention remain unverified. Supabase MCP tools remain unavailable to this runtime; do not retry the unchanged blocker. Development may proceed independently under ADR-003.

Heartbeat recovery configured every ten minutes; back off when only external blockers remain. Never claim execution while the app/computer is unavailable. Prefer Git/CLI/API, keep credentials out of files/logs, respect pause/cancel.
