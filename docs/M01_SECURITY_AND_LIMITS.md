# Foundation boundaries and remaining gates

## Implemented

- Supabase `auth.getUser(token)` verifies identity with the provider; decoding an unverified JWT never authorizes a request. Active membership/verified patient links are fetched server-side. Missing policy, token, role or clinic scope fails closed.
- Clinic selection is a routing hint, never authority. Both repository filters and application policy validate tenant and resource ownership. A deliberately overprivileged test repository cannot leak another clinic's records.
- Patient-only projection discards staff roles before reading the linked patient. No name/phone matching or user metadata grants access.
- Public tables enable RLS and explicitly grant only authorized reads. There are no client write policies or self-enrollment APIs. Compound foreign keys prevent patient links crossing clinics.
- `patient-documents` is private with no object access policies. Uploads, reads and signed URL creation remain unavailable, including for a legitimate patient, until explicit release metadata and document services exist.
- Logging includes only generated/validated correlation ID, method, status and elapsed time. No URL, query, body, user name, email, token, document, audio or transcript logging is introduced.
- Audit/outbox/consumer tables live in a non-exposed private schema. Consumer/event uniqueness prevents replay at the persistence boundary. A disabled transactional worker foundation adds per-consumer leases, bounded retries, dead state and fixed-outcome attempt history. It is not connected to a production driver, scheduler or external transport.
- PWA cache is public-assets-only; offline reopening shows a static connection screen. It cannot show a saved patient record.

## Not completed / not safe to treat as production-ready

- Hosted Supabase Auth, Storage endpoints, signed-link denial, realtime isolation and session revocation have not been tested against the supplied project. Embedded SQL tests use stub Auth/Storage schemas; HTTP tests use fake identity and repository adapters.
- Full local Supabase and pgTAP require Docker/Podman; neither was available in this environment. The separate CI database job is provided, not yet execution evidence.
- Clinician licensure checks, MFA, secure enrollment/recovery and verified patient-account provisioning need product/security decisions. No patient login/enrollment UI is claimed.
- No domain mutation is exposed in M01. Domain write + audit + outbox producers are still absent. The worker's local SQL effects and consumption commit together in tests; a real transactional adapter, least-privilege worker role, timeout policy, multi-connection/crash tests and reviewed dead-work replay remain activation gates. It cannot deliver external side effects. See `apps/dental-api/src/audit/worker/README.md`.
- No real booking, clinical signing, treatment plan, template execution, notifications delivery, lab workflow, billing or AI. Future routes clearly show their unavailable status. No sample template is declared approved.
- Staging backup/restore, production runtime, regional/legal review, operational fallback and real-device installed PWA validation remain release gates.
- Auth UI is a development connection screen with memory-only session and explicit clinic UUID, not a finished staff onboarding/organization-switching UX.

## Next small slice

Complete M01's hosted/local integration and staging restore evidence before accepting M01. Then execute M02 only after acceptance: inquiry ownership and duplicate review, request-versus-confirmed booking states, transactional resource constraints, idempotent confirmation/outbox, and the authorized patient appointment projection. Do not implement this journey as hardcoded React business rules.

## Source provenance

The requested workshop visual language supersedes only `docs/08_DESIGN_SYSTEM.md`'s explicitly proposed brand colors. Its clinical, authorization, patient privacy and milestone boundaries remain authoritative. The fonts include their OFL licenses; illustrations are generated reference assets, not actual patients or treatment outcomes. See `docs/UI_ASSET_PROVENANCE.md`.
