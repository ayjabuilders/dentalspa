# Start Here — Codex orchestration

## Prime directive
Implement **Milestone 01 Foundation**. Do not build a full dental practice-management product in one PR. Use `codex/M01_FOUNDATION_PROMPT.md` as the first task; read the rest of this pack before creating code.

## Task hierarchy
1. Source/requirements traceability → document unresolved facts (no fabricated clinic rules).
2. ADRs + repo scaffolding → monorepo apps/packages, lint, typecheck, test, CI.
3. Supabase migrations → clinic, membership, patient skeleton; deny-by-default policies and tested access.
4. NestJS modules skeleton + API versioning + auth guards + audit/outbox structures.
5. Polished but minimal shells → Clinic OS desktop + Patient Pass mobile PWA (mock fixture data).
6. Contract/safety tests and local demo.
7. Only on accepted milestone: booking/check-in vertical slice; only then service journeys and Smart Notes in controlled increments.

## Definition of handoff quality
- Build runs locally on safe development environment, setup documented.
- No real user data or credentials in git or fixtures.
- No cross-tenant accesses through direct API, signed links or files.
- Full test output and known limitations reported.
- Future domain boundaries can grow independently; do not prematurely deploy microservices.

## Explicit instructions
Do not deploy to production; do not switch on recording or send medical content to an AI provider. Stop and report any dependence on unavailable account credentials or source approvals, but continue on non-sensitive scaffolding.
