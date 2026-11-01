# P0 multi-tenant isolation audit

Date: 2026-10-29
Status: read-only code/schema review completed; no confirmed cross-tenant read/write bypass found in the implemented P0 surfaces reviewed.

## SaaS isolation model verified

- The API verifies the bearer identity with Supabase Auth, loads active clinic memberships through the user-scoped client, and resolves the selected clinic only when that same user has an active membership. Request `clinic_id` values are not accepted as authority for these operations.
- Current API repositories use the caller's bearer token with the publishable/anon key. The reviewed paths do not use a service-role client; future service-role code must enforce tenant authorization itself because service-role connections bypass RLS.
- Core public tables enable RLS. Patient/account links and inquiries use clinic-scoped constraints, including composite clinic/record foreign keys where relevant. Direct mutations to sensitive tables are revoked and writes are exposed through narrow RPCs.
- Reviewed `SECURITY DEFINER` RPCs set an empty search path, revoke default public/anonymous execution, grant only intended authenticated execution, derive the actor from `auth.uid()`, and check clinic/membership/role or record ownership inside SQL. API calls pass the clinic from the verified actor and validate response tenant scope.
- The new contact-outcome draft follows the same multi-tenant boundary: private event/idempotency tables with RLS and direct grants revoked; clinic-scoped inquiry FK; active membership and current-owner checks in SQL; a transaction-held membership/inquiry lock; foreign-ID concealment; and independent API and database switches defaulting off.

## Reviewed implementation areas

Identity/tenant resolution; patient list/detail and patient lookup; account-linked patient reads and preferences; scheduling resource/availability/hold RPCs; clinic roster and team activity; manual intake, inquiry detail/worklists/search, follow-up, planned actions, schedules, contact preferences/language/time zone, owner reassignment; and the new contact-outcome API/database slice.

## Findings

No confirmed tenant-isolation bypass was identified in those paths. Existing database tests include cross-clinic ID denial/concealment cases for the major RPCs, and API validation rejects responses carrying a different clinic ID. This review did not infer new clinic workflow policy or change any role grants.

One role-policy difference is unresolved, not a tenant leak: patient list/detail permit any active clinic staff role, including Assistant, while patient lookup is limited to Reception, Manager and Dentist (`apps/dental-api/src/patients/application/patients.service.ts`). Keep this difference until the clinic approves its role/action matrix; do not tighten clinical-adjacent access by inference.

## Limits and next security gates

- This was a source and local-test review, not an independent penetration test or formal privacy/security certification.
- The focused contact-outcome contract/API/PGlite tests passed 21/21. The full integration suite passed 336/336 tests across 43 files. PGlite serializes transactions and does not prove independent-session lock races.
- Supabase-hosted migrations, data, settings and production endpoints were not touched. The new contact-outcome database/API switches remain disabled pending privacy approval of event visibility and retention.
- A full local Supabase/PostgreSQL pgTAP and independent-connection concurrency run remains required before activating gated connected operations.
