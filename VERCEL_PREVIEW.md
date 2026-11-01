# Vercel deployment preparation

Repository: https://github.com/ayjabuilders/dentalspa

Status checked 2026-11-01: four Vercel projects now exist in ayjabuilders-7875 and initial validation deployments have been submitted. The owner explicitly approved Vercel's required first-deployment Production classification for validation only, without real-patient activation or a paid upgrade. The integrated implementation checkpoint is published as commit `624b75751037e4dc217420f517b420f14af1e976` on `codex/vercel-preview-readiness`, followed by deployment fixes. GitHub main remains `d0d3efad2dd378fb61f7d10931a9b06a5e5a922c`; do not import that old commit as the completed MVP. The preview checkpoint is not a claim that every module or real-client release gate is complete.

## Initial validation deployment tracking

All projects use Node 24 and their individual framework/root settings. Required configuration was installed for Preview and Production. The Supabase server key is stored as a Secret only on `dentalspa-api`; browser projects have only public Supabase configuration. Module switches remain unset/disabled. Exact reserved frontend domains are configured for CORS, and the Clinic OS session origin is its reserved domain. Successful domain assignment and browser connectivity still need verification.

| Project | Latest submitted deployment | Status at submission |
| --- | --- | --- |
| dentalspa-api | `dpl_BQ2W7BU69iAcUJkzYcZ3ReLgDmpy` | Submitted after entrypoint fix |
| dentalspa-clinic | `dpl_9aiubYioFG4xRhAifbmzEnJkB6GT` | Ready; homepage read in browser |
| dentalspa-patient | `dpl_5AeC8Uz6KM3kt9B2xAsTwoqyB1hD` | Ready; connected journeys unverified |
| dentalspa-booking | `dpl_CDdNT3KjoXSEAD6TQbrMqoYo69NK` | Queued |

The first API attempt `dpl_59xuUr7pCjdTr6fyWpDSsyKVhhBW` failed after TypeScript compiled because Vercel's NestJS detector required a direct framework import in `src/main.ts`. Commit `78aaf49` adds that import; local API build and lint passed before resubmission. Build logs are in `.local/qa/vercel-api-build-first.log`. Do not treat the CLI's submission message as readiness: inspect the actual deployment state and test its runtime.

Confirmed aliases: `https://dentalspa-clinic.vercel.app` and `https://dentalspa-patient.vercel.app`. The deployed Clinic OS homepage renders its navigation and account-entry links. It still exposes local-preview captions for the clinical and business workspace cards, and upcoming-module cards; this is an observed release gap, not completed production cleanup. No authenticated deployed patient-data workflow has been accepted yet.

CLI 65.9.0 upload inspection reported 1,114 source files, excluding local environment files, private local fixtures, build directories, source documents and QA artefacts using `.vercelignore` (commit `dd0d978`). Git integration is not yet connected; these deployments were submitted explicitly from the published checkout.

The Vercel browser session and GitHub sign-in connection are now usable: the import screen lists `ayjabuilders/dentalspa`. Its default import targets `main` and detected only three frontend applications from that old revision. It suggests a multi-service root configuration; that suggestion has not been adopted. Use the published preview branch and standalone project imports with the four roots below. No project was created, no deployment triggered and no paid option selected during this inspection. Generated `next-env.d.ts` references from the isolated publication build were restored to the standard `.next` paths rather than shipping local check-directory paths.

## Four deployment projects

| Application | Root directory | Framework |
| --- | --- | --- |
| Clinic OS | apps/clinic-os | Next.js |
| Patient Pass | apps/patient-pass | Next.js |
| Public Booking | apps/public-booking | Next.js |
| Dental API | apps/dental-api | NestJS |

Use Node 24 and the repository-pinned pnpm version. Keep repository-root workspace packages available with Include source files outside of the Root Directory enabled. Each app has its own vercel.json build command. The frontend commands run the PWA asset generator before Turbo; do not replace them with a bare Next build. Confirm the installed package-manager version in the Vercel build log before accepting a deployment.

Keep Vercel system environment variables enabled. The API uses VERCEL/PORT for platform-managed listening. The frontend builds use VERCEL to reject missing/local API origins and suppress local-only development surfaces. Local builds do not prove that these hosted settings are correct.

