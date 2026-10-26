# Inquiry communication time zone v1 — explicitly stated administrative record

Status: frozen for bounded synthetic M01 development after independent security/domain, UX and API/database review. This resource records only the named time zone a person explicitly states for administrative communication about one inquiry. It is not residence, nationality, current location, availability, consent, a preferred calling window, or authorization to send a message.

## Meaning and versioned vocabulary

- The separate projection starts as `null`, meaning **no communication time zone is recorded**. There is no inferred default and no “no preference” value.
- Synthetic catalogue version 1 is exactly: `Africa/Casablanca`, `Africa/Dakar`, `America/New_York`, `America/Sao_Paulo`, `America/Toronto`, `Asia/Dubai`, `Asia/Riyadh`, `Asia/Tokyo`, `Australia/Sydney`, `Etc/UTC`, `Europe/London`, `Europe/Paris`. These canonical IANA identifiers are a representative development vocabulary, not an approved market list. Matching is exact: no trimming, case folding, abbreviations, fixed offsets, legacy aliases or runtime-dependent normalization.
- The same frozen catalogue is shared by contract, API and database validation. Neither browser ICU nor PostgreSQL `pg_timezone_names` independently defines accepted input. Catalogue changes require a new contract/event version and migration review.
- Staff deliberately select the value. The system never infers it from phone country code, address, name, language, browser/device zone, inquiry source, IP/geolocation, nationality or follow-up history.
- Clearing to `null` means only that the administrative record was cleared. It does not alter deadlines, contact preferences, language, consent, location or any appointment.
- V1 records and displays the identifier only. It does not convert or edit follow-up instants, choose DST offsets, schedule contact, determine “safe to call” windows or change the application's locale.
- State follows the inquiry through future authorized reassignment. A former owner cannot read or replay it; the new owner receives no former-owner identity through this resource.

## Authority and privacy

- The server derives clinic and actor from a verified session. Only the inquiry's **current owner**, with active `reception`, `manager` or `dentist` membership in that clinic, may read or change this resource. Managers have no implicit override for another owner's inquiry.
- API and privileged database paths independently enforce tenant, active role and current ownership. Absent, foreign-clinic and other-owner targets share the same not-found boundary. Patient, assistant, inactive and former-owner callers are denied.
- State lives in a private projection rather than on the broadly staff-readable inquiry row. Original inquiries, deadlines and other qualification projections remain unchanged. RLS is enabled as defense in depth and direct table access is revoked.
- Reads expose only schema/catalogue versions, inquiry/clinic/current-owner IDs, nullable time zone, revision and server update time. Receipts/events contain no name, contact value, source, free text, device zone or former-owner identity. Responses are `Cache-Control: no-store`; request bodies are not logged.

## HTTP, concurrency and activation

`GET /api/v1/inquiries/:id/communication-time-zone` returns strict `InquiryCommunicationTimeZoneStateSchema`. Initial state is `time_zone: null`, `revision: 0`, `updated_at: null`; a positive revision requires an update time. Reads reject query parameters and remain available while writes are disabled.

`POST /api/v1/inquiries/:id/communication-time-zone` requires a UUID path, UUID `Idempotency-Key` header and strict body `{ expected_revision, time_zone }`. Revision is an integer from 0 through 2147483647 and prevents stale A→B→A overwrites. Every successful first execution, no-op or replay returns HTTP 200. Internal RPC transport is POST-only.

The API checks default-off `ENABLE_INTAKE_COMMANDS=true`. In one transaction, the database locks the current-clinic inquiry, revalidates current ownership and active role, verifies trusted `private.intake_command_settings.enabled=true`, then resolves an exact actor/clinic/inquiry/command/key receipt before compare-and-set. Exact replay returns the immutable original receipt; changed payload reuse returns 409. Revoked/former owners and disabled activation cannot replay saved receipts.

Persistence is time-zone-specific: private tables `inquiry_communication_time_zones` and `inquiry_communication_time_zone_receipts`, command discriminator `set_communication_time_zone`, and POST-only RPCs `get_inquiry_communication_time_zone` / `set_inquiry_communication_time_zone`. Language, contact-preference and scheduling state, keys and receipts are never reused.

After replay resolution, current revision must equal `expected_revision`, even if the requested value matches current state. A no-op stores an immutable receipt with unchanged revision/update time and emits no audit/outbox event. A real change increments once and atomically updates state, receipt, audit and outbox. At the revision ceiling, replay/no-op remains possible; a real change returns sanitized 409.

