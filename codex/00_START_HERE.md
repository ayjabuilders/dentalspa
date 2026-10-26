# Start Here — Codex orchestration

## Prime directive
Start from **Milestone 01 Foundation**, then follow the dependency-driven queue and ADR-003. Do not build a full dental practice-management product in one PR. The product owner authorized parallel synthetic development after technical dependencies pass, with separate activation/release gates.

## Task hierarchy
1. Source/requirements traceability → document unresolved facts (no fabricated clinic rules).
2. ADRs + repo scaffolding → monorepo apps/packages, lint, typecheck, test, CI.
3. Supabase migrations → clinic, membership, patient skeleton; deny-by-default policies and tested access.
4. NestJS modules skeleton + API versioning + auth guards + audit/outbox structures.
5. Polished but minimal shells → Clinic OS desktop + Patient Pass mobile PWA (mock fixture data).
6. Contract/safety tests and local demo.
7. After the foundation development gate passes: booking/check-in vertical slices may proceed while recorded hosted/restore gates remain open. Service journeys and Smart Notes retain their dependency and clinical/privacy gates. Development progress is not operational acceptance.

## Definition of handoff quality
- Build runs locally on safe development environment, setup documented.
- No real user data or credentials in git or fixtures.
- No cross-tenant accesses through direct API, signed links or files.
- Full test output and known limitations reported.
- Future domain boundaries can grow independently; do not prematurely deploy microservices.

## Explicit instructions
Do not deploy to production; do not switch on recording or send medical content to an AI provider. Stop and report any dependence on unavailable account credentials or source approvals, but continue on non-sensitive scaffolding.