## Environment configuration

Use [the current environment matrix](docs/VERCEL_ENVIRONMENT_MATRIX.md) as the authoritative list of variables, module switches and server-only keys. All three frontends require the hosted API origin; Clinic OS and Patient Pass also require public Supabase configuration. Clinic session origin/project bindings must match the deployed site.

Private Storage operations and controlled team provisioning need an API-only server credential. Never put it in NEXT_PUBLIC variables, Git or chat. The API uses scoped user credentials for ordinary authorized database reads/writes; privileged operations must retain explicit tenant and role checks.

### Hosted verification configuration

The `hosted:preflight` and `hosted:verify` commands read only `apps/dental-api/.env.hosted.local` (ignored by Git), plus explicitly supplied process variables. They do not load the Docker `.env.local`. Set `SUPABASE_URL` to the approved Dev project, `SUPABASE_ANON_KEY` to its public key, and `SUPABASE_SECRET_KEY` to its server-only key. Existing process variables take precedence over the file; use a clean shell if local variables were exported. Both verifiers reject a different project before sending requests. The public preflight needs no server key; authenticated verification creates and cleans up labelled synthetic fixtures.

Run from the repository root: `pnpm --filter @dental/dental-api hosted:preflight`, then `pnpm --filter @dental/dental-api hosted:verify` when the server credential is configured. These checks do not activate real patient use or deploy an app.

The API prefix is /api/v1. NEXT_PUBLIC_API_URL is the HTTPS origin only. Exact frontend origins belong in ALLOWED_ORIGINS; do not use a wildcard. Public variables are embedded at build time, so rebuild after changes.

## Supabase target

Approved Dev project: DentalSpa OS Dev, giufpdppsunryyhfnzps. Leave DentalSpa V1 dbnxfqjevdffgrkvczli untouched.

The latest reconciliation records 85 local and 85 hosted migrations, including the team version-conflict correction. Private patient-document storage permits PDF/JPEG/PNG up to 20 MiB. A 6 MiB hosted library upload/download/archive workflow and the hosted team account/role/deactivation workflow have passed through a local API instance. Deployed browser acceptance remains outstanding.

Hosted HTTP checks passed on 2026-11-01 after the owner configured the API-only key: Auth/email confirmation, anonymous table/roster denial, two-clinic workspace/patient isolation, direct private Storage denial, refresh/access-token revocation and unaffected access for the second user. Temporary identity-fixture cleanup passed. Evidence: `.local/qa/hosted-verify-configured.log`. The synthetic catalogue → quote → invoice → payment scenario also passed, including frozen prices, numbering, replay, settlement/allocation limits, balances and role downgrade denial (`.local/qa/hosted-finance-flow.log`). These checks use a local API instance with hosted Supabase; deployed browser workflows and production readiness remain unverified. Audit-linked module fixtures are retained with test accounts disabled and gates closed.

## Release sequence

Before staging a release revision, run `pnpm publication:check`. It checks tracked and non-ignored untracked files for private environment/configuration files and common server-credential formats, and reports locations without printing credential values. Four isolated Git-fixture tests cover ignored versus tracked credentials, redacted reports, database URLs and unsupported file review. CI runs the same check. This is a source guard, not a complete secret scanner: binary assets, screenshots, Git history and formats outside its rules still require review. The 2026-11-01 working-tree check found no matching credentials in 1,077 text files; 44 binary paths were listed for separate review.

GitHub publication access was verified by a successful `git push --dry-run` to `codex/vercel-preview-readiness`. This checkout selects the `ayjabuilders` credential locally; no global account setting was changed. The dry run did not publish a commit or deploy an application.

Publication validation on 2026-11-01: `pnpm lint` and `pnpm typecheck` passed; 583 unit tests passed. The integration run passed 473/474 checks and exposed a stale migration-count assertion (84 instead of 85). After updating the expected count and final migration to the already-applied team conflict correction, the full migration-chain file passed all 8 checks. Logs: `.local/qa/publication-tests.log` and `.local/qa/publication-migration-chain.log`. `pnpm build` with `VERCEL=1`, isolated `.next-publication-check` directories and placeholder hosted origins completed all five build tasks successfully (`.local/qa/publication-hosted-build.log`). This proves compilation, not deployed connectivity or complete MVP acceptance.

