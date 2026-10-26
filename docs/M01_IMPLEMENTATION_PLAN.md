# M01 implementation plan · 26 October 2026

Scope: `codex/M01_FOUNDATION_PROMPT.md` only. No booking confirmation, clinical workflow, capture or AI execution. Requirements package is authoritative for behavior; the user's existing UI workshop is authoritative for the requested visual direction.

1. Establish pnpm/Turbo, three independent Next.js apps and NestJS API. Preserve the specification corpus unchanged.
2. Translate Manrope/DM Sans, pearl/navy, photographic cards, smooth controls and restrained Pulse into shared tokens and separate Clinic/Patient components. Build functional synthetic shell interactions, explicitly separated from connected authentication.
3. Verify bearer tokens through Supabase Auth; resolve active memberships server-side; validate clinic selection and role, patient links and resource ownership. No demo-token bypass or privileged service credential in runtime.
4. Add reviewable local SQL for identity, patients, deny-by-default private storage, audit/outbox skeletons and tests. Do not invent clinical schemas.
5. Add unit/API/browser/policy tests, local setup, CI and evidence report. Local database and staging restore gates remain open if Docker/credentials are unavailable.

Traceability: USR-STACK / ADR-001–002 → platform; USR-UX / workshop skill → visual direction (supersedes proposed teal palette only); SRC-GUIDE / docs 09, 15 → tenancy and separate patient projection. All photographic people and displayed records are synthetic. No clinical SOP is approved by this work.

Review boundaries: scaffold/contracts; identity and SQL policy; app shells; verification. This directory arrived without a Git repository. The user subsequently supplied `ayjabuilders/dentalspa` and Supabase project `dbnxfqjevdffgrkvczli`; local Git now points at that remote and MCP authentication is confirmed. Original source checksums in `MANIFEST.sha256` describe the imported handoff, not subsequent implementation documentation.
