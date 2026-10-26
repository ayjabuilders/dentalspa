# 12 — Codex Execution Plan

## Milestones and dependency order
**M01 Foundation** (execute first): pnpm/Turborepo, frontends, NestJS skeleton, Supabase migrations/Auth, role guards, audit/outbox, UI shells, CI/tests.
**M02 Inquiry/Booking**: lead intake manual, match patient, transactions and calendar, reception screen, patient self view.
**M03 Visit & Task Engine**: check-in, call/escort, templates, staffing, next actions, realtime and exceptions.
**M04 Clinical/Case**: clinician-only encounter notes/approvals, treatment case, multi-visit phases, patient-safe timeline projections.
**M05 Lab/Finance + Patient Pass**: mock lab handoff, release workflow, verified payments/documents, secure patient-facing screens.
**M06 Smart Notes**: fake transcripts first; consent UI and streaming adapter tests; real provider only after clinical/privacy gate.
**M07 Other modules**: LabFlow, ChairFlow, SmartStock, SteriTrack, Pulse with verified contracts.

## PR standards
Small PR per component or user journey, ADR if architectural changes, schema migration reviewed, OpenAPI contract changes documented, contract tests updated, screenshot/video demo with fictional data, accessibility and error-state checklist, rollback notes.

## Acceptance rule
Milestone complete only when automated tests and operational acceptance scenarios pass; a polished screenshot is not an implementation acceptance.

## Future expandability guardrails
No cross-module DB writes, no mix of NestJS domain business rules into Next.js server actions, no hardcoded clinical templates inside frontend, no direct service-role access from browser, no unverified vendor integrations, no unchecked AI clinical output.