The hosted Agenda scenario also passed (`.local/qa/hosted-agenda-flow-confirmed.log`): public requests, competing confirmation, automatic confirmation, move/cancel and public capacity updates. Test resources had explicit availability; clinic opening hours alone do not make a practitioner/chair available. No deployed browser or real-contact contract acceptance is implied.

1. Review and publish a coherent source revision, excluding .env files, local data, logs and temporary builds.
2. Configure the Git integration and four Vercel projects without activating real patient use.
3. Bind the API and browser origins, public configuration and API-only secrets using the environment matrix.
4. Verify hosted sign-in, session renewal/revocation, two-clinic isolation, private uploads/downloads, booking concurrency and financial workflows with labelled test data.
5. Complete backup/restore verification, remaining implementation and operational/privacy/clinical release decisions before accepting real patient data.

The Vercel account currently displays Hobby. Resolve hosting suitability for the intended commercial use before launch; no paid upgrade is authorized or performed here.

## Remaining limitations

Historical booking/contact/consent and finance contracts still contain synthetic-only restrictions. Some modules remain previews or incomplete. Removing labels or hiding routes does not make those workflows production-ready. Development routes are blocked on Vercel, but that is not a claim that every demo component has been removed from build artifacts.

See [the activation evidence and outstanding work](docs/HOSTED_FOUNDATION_ACTIVATION_PLAN.md), [the module progress ledger](docs/MODULE_PROGRESS.json) and [the work queue](docs/WORK_QUEUE.json). Preserve all MVP scope while closing these gaps; do not treat successful builds as completion.

## Hosted booking recovery — 2026-11-01

API deployment `dpl_3hbxgDH1YWLHkLr223vP3jiXrK9N` is Ready on
https://dentalspa-api.vercel.app. Native ESM bootstrap fixes the NestJS runtime
crash; health now returns HTTP 200. Public booking originally returned 503
because deployment activation and the default workspace agenda were absent.

The existing synthetic Atlas workspace now has a version-1 staff-review agenda:
three public example visits, one private follow-up type, Monday–Saturday sample
hours, and synthetic practitioner/chair resource windows for the next 31 days.
These are demonstration rules, not approved clinic opening hours. Resource
windows need extension or replacement before their horizon expires.

The owner's requested email has a validation-only manager membership, not
clinical authority. Credentials remain in an ignored local file and are not
included here. Configuration was saved through an authenticated RPC with its
normal audit/outbox emission. Public and staff agenda gates are enabled only
for this synthetic workspace; no real-patient activation is implied.

Deployed-origin checks passed: public visit catalogue (3 types), CORS, available
slots, request creation, same-key replay, owner visibility, anonymous 401 and
foreign-clinic 403. Evidence: `.local/qa/deployed-booking-smoke.json` (ignored).
One labelled fictitious verification request remains visible to staff. This is
a request awaiting staff review, not a confirmed appointment. Frontend browser
verification confirms visit choices load and next-day slot navigation works.
Other module gates and outstanding release criteria remain unchanged.

## Owner access audit — 2026-11-01

An authenticated audit of the deployed API found that the first owner's Auth
account and membership existed, but `public.profiles` was missing. The roster
correctly failed closed with 503. Added only that account's profile, with display
name `Administrateur Dental Spa`; no role or cross-clinic access changed.
Recheck: workspaces, patient list, team roster, agenda settings and booking
requests return 200. Team account management and finance catalogue still return
503 (deployment gates disabled); the local Salma fixture ID returns 404 on the
hosted patient hub. Therefore local fixture availability must not be inferred
from a successful hosted login or list response.

Owner bootstrap acceptance must check all three: Auth account, profile, and
active clinic membership. Auth provisioning alone is not complete. Diagnostic
sessions now log out with `scope=local`, so checks do not revoke the owner's
other phone/browser sessions. Evidence: ignored
`.local/qa/deployed-owner-module-access.json`. These checks establish route
availability only, not complete module functionality or real-patient readiness.
