# ADR-003 — Dependency-driven development and separate release gates

Status: accepted by the product owner on 26 October 2026 in the orchestration chat.

The original milestone wording blocked all downstream development on hosted operational checks. The owner authorized the coordinator to choose the faster safe delivery policy and automatically merge bounded reviewed development PRs.

Development proceeds when the slice's technical dependencies and contracts are verified. Hosted identity/Storage checks, staging restore, installed-device checks, clinical governance and legal approval remain activation/release gates. Open gates must be recorded; progressing development does not declare an entire milestone accepted. No production deployment, real patient data or clinical/AI activation is authorized.

The coordinator owns the durable queue, shared contracts, migration ordering and integration. At most three agents run concurrently in isolated worktrees with distinct file ownership. Each PR requires independent review and passing relevant CI against its current code/base before automatic squash merge. Verify that merging cannot trigger unauthorized deployment. Destructive migrations, access expansion and clinical-policy/stack changes are escalated.

A blocked task blocks its dependants only. Continue the highest-priority ready slice rather than repeating passing tests or polishing unrelated screens. M02 intake/booking development may proceed from the reviewed foundation while hosted operational gates remain open. M03 follows its scheduling dependencies; clinical functionality retains its specific gates.
