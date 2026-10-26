# 10 — Technical Architecture

## Selected approach / ADR change
The original guide proposes a Django REST modular monolith. The owner subsequently chose **NestJS + TypeScript** alongside Next.js/Supabase/Vercel; see `adr/ADR-001_BACKEND_STACK.md`. Preserve architectural rationale from guide (bounded modules, transactions, authorization, outbox, async workers) while changing language/framework.

## Suggested monorepo
```
apps/clinic-os/         # Next.js: staff desktop PWA
apps/patient-pass/      # Next.js: patient mobile PWA
apps/public-booking/    # Next.js: public acquisition/booking
apps/dental-api/        # NestJS: modular API
packages/contracts/     # generated OpenAPI types, domain/event schemas
packages/design-tokens/ # semantic brand tokens
packages/ui-clinic/     # staff desktop components
packages/ui-patient/    # mobile patient components
supabase/migrations/    # versioned DB
supabase/tests/         # RLS and other DB checks
services/ai-runtime/    # later, Python only if needed
```

## API and communications
REST versioned `/api/v1/` with OpenAPI for frontend and partner access. Frontends use scoped BFF/read-model endpoints when needed (e.g., `/me/next-actions`); clinical mutations through NestJS application services and transactions. Realtime communicates post-commit updates, never grants authorization by itself. Future external modules use APIs + versioned domain events; do not query each other's private tables.

## Data and background jobs
Supabase PostgreSQL with explicit tenant clinic_id + integrity guards. Transactional outbox written alongside business transaction. Dedicated worker with retries/backoff, dead-letter logging, idempotent consume table. Select reliable worker hosting based on actual Vercel capabilities and latency requirements. Use database connection pooler/limits suitable for serverless. Storage objects private by default, versioned metadata/release checks.

## Booking concurrency
Read availability is informational; hold/confirm within DB transaction with constraints preventing double booking of same resource and overlapping time windows. Durable idempotency key on public booking POST. Never trust browser calendar state to reserve a slot.

## Testing/observability
Unit, integration, contract, DB policy tests, Playwright e2e, keyboard/mobile PWA tests, patient-to-staff privacy tests. Correlation IDs, redacted structured logs, traces/metrics without health data, audit store access. Safe dev/demo fixture seed; CI checks before merge.

## Deployment
Separate Vercel frontend projects (Clinic OS, Patient Pass, Public Booking). API deployment to a supported NestJS environment, Vercel target only after verifying runtime/DB pooling/security; worker/transcription gateway may need independently hosted compute. Staging separate from production, independent Supabase project(s), backups, tested restore and manual rollback.
