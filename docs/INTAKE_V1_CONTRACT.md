# M02.1 manual intake — frozen development contract

Technical base: reviewed M01 foundation plus ADR-003. This first slice captures a manual inquiry, not a patient registration, merge, clinical record or booking. Synthetic development only. Shared Zod schemas in `packages/contracts/src/intake.ts` are authoritative; coordinator owns changes.

## HTTP

- `GET /api/v1/inquiries`: verified staff actor, reception/manager/dentist only. Returns `{items, truncated}`, most recent first (created_at descending, id descending), at most 100, explicit truncation if more exist. No public/patient route or arbitrary clinic query parameter.
- `POST /api/v1/inquiries`: same authorization; requires UUID `Idempotency-Key`. Body is strict `CreateInquiry`: display_name, nullable contact_email/contact_phone, source, nullable follow_up_at (ISO offset timestamp). Owner is always the verified creator in this slice, status always `new`; reject caller-supplied IDs/owner/status. Returns 201 `{item,replayed:false}` on create, 200 with the original result on identical replay; same clinic/actor/key with different normalized payload returns 409. Validation 400, absent identity 401, forbidden scope 403, disabled commands 503 with stable code `intake_disabled`; other 503 responses mean temporary unavailability, not disabled activation.
- Source values record manual attribution, not vendor integration. No free-form medical notes. No contact delivery or public enrollment.

## Persistence and authorization

Add bounded `intake` NestJS domain/application/infrastructure/presentation. Use the existing verified bearer/client and user-scoped Supabase RPC; never a browser service-role credential. An additive migration creates clinic-scoped inquiries and private idempotency records. Public table grants are select-only for authorized roles; no direct authenticated writes. A narrowly granted security-definer RPC revalidates auth.uid(), role and active clinic membership itself and uses a fixed search_path. Anonymous/patient/assistant callers and foreign clinic selection are rejected. Normalize input identically before comparison; SQL also validates input because direct RPC invocation must be safe.

Create inquiry, minimal audit reference and `InquiryCreated` v1 outbox envelope atomically. Do not persist contact values in logs/audit/outbox/error text. Atomic uniqueness/locking on the idempotency scope handles concurrent retries. RLS hides every other clinic's inquiries. Gate runtime POST behind `ENABLE_INTAKE_COMMANDS=true`; default false. The RPC additionally checks a private command-settings switch, disabled by default and writable only through trusted administration, so direct REST invocation cannot bypass disabled activation. Tests explicitly enable this switch in isolated synthetic databases. No hosted migration or production activation in this slice.

Normalization is fixed: trim display_name and phone, retain email case/whitespace (invalid whitespace is rejected), and canonicalize follow_up_at as a PostgreSQL timestamptz instant. Idempotency compares canonical normalized fields; equivalent timestamp offsets count as the same value. No implicit contact matching or merging.

## Frontend

Add `/intake` to Clinic OS with the existing pearl/navy visual system, searchable inquiry list, selected details, source filter and creation dialog. New inquiry form: name, source, optional email/phone and follow-up date/time; assignee shown as current user. No fake status updates, patient conversion or booking actions.

Use an injectable typed transport with list/create. Standalone route uses explicitly labelled synthetic, memory-only demo transport. In the existing connection screen, a verified session may open the same component with an authenticated HTTP transport retaining credentials only in memory; no URL/localStorage/sessionStorage token handoff. Existing session expiry and logout must clear connected inquiry data. Reuse a UUID idempotency key across retries of unchanged submitted values; issue a new key when the payload changes or the user starts a new successful request. Only show saved success after validated response. Surface disabled, offline, denied, retry and truncated-list states accurately.

## Acceptance

Contract validation, route permission negatives, active-role SQL tests, cross-tenant list/RPC denial, strict input and idempotency replay/conflict tests, and audit/outbox rollback evidence. Browser tests cover demo create/filter/detail and error/pending states; configured live Supabase verification remains an activation gate. UI shows the server-owned assignee and never claims a confirmed booking. The next slice is explicit patient duplicate review/linking, not automatic merge.
