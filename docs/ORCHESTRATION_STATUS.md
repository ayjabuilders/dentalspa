# Dental Spa orchestration

This chat is the integration lead. Working directory: `C:/Users/platf/Documents/Dental Spa`. The user authorized parallel agents and ongoing follow-up on 26 October 2026. A same-thread follow-up runs every 30 minutes while the local app/computer are available; it must not busy-loop on unchanged blockers.

## Current boundary

M01 Foundation remains the active milestone. M02 is planned in `M02_DELIVERY_SEQUENCE.md`, not accepted or implemented. Read `AGENTS.md` and `codex/00_START_HERE.md` before assigning new work. No real patient data, clinical AI, external messaging or production deployment.

## Active work

- Integration lead: prepare the foundation Git branch and run GitHub CI to obtain full Docker/Supabase evidence, then fix concrete failures. Source PDF/DOCX files remain local and excluded from the public repository.
- Database agent: pgTAP policy suite and embedded policy tests only; check real Supabase compatibility and add negative cases.
- Worker agent: private, disabled-by-default outbox worker foundation with bounded leases/retries and idempotent consumption. No external side effects and no booking domain commands.

Prior integrated evidence: build/lint/typecheck pass; 25 unit, 21 integration and 15 browser tests pass. See `M01_VERIFICATION.md` for exact limits. Do not treat these counts as evidence for subsequent edits.

## Blocking dependencies

- Supabase MCP authentication is saved but remote tools are not exposed in this session. No hosted migration has run.
- Local Docker/Podman is absent. Use the repository's isolated GitHub CI database job rather than repeating local startup failures.
- Hosted identity/Storage/revocation checks, installed-device PWA checks and staging restore evidence remain acceptance gates. Local emulation is not hosted verification.

## Operating rules

Assign at most three agents with disjoint file ownership. Review their changes and run relevant tests before integrating; do not parallelize dependent contract/schema changes blindly. Update this file with completed work, exact CI/commit identifiers, current owners and the next actionable step. Re-run checks only after related code changes, failures or new evidence. Report a repeated blocker once and wait for changed external state or user input; never invent progress or acceptance. Stop if the user pauses/cancels.