The result contains a strict minimal receipt plus `replayed`. The receipt has inquiry/clinic/current-owner IDs, catalogue version, previous/requested time zone, previous/current revision, `changed`, server `recorded_at` and `event_version: 1`. It is historical command evidence, not current state after later changes; clients reread fresh authorized state after success or replay.

Public failures are 400 malformed input/header/path/query, 401 absent/expired identity, 403 denied role, 404 absent/foreign/not-current-owner, 409 stale/key-conflict/revision-ceiling and 503 disabled/unavailable. Writes require API `ENABLE_INTAKE_COMMANDS=true` plus trusted `private.intake_command_settings.enabled=true`; disabled write retains `intake_disabled`.

For a real change, audit action and outbox event `InquiryCommunicationTimeZoneChanged` version 1 use the inquiry aggregate. Payload is exactly `{ catalogue_version, previous_time_zone, time_zone, previous_revision, revision, recorded_at }`; identity/correlation remain envelope fields. No clock conversion, notification, provider or message consumer is activated.

## UI acceptance

The authorized inquiry detail adds one compact “Fuseau horaire” row beneath Contact and Langue inside the existing “Informations déclarées” section. `null` displays “Aucun fuseau consigné”. The selected value displays a readable French label followed by its canonical identifier; labels never replace the stored identifier.

Persistent copy states: “Indication déclarée pour le contact. Elle ne modifie aucune échéance, ne définit pas une heure d’appel et ne programme aucun envoi.” “Renseigner” / “Modifier” opens the existing accessible dialog pattern with a deliberate selection and no inferred default. Clearing is a distinct “Effacer le fuseau consigné” action, never the empty select placeholder.

The dialog identifies this as a “Catalogue de démonstration limité” so an absent zone never invites an inaccurate substitute. Human labels use “Fuseau …”, never “Lieu …”; offset badges and local-time previews are omitted.

The three compact rows use dividers rather than stacked dashboard cards. Each resource retains independent loading/error/retry and uncertain-command recovery. There is no combined save action, completeness score, “qualified” state, automatic local-time preview or additional schedule editor in v1.

Support loading, empty, saving, success, no-change, neutral 409 recovery, unknown-result verification, offline, denied, expired and unavailable states without optimistic success. Ordinary selection/dialog navigation aborts stale reads and resets unsent drafts. An uncertain command remains bound to its original inquiry/key/body in session memory for explicit verification only. No background retry or offline queue. Logout, expiry, clinic/session replacement, offline transition, disposal, authority loss or 404 aborts and clears private state; late responses are ignored. Time-zone recovery is isolated from contact, language and schedule attempts.

Use the Dental Spa pearl/navy system, 14px working text, wrapping identifiers, 44px mobile targets, visible focus/labels, live status feedback and reduced-motion behavior. Stack label/value/action at 390px without page-level horizontal overflow. The synthetic `/intake` demo and authenticated `/connection` mode remain visibly distinct.

## Verification and gates

Test anonymous/patient/assistant/inactive/foreign/other-owner/former-owner denial in HTTP and privileged SQL paths; reads with switches off; independent API/database write gates; null initialization; every catalogue value and clearing; exact SQL/Zod catalogue parity; missing/wrong receipt catalogue version; exact rejection of aliases, offsets, inference and extra fields; unchanged language/contact/deadline state; no-op stability; stale and A→B→A conflict; revision ceiling; exact replay/key conflict; two-session contention/replay; rollback at every sink; minimized payloads; private table access; no-store/no logging; UI cross-inquiry/late-response/session cleanup; independent recovery while contact/language/schedule recovery is pending; and mobile focus return.

Real clinic market coverage, catalogue governance, wording, calling-window policy, timezone conversion/editing, hosted identity, production activation and messaging remain explicit approval/release gates. V1 must not be used to reschedule a deadline or claim a person's location or availability.

Sources: [master workflows](03_MASTER_WORKFLOWS.md) GJ-01 step 3 explicitly calls for international timezone qualification; [domain model](05_DOMAIN_MODEL.md) requires UTC timestamps and tenant ownership; [manual intake contract](INTAKE_V1_CONTRACT.md) fixes the original inquiry; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) require tenant-safe development with separate activation gates.
