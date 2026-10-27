# ADR-003 — Dependency-driven development and separate release gates

Status: accepted on 26 October 2026; amended by the product owner on 27 October 2026 for local-first, proportionate delivery.

The original milestone wording blocked all downstream development on hosted operational checks. The owner authorized the coordinator to choose the faster safe delivery policy and automatically merge bounded reviewed development PRs.

Development proceeds when the slice's technical dependencies and contracts are verified. Hosted identity/Storage checks, staging restore, installed-device checks, clinical governance and legal approval remain activation/release gates. Open gates must be recorded; progressing development does not declare an entire milestone accepted. No production deployment, real patient data or clinical/AI activation is authorized.

The coordinator owns integration, migration ordering and the minimum queue/evidence needed to resume safely. At most three agents run concurrently in isolated worktrees with distinct file ownership. Agree shared interfaces before dependent parallel edits; do not require a separate contract document or several planning reviews for every routine change.

Local development integration requires review and appropriate passing local checks against the integrated code. Independent review remains required for authorization, tenant isolation, clinical state, migrations, transactions and consequential writes. GitHub access, a PR and remote CI are not prerequisites for every local integration. Preserve local commits and push coherent checkpoints for backup; group features and their progress evidence in the same delivery rather than separate bookkeeping PRs.

Checks that cannot run locally remain explicit pending evidence. Real PostgreSQL migration/policy/concurrency validation must pass on the relevant integrated candidate before database activation or release; PGlite and mocks are not equivalent evidence. Remote CI is useful for this validation and for consolidated release candidates, not as a compulsory wait after each small edit. Re-run only when changes, dependency/base changes or failures justify it. Before any remote merge, verify it cannot trigger an unauthorized deployment. Destructive migrations, access expansion and clinical-policy/stack changes still require explicit approval.

Choose work by a user-visible PRD outcome and its real dependencies. Keep tenant boundaries, versioned contracts, transactions, migration compatibility and maintainable modules; defer speculative infrastructure and redundant management automation. Assess a process step by the concrete failure or maintenance risk it prevents. Remove it if it duplicates current evidence, simplify it if the same protection is cheaper, and retain it when removing it would leave a material risk unverified. This amendment supersedes historical queue wording requiring PR/CI before every development merge; it does not mark pending tests or release gates as passed.

A blocked task blocks its dependants only. Continue the highest-priority ready slice rather than repeating passing tests or polishing unrelated screens. M02 intake/booking development may proceed from the reviewed foundation while hosted operational gates remain open. M03 follows its scheduling dependencies; clinical functionality retains its specific gates.
