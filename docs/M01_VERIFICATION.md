# M01 verification — 26 October 2026

Historical verification log. Earlier no-push, unmerged-PR and unexecuted-CI statements below describe the state when they were written; they are superseded by the merged PR and CI evidence in [ORCHESTRATION_STATUS.md](ORCHESTRATION_STATUS.md). Hosted identity/Storage, staging restore and physical installed-device checks remain open release gates, not a blanket block on reviewed synthetic development under ADR-003.

At this log's initial checkpoint, the local foundation was implemented and no hosted migration, deployment, GitHub push or PR had been performed. Milestone operational acceptance remains pending the integration and release gates below.

## CI and worker follow-up — 26 October 2026

The previous no-push and unexecuted-CI statements describe the initial state. Foundation commit `9eb5c2103bd751ed7b7e1fa64dab4655c86bb7ca` is now pushed to `codex/m01-foundation`. GitHub Actions run [40337512461](https://github.com/ayjabuilders/dentalspa/actions/runs/40337512461) passed both application and database jobs. The latter started a full isolated Supabase stack, reset its local database, passed the expanded 34-assertion pgTAP suite, and passed database lint. This resolves full-local-stack evidence; it is not a hosted deployment or hosted identity/Storage test.

Subsequent disabled outbox-worker code and its additive private migration passed local lint, full typechecking, API build, **31 unit tests and 34 integration tests**. Worker SQL tests cover atomic rollback, retry exhaustion, expired leases, fencing and per-consumer consumption. Full multi-connection contention, runtime adapter/role provisioning and process-crash tests remain required before activation. It is unwired and performs no external delivery. No UI changes were made in this follow-up, so the already passing 15-browser-test evidence remains applicable.

Worker commit `261ef7d7ee13b1591162bc9810cb473f5031ca24` subsequently passed application and full Supabase database CI in [run 40338269757](https://github.com/ayjabuilders/dentalspa/actions/runs/40338269757), including migration reset, pgTAP and database lint. [Draft PR #1](https://github.com/ayjabuilders/dentalspa/pull/1) is open and unmerged. The following workflow-only change avoids duplicate push/PR runs and skips documentation-only changes; it does not add application functionality.

A same-thread follow-up is active every 30 minutes; it resumes authorized unblocked work and suppresses unchanged-blocker noise. See `ORCHESTRATION_STATUS.md` for the current task ownership and next step.

## Parallel follow-up — 26 October 2026

Three user-authorized agents independently improved connected authentication UI, identity adapter/policy verification, and PWA behavior. The integration pass added independent global/patient search state and a dedicated local help panel. No M02 business functionality was introduced; its dependency/ownership sequence is in `M02_DELIVERY_SEQUENCE.md`.

Latest combined results supersede the initial counts below: **25 unit tests, 21 integration tests, and 15 browser tests passed**. `pnpm lint`, `pnpm typecheck` (including test sources), and `pnpm build` passed. No tests were skipped in this run.

- Unsupported runtime access-policy metadata now denies access instead of permitting authenticated fallthrough. Seven additional adapter tests use the real Supabase SDK with mocked HTTP transport; five tests cover unsupported policies. These are not hosted integration evidence.
- Install prompt rejection recovers to browser guidance; installed iOS state hides the action; update activation requires explicit confirmation and avoids duplicate reload listeners. Worker reads are scoped to the current cache. Eight worker-runtime tests and three browser lifecycle simulations cover these behaviors; actual OS installation remains unverified.
- The connection screen now validates clinic/user response scope, prevents repeated submissions, clears passwords and expired sessions, cancels outstanding API requests on exit, and has explicit configuration/offline/error/empty states. Live configured sign-in and expiry/error flows still need Supabase validation.
- Visual review covered the connection screen at 1280px in pearl/navy and 390px in pearl. Evidence: `qa/screenshots/m01-connection-pearl.png` and `qa/screenshots/m01-connection-navy.png`. The browser suite verifies the configuration-unavailable state and return to preview. It does not validate a successful hosted sign-in.

The Supabase MCP actions remain unavailable to this running session. No new cloud changes or credentials were introduced. Full database/restore gates below remain open.

## Executed checks

| Command | Result |
| --- | --- |
| `pnpm lint` | Passed, no warnings/errors |
| `pnpm typecheck` | Seven workspace tasks passed |
| `pnpm exec tsc -p tsconfig.json --pretty false` | Passed; test source typechecking is now included in the root typecheck script |
| `pnpm unit` | 12 tests passed in two files |
| `pnpm integration` | 14 tests passed in two files: seven NestJS boundary checks and seven embedded PostgreSQL policy checks |
| `pnpm contracts:generate` | OpenAPI and TypeScript contracts generated successfully |
| `pnpm build` | Four build tasks passed: three Next.js apps and NestJS API |
| `pnpm e2e` | Nine Chromium tests passed; repeated after the mobile table correction |

Embedded PostgreSQL executes the actual migration using minimal Auth and Storage schema stubs. This verifies SQL policy behavior, not hosted Supabase behavior. HTTP tests replace identity/repository infrastructure with test adapters and exercise the actual route/guard/application boundary.

Browser tests cover search, filtering, selected patient details, theme persistence, notifications, install guidance, patient tabs, public CTA boundaries, keyboard focus, reduced motion and static offline fallback. Overflow assertions cover Home, Patients and Clinical at 1536, 1280, 768 and 390 pixels in both themes. They are not visual approval. During the mobile table fix, the 390px test failed because an absolutely positioned screen-reader label escaped its scrolling container. The table region now establishes its positioning boundary; the other intermediate grid-width correction is retained.

## Visual inspection

Inspected Home in navy at 1536px and pearl around 1024px, Patients at 1536px in both themes, and Patients at 390px in pearl. Corrected compressed mobile table columns with an internally scrolling minimum-width table and nonshrinking portraits. Reduced the sidebar brand size to avoid the unwanted line break. Review evidence: `qa/screenshots/m01-patients-pearl-1536.png`.

Full visual coverage of every viewport/module, 200% browser zoom, physical devices, installed-window behavior, service-worker update lifecycle and complete contrast auditing remain pending. No user visual approval is inferred.

## Connection and environment evidence

- Supabase MCP reports enabled and OAuth authenticated. The browser shows DentalSpa V1 in ayjabuilders's Org; project ID `dbnxfqjevdffgrkvczli` matches configuration and has no migrations.
- Supabase MCP actions are not exposed to this running chat despite successful OAuth. No remote schema or account provisioning was attempted through another credential path.
- GitHub credential manager includes ayjabuilders; `git ls-remote` succeeded with no refs. Local branch is `codex/m01-foundation`, remote is `ayjabuilders/dentalspa`.
- Full local Supabase could not start because Docker/Podman is unavailable. pgTAP and Supabase lint therefore remain unexecuted locally. The CI database job is prepared, not run.

## Remaining acceptance gates

Refresh the MCP connection in a subsequent session and finish authorized development-project integration: live identity verification, tenant isolation, verified patient linkage, private Storage/signed-link denial and revocation checks. Run full local/CI pgTAP, and staging backup/restore validation. Keep real patient data excluded. See `M01_SECURITY_AND_LIMITS.md` for the security assumptions, technical debt and M02 cutline; do not start clinical functionality before M01 acceptance.
