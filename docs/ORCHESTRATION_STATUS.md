# Dental Spa orchestration

This chat coordinates integration in `C:/Users/platf/Documents/Dental Spa`. ADR-003 authorizes bounded autonomous development merges after independent review and current-head CI. Queue: `WORK_QUEUE.json`. Maximum three agents, isolated worktrees and disjoint ownership.

## Current evidence — 26 October 2026

- Foundation PR #1 merged as 88c9af5 after independent review and CI40342606919: application and full Supabase database both passed. No active repository hooks or deployments found.
- `codex/m02-intake` rebased onto merged main. Backend1291ce6 and UI25bbf53 integrated. Shared schemas and generated OpenAPI included.
- Integrated lint, typecheck, 55 unit tests, 52 integration tests and all application builds passed. All20 browser regressions passed before the CSS-only source-filter correction; focused layout verification follows. Added23pgTAP assertions await full Supabase CI; local Docker absent.
- Independent final review found no blocker, including UTC replay, Unicode validation, activation switches, tenant scope, atomic audit/outbox and memory-only UI. Development approval only.
- Parent inspected1280px light list/detail and dark creation dialog. Source-select clipping corrected in0024789; final visual check pending. Full responsive visual approval remains pending.

## Next action

Integrate CSS correction, finish browser regression, publish bounded intake PR and verify current-head CI before merge. Backend lane is preparing read-only patient-matching requirements for the next contract; do not implement automatic merge or booking before contract freeze.

## Activation gates

Both API intake commands and private database switch default off. Synthetic data only. No hosted migrations, real patient data, AI/capture or production deployment. Hosted identity/Storage/revocation, staging restore, installed-device PWA and real multi-connection contention remain unverified. Supabase MCP tools unavailable; do not retry unchanged blocker. Development may proceed independently under ADR-003.

Heartbeat recovery configured every ten minutes; back off when only external blockers remain. Never claim execution while the app/computer is unavailable. Prefer Git/CLI/API, keep credentials out of files/logs, respect pause/cancel.
