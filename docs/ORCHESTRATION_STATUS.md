# Dental Spa orchestration

This chat coordinates integration in `C:/Users/platf/Documents/Dental Spa`. ADR-003 authorizes bounded autonomous development merges after independent review and current-head CI. Queue: `WORK_QUEUE.json`. Maximum three agents, isolated worktrees and disjoint ownership.

## Current evidence — 26 October 2026

- Foundation PR #1 merged as 88c9af5 after independent review and CI40342606919: application and full Supabase database both passed. No active repository hooks or deployments found.
- Intake PR #2 squash merged as c3cd0ff after current-head CI40346382279 application and full database success. No repository hooks or deployments appeared before merge.
- Integrated lint, typecheck, 55 unit tests, 52 integration tests and all application builds passed. All20 browser regressions passed; after the CSS-only correction, Clinic build and5focused intake tests also passed. Added23pgTAP assertions await full Supabase CI; local Docker absent.
- Independent final review found no blocker, including UTC replay, Unicode validation, activation switches, tenant scope, atomic audit/outbox and memory-only UI. Development approval only.
- Parent inspected1280px light list/detail and dark creation dialog. Source-select clipping corrected in0024789 and verified in the integrated preview. Parent also visually inspected390px dark/light layouts. Evidence:qa/screenshots/intake-desktop-light.png. Broader visual/installed-device approval remains pending.

## Next action

The active branch is `codex/m02-patient-lookup-contract` on merged main. The read-only lookup contract is frozen after independent API, UI and adversarial privacy review; four focused schema tests pass. Next, commit this base and dispatch separate API/SQL and verified-session UI lanes from that exact revision. Selection, patient creation, merge and booking remain out of scope until their own policies are frozen.

## Activation gates

Both API intake commands and private database switch default off. Synthetic data only. No hosted migrations, real patient data, AI/capture or production deployment. Hosted identity/Storage/revocation, staging restore, installed-device PWA and real multi-connection contention remain unverified. Supabase MCP tools unavailable; do not retry unchanged blocker. Development may proceed independently under ADR-003.

Heartbeat recovery configured every ten minutes; back off when only external blockers remain. Never claim execution while the app/computer is unavailable. Prefer Git/CLI/API, keep credentials out of files/logs, respect pause/cancel.
