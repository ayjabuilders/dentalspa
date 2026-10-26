# Build Center — owner-visible product scope

Route: Clinic OS `/build`, navigation item **Construction**.

The default view covers all 21 capability groups in the local master guide, pages 20–41. Separate views expose ten infrastructure workstreams, seven execution milestones, seven release gates and the bounded engineering delivery queue.

## Status semantics

- **Fonctionnel partiel**: specific synthetic functionality has implementation evidence; the complete product module has not been accepted.
- **Aperçu UI seulement**: a shell or demonstration exists, but the module's domain behavior remains unimplemented.
- **À construire**: requirements or schema proposals alone do not count as functioning product capability.
- No global completion percentage is calculated. The queue contains a small subset of work, with no full-product effort weights or accepted denominator.
- Each module now has a **functional coverage estimate**, derived from six equally weighted PRD capabilities in `MODULE_PROGRESS.json`: delivered = 1 point, partial = 0.5, planned = 0, divided by six and rounded. UI-only previews earn no functional points. This is not elapsed effort or operational acceptance. Every credited criterion requires an evidence note and linked queue tasks marked done; running/blocked evidence earns zero. The complete checklist and evidence are visible on the module card.
- J01–J07 in the interface refer to the execution milestones called M01–M07 in `docs/12_CODEX_EXECUTION.md`. Product module M01–M21 identifiers remain faithful to the master guide. `docs/04_MODULE_PRD.md` groups some clinical/case slices differently; this is disclosed and does not resolve their contracts by inference.

## Sources and maintenance

`apps/clinic-os/lib/product-roadmap.ts` is a reviewed, source-cited scope snapshot based on the master guide, module PRD, architecture, integrations, release gates and current implementation evidence. Update its built/remaining/status fields whenever a module changes. A new accepted slice does not automatically complete a module.

`apps/clinic-os/lib/build-status.ts` reads `docs/WORK_QUEUE.json` and `docs/MODULE_PROGRESS.json` during the build and includes only selected status/evidence fields. Agent ownership, worktree paths and file assignments are omitted. Update the criterion states and evidence after a verified feature delivery; a successful compile alone never earns progress points.

The supported Clinic OS build command (`pnpm --filter @dental/clinic-os build`, also used by root `pnpm build`) runs `scripts/build-clinic.mjs`. It gives Next.js a unique candidate snapshot location, waits for the full build to exit successfully, then atomically publishes `.build-status/latest.json`. Failed builds and invalid/missing candidates retain the preceding published snapshot. Generated files are ignored by Git. Turbo inputs include both ledgers and build scripts; its cached outputs include the successful artifact. A cache hit reuses its original successful timestamp, not a fabricated new one.

The read-only `/api/build-status` endpoint serves that published artifact with `Cache-Control: no-store`; it never rereads live draft ledgers or patient data. The Build Center polls every 20 seconds while visible and refreshes on focus. It updates in place without reload, preserving view/filter state. The currently published snapshot wins even when a rollback/cache restoration has an older timestamp. Failed requests leave the last displayed state intact with an unavailable indicator. Times are displayed for Africa/Casablanca. This reports successful Clinic OS builds, not CI completion or deployment. The existing service worker does not cache the endpoint.

Test links use the same Clinic OS origin and preserve the Build Center in a separate tab. Each link distinguishes synthetic demo, UI preview and verified-session prerequisites. Patient Pass is a separate local preview at `http://localhost:4201`, explicitly labelled as local. Unimplemented modules have no fake test action. Infrastructure/contract evidence is not represented as something the UI demo itself proves.

No deployment, database mutation, patient data, role expansion, real clinical functionality, capture or AI activation is introduced.

## Verification scope

Focused browser tests cover all 21 modules, state filters, five scope views, delivery filters, a real demo-link navigation, and overflow at 1536/1280/768/390 in both themes. Build/typecheck/lint and independent scope review are required before handoff. Visual approval is recorded separately from assertions.

26 October verification: production build, typecheck, scoped ESLint and both focused browser tests passed (14.5 seconds). Independent review findings were resolved. Pearl/navy desktop screenshots were inspected, dark text-link contrast was corrected and the final build was visually rechecked. Evidence: `qa/screenshots/build-center-product-scope.png`. Mobile viewport assertions are layout checks, not physical-device or 200% browser-zoom approval.

Percentage/live-update follow-up: five focused unit tests and three browser tests passed, including evidence gating, invalid scopes, successful publication, failed/invalid build retention, automatic in-place refresh, restoring an older published build, and request failure. Two actual successful Clinic builds published distinct snapshots; the already-open browser advanced its timestamp and evidence text without reload and retained an expanded checklist. Final pearl/navy progress/checklist layouts were inspected. Screenshot: `qa/screenshots/build-center-progress.png`. Successful-build publication is local app-build evidence, not proof of CI/release approval.
