# Build Center — owner-visible product scope

Route: Clinic OS `/build`, navigation item **Construction**.

The default view covers all 21 capability groups in the local master guide, pages 20–41. Separate views expose ten infrastructure workstreams, seven execution milestones, seven release gates and the bounded engineering delivery queue.

## Status semantics

- **Fonctionnel partiel**: specific synthetic functionality has implementation evidence; the complete product module has not been accepted.
- **Aperçu UI seulement**: a shell or demonstration exists, but the module's domain behavior remains unimplemented.
- **À construire**: requirements or schema proposals alone do not count as functioning product capability.
- No global completion percentage is calculated. The queue contains a small subset of work, with no full-product effort weights or accepted denominator.
- J01–J07 in the interface refer to the execution milestones called M01–M07 in `docs/12_CODEX_EXECUTION.md`. Product module M01–M21 identifiers remain faithful to the master guide. `docs/04_MODULE_PRD.md` groups some clinical/case slices differently; this is disclosed and does not resolve their contracts by inference.

## Sources and maintenance

`apps/clinic-os/lib/product-roadmap.ts` is a reviewed, source-cited scope snapshot based on the master guide, module PRD, architecture, integrations, release gates and current implementation evidence. Update its built/remaining/status fields whenever a module changes. A new accepted slice does not automatically complete a module.

`apps/clinic-os/lib/build-status.ts` reads `docs/WORK_QUEUE.json` during the build and publishes only selected status/evidence fields. Agent ownership, worktree paths and file assignments are omitted. The interface displays snapshot generation time and states that a rebuild is required to refresh it; it is not a live agent or CI monitor.

Test links use the same Clinic OS origin and preserve the Build Center in a separate tab. Each link distinguishes synthetic demo, UI preview and verified-session prerequisites. Patient Pass is a separate local preview at `http://localhost:4201`, explicitly labelled as local. Unimplemented modules have no fake test action. Infrastructure/contract evidence is not represented as something the UI demo itself proves.

No deployment, database mutation, patient data, role expansion, real clinical functionality, capture or AI activation is introduced.

## Verification scope

Focused browser tests cover all 21 modules, state filters, five scope views, delivery filters, a real demo-link navigation, and overflow at 1536/1280/768/390 in both themes. Build/typecheck/lint and independent scope review are required before handoff. Visual approval is recorded separately from assertions.

26 October verification: production build, typecheck, scoped ESLint and both focused browser tests passed (14.5 seconds). Independent review findings were resolved. Pearl/navy desktop screenshots were inspected, dark text-link contrast was corrected and the final build was visually rechecked. Evidence: `qa/screenshots/build-center-product-scope.png`. Mobile viewport assertions are layout checks, not physical-device or 200% browser-zoom approval.
