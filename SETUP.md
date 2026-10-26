# Run the Dental Spa foundation

This is Milestone 01, using synthetic data. Clinical actions, real booking, patient enrollment, live messaging, recording and AI processing are not implemented.

## Requirements

- Node.js 24 and pnpm 11.25.0 (declared in `package.json`).
- Docker Desktop or Podman for the full local Supabase stack. The UI and embedded PostgreSQL tests run without Docker or cloud credentials.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

| App | Local address | Purpose |
| --- | --- | --- |
| Clinic OS | http://localhost:4200 | Staff UI preview; `/patients` list/detail; `/connection` development authentication |
| Patient Pass | http://localhost:4201 | Independent mobile preview with bottom tabs |
| Public Booking | http://localhost:4202 | Landing shell; no request is submitted or confirmed |
| NestJS API | http://localhost:4300/api/v1/health | Health; guarded foundation read endpoints |
| API documentation | http://localhost:4300/api/docs | Development only |

Ports 4173/4174 belong to the earlier standalone UI workshop, not this monorepo.

## Production-mode local PWA preview

```powershell
pnpm build
pnpm --filter @dental/clinic-os start
# In separate terminals:
pnpm --filter @dental/patient-pass start
pnpm --filter @dental/public-booking start
pnpm --filter @dental/dental-api start
```

Do not run `dev` and `start` on the same app/port at once. Use Chrome or Edge's install action. Patient Pass also has installation guidance for Safari. Service workers register only in production-mode builds. `scripts/pwa.mjs` generates content-versioned workers, manifests and a static offline screen. They cache an explicit public-asset allowlist, never authenticated API responses or page HTML containing records. Updates require an explicit reload confirmation. Installed-window behavior and physical iOS/Android behavior still require manual checks.

## Local Supabase

```powershell
pnpm db:start
pnpm db:reset
pnpm db:test
pnpm exec supabase db lint --local --level error
```

`db:reset` targets the local development database and deletes/recreates its local data. Do not change it to a linked/remote reset. The seed creates only two clearly fictional clinics. Create development Auth users through local Studio, then provision approved active memberships or verified patient links through trusted local SQL administration. There is intentionally no browser self-assignment or name-based patient linking. No test credentials or real patient accounts are committed.

Copy `.env.example` API values into `apps/dental-api/.env`, and its `NEXT_PUBLIC_` values into each frontend's `.env.local`. Use the local URL and anon/publishable key from local Supabase. Never put a service-role/secret key in a public environment variable. The API passes the verified user's token into database requests to preserve RLS and also enforces clinic/resource policy in its application services.

Clinic `/connection` signs in against Supabase and loads only the API-authorized minimal patient summaries. It keeps the session in memory, clears records on logout and performs `no-store` requests. The synthetic workspace is a separate preview; it does not impersonate this signed-in session. Patient Pass enrollment/login UI remains a later integration; its own-resource API boundary is implemented and tested.

The user supplied cloud project is `dbnxfqjevdffgrkvczli` (DentalSpa V1, ayjabuilders's Org). MCP OAuth is configured locally, outside this repository. No hosted migration or cloud secrets are included in this foundation. GitHub remote: `https://github.com/ayjabuilders/dentalspa.git`.

## Checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm contracts:generate
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

Unit checks cover policies, event validation, log minimization and PWA assets. API integration tests run the actual NestJS route/guard boundary with test-only identity/repository replacements. Embedded PostgreSQL tests execute the real migration and RLS against minimal Auth/Storage schema stubs; they do not replace a full Supabase test. `supabase/tests/foundation.test.sql` contains the full-stack pgTAP policy suite. Browser tests run the built apps and include theme persistence, search, filters, dialogs, responsive overflow, reduced motion and offline reopening. CI includes a separate Docker-backed database job; it has not run until pushed and executed by GitHub.

## Deployment boundary

No deployment is configured or performed. Each Next.js app can later use its own Vercel project/root, after environment and privacy review. The NestJS runtime and database connection pattern must be validated before selecting API hosting. Durable outbox processing is not implemented as a request-handler background task. Staging backup/restore and hosted tenant/storage checks are release gates, not fulfilled by the local tests.
