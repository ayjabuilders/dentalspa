# Patient communication preferences

The local Patient Pass preview stores selections only in component memory. It makes no API request and forgets the values when the account screen is left or reloaded.

The connected endpoint is separate and disabled unless both controls are enabled:

- API process: `ENABLE_PATIENT_COMMUNICATION_PREFERENCES=true`
- Database owner setting: `private.patient_communication_settings.enabled=true`

Keep both off until privacy/retention approval. The native PostgreSQL test `supabase/tests/patient_communication_preferences.test.sql` passed 41/41 locally, covering own-account and foreign/unverified access, default-off writes, strict vocabulary, compare-and-set revisions, idempotent replay, no-op semantics, minimal audit/outbox and rollback on sink failure. Embedded PGlite and HTTP tests remain separate evidence. Never enable the database setting through a client API and never apply this migration to hosted Supabase as part of local demo work.

The values are limited to a preferred channel, language and time zone. They are not consent, confirmed reachability, interpretation, permission to contact, or an instruction to send a message. Audit and outbox events omit the selected values. This feature does not collect phone numbers, email addresses, clinical information, or patient instructions.
