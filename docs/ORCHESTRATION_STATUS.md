# Dental Spa orchestration

This chat is the sole integration coordinator. The owner approved ADR-003 and autonomous bounded development merges on 26 October 2026. Working directory: `C:/Users/platf/Documents/Dental Spa`. Durable assignments and dependencies: `WORK_QUEUE.json`.

## Current work

- Foundation PR #1: https://github.com/ayjabuilders/dentalspa/pull/1. Code revision 3cb16d0 passed application and full Supabase CI (40338957635). Independent review found no blocking issue for a development merge; coordinator separately reviewed reviewer-authored identity/guard changes. Current head bc11ae6 adds approved gate policy and queue; await its CI and verify no auto-deployment before squash merge.
- Integration branch: `codex/m02-intake`, based explicitly on foundation head bc11ae6 pending its merge. Frozen intake contract commit dd53154. Rebase integration onto merged main before PR; preserve worktree commits and cherry-pick only reviewed changes.
- Backend lane: `codex/intake-api`, worktree `C:/Users/platf/Documents/DentalSpa-worktrees/intake-api`; user-scoped RPC, RLS, atomic create/idempotency/audit/outbox and tests.
- UI lane: `codex/intake-ui`, worktree `C:/Users/platf/Documents/DentalSpa-worktrees/intake-ui`; standalone synthetic intake and connected memory-only transport, filters/detail/create dialog and browser tests.
- Reviewer lane: contract/adversarial review; no implementation-file ownership.

## Development versus release

M02 synthetic development is now authorized under ADR-003. Technical dependencies gate each slice; missing hosted access does not block unrelated implementation. Hosted Supabase identity/Storage/revocation, staging restore, installed-device PWA and later clinical/privacy approvals remain activation/release gates. No hosted migration, real patient data, real AI/capture or production deployment.

Local Docker/Podman is absent; full Supabase migrations/pgTAP run successfully in GitHub CI. Supabase MCP authentication is saved but actions are unavailable in this session. Do not repeatedly retry this unchanged blocker. Worker foundation remains disabled/unwired.

## Loop

Reconcile queue, agents and CI; dispatch ready independent tasks; independently review, test and integrate; unlock the next slice immediately. Max three agents with disjoint ownership. Prefer Git/CLI/API. Never expose credentials. Do not duplicate assignments or rerun unchanged passing checks. The heartbeat is configured for ten-minute recovery during active work; when only external blockers remain, back off hourly. Respect Plan mode and user pause/cancel. This requires the app/computer to be available.

Next after intake integration: explicit patient matching/duplicate review, then transactional booking/calendar and verified patient appointment projection. No automatic patient merge or inferred clinical rules.
