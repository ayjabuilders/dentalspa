# Dental Spa orchestration

This chat is the integration lead. Working directory: `C:/Users/platf/Documents/Dental Spa`. The user authorized parallel agents and ongoing follow-up on 26 October 2026. A same-thread follow-up runs every 30 minutes while the local app/computer are available; it must not busy-loop on unchanged blockers.

## Current boundary

M01 Foundation remains the active milestone. M02 is planned in `M02_DELIVERY_SEQUENCE.md`, not accepted or implemented. Read `AGENTS.md` and `codex/00_START_HERE.md` before assigning new work. No real patient data, clinical AI, external messaging or production deployment.

## Active work

- Integration lead: foundation pushed to `codex/m01-foundation`; draft PR https://github.com/ayjabuilders/dentalspa/pull/1 is attached to this chat. First CI run `40337512461` passed both application and database jobs for commit `9eb5c2103bd751ed7b7e1fa64dab4655c86bb7ca`. Worker commit `261ef7d7ee13b1591162bc9810cb473f5031ca24` is pushed, with checks underway. Source PDF/DOCX files remain local and excluded from the public repository. Prefer Git and CLI/API operations; `gh` is absent but authenticated GitHub REST works through the existing Git credential manager without printing or persisting tokens.
- Database agent complete: pgTAP expanded to 34 assertions; embedded policy suite to 12 tests. Full Supabase pgTAP and database lint passed in CI.
- Worker agent complete: private, disabled-by-default outbox worker foundation with bounded leases/retries and idempotent consumption. No external side effects and no booking domain commands. Reviewed locally: 31 unit and 34 integration tests, lint, typecheck and API build pass. CI run `40338269757` passed both application and full Supabase database jobs for worker commit `261ef7d7ee13b1591162bc9810cb473f5031ca24`.

Next action: verify the CI scheduling-only follow-up on PR #1, then resolve remaining hosted integration/restore access. Do not rerun the same local suite without new code. CI now runs on pull requests and pushes to main, skips documentation-only changes, and cancels superseded runs per PR. The branch remains unmerged and the worker remains disabled.

Prior integrated evidence: build/lint/typecheck pass; 25 unit, 21 integration and 15 browser tests pass. See `M01_VERIFICATION.md` for exact limits. Do not treat these counts as evidence for subsequent edits.

## Blocking dependencies

- Supabase MCP authentication is saved but remote tools are not exposed in this session. No hosted migration has run.
- Local Docker/Podman is absent; GitHub CI successfully runs the full local Supabase stack. Reuse it for changed migrations, not for repeated unchanged validation.
- Hosted identity/Storage/revocation checks, installed-device PWA checks and staging restore evidence remain acceptance gates. Local emulation is not hosted verification.

## Operating rules

Assign at most three agents with disjoint file ownership. Review their changes and run relevant tests before integrating; do not parallelize dependent contract/schema changes blindly. Update this file with completed work, exact CI/commit identifiers, current owners and the next actionable step. Re-run checks only after related code changes, failures or new evidence. Report a repeated blocker once and wait for changed external state or user input; never invent progress or acceptance. Stop if the user pauses/cancels.
