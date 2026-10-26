# Inquiry communication language v1 — explicitly stated administrative record

Status: frozen for bounded synthetic M01 development after independent security/domain, UX and API/database review. This resource records only the language preference a person explicitly states for administrative communication about one inquiry. It is not the application locale, proof of comprehension, interpreter availability, consent, a clinical-language assessment, or authorization to send a message.

## Meaning and vocabulary

- The separate projection starts as `null`, meaning **no communication language is recorded**. It is not the same as `no_preference`, which records an explicitly stated absence of preference.
- The synthetic v1 vocabulary is exactly `fr`, `ar`, `en`, `other` and `no_preference`. These codes are a development vocabulary pending clinic approval. Matching is exact: no trimming, case folding, locale aliases or automatic normalization. `other` stores no free text and does not claim that staff or an interpreter supports the language.
- Staff deliberately select the value. The system never infers language from a name, phone country code, inquiry source, browser locale, account locale, prior follow-up, geography or message content.
- Clearing to `null` means only that the administrative language record was cleared. It does not withdraw consent, refuse contact or alter any patient/application locale.
- The state follows the inquiry through future authorized reassignment. A former owner cannot read or replay it; the new owner receives no former-owner identity through this resource.

## Authority and privacy

- The server derives clinic and actor from a verified session. Only the inquiry's **current owner**, with active `reception`, `manager` or `dentist` membership in that clinic, may read or change this resource. Managers have no implicit override for another owner's inquiry.
- API and privileged database paths independently enforce tenant, active role and current ownership. Absent, foreign-clinic and other-owner targets share the same not-found boundary. Patient, assistant, inactive and former-owner callers are denied.
- State lives in a private projection rather than on the broadly staff-readable inquiry row. Original inquiries and prior receipts remain unchanged. RLS is enabled as defense in depth and direct table access is revoked.
- Reads expose only schema version, inquiry/clinic/current-owner IDs, nullable language, revision and server update time. Receipts/events contain no name, contact value, source, free text or former-owner identity. Responses are `Cache-Control: no-store`; request bodies are not logged.

## HTTP, concurrency and activation

`GET /api/v1/inquiries/:id/communication-language` returns strict `InquiryCommunicationLanguageStateSchema`. Initial state is `language: null`, `revision: 0`, `updated_at: null`; a positive revision requires an update time. Reads reject query parameters and remain available while writes are disabled.

`POST /api/v1/inquiries/:id/communication-language` requires a UUID path, UUID `Idempotency-Key` header and strict body `{ expected_revision, language }`. Revision is an integer from 0 through 2147483647 and prevents stale A→B→A overwrites. Every successful first execution, no-op or replay returns HTTP 200. Internal RPC transport is POST-only.

The API checks default-off `ENABLE_INTAKE_COMMANDS=true`. In one transaction, the database locks the current-clinic inquiry, revalidates current ownership and active role, verifies trusted `private.intake_command_settings.enabled=true`, then resolves an exact actor/clinic/inquiry/command/key receipt before compare-and-set. Exact replay returns the immutable original receipt; changed payload reuse returns 409. Revoked/former owners and disabled activation cannot replay saved receipts.

Persistence is language-specific: private tables `inquiry_communication_languages` and `inquiry_communication_language_receipts`, command discriminator `set_communication_language`, and POST-only RPCs `get_inquiry_communication_language` / `set_inquiry_communication_language`. Contact-preference state, keys and receipts are never reused.

After replay resolution, current revision must equal `expected_revision`, even if the requested value matches current state. A no-op stores an immutable receipt with unchanged revision/update time and emits no audit/outbox event. A real change increments once and atomically updates state, receipt, audit and outbox. At the revision ceiling, replay/no-op remains possible; a real change returns sanitized 409.

The result contains a strict minimal receipt plus `replayed`. The receipt has inquiry/clinic/current-owner IDs, previous/requested language, previous/current revision, `changed`, server `recorded_at` and `event_version: 1`. It is historical command evidence, not current state after later changes; clients reread fresh authorized state after success or replay.

Public failures are 400 malformed input/header/path/query, 401 absent/expired identity, 403 denied role, 404 absent/foreign/not-current-owner, 409 stale/key-conflict/revision-ceiling and 503 disabled/unavailable. Writes require API `ENABLE_INTAKE_COMMANDS=true` plus trusted `private.intake_command_settings.enabled=true`; disabled write retains `intake_disabled`.

For a real change, audit action and outbox event `InquiryCommunicationLanguageChanged` version 1 use the inquiry aggregate. Payload is exactly `{ previous_language, language, previous_revision, revision, recorded_at }`; identity/correlation remain envelope fields. No translation, interpreter, notification, provider or message consumer is activated.

## UI acceptance

The authorized inquiry detail presents “Langue de communication déclarée” within the same calm qualification area as contact preference. `null` displays “Aucune langue consignée”; `no_preference` displays “Sans préférence linguistique — explicitement déclaré.” The dialog shows a freshly read current value and requires a deliberate new selection with no inferred default.

Persistent copy states: “Déclaration administrative. Elle ne change pas la langue de l’application, ne vérifie pas la compréhension, ne garantit pas un interprète et n’envoie aucun message.” `other` is labelled “Autre langue — sans détail enregistré.” Clearing is a distinct action, never the empty select placeholder.

Present contact preference and communication language within one calm “Informations déclarées” section using two compact, divided rows rather than stacked dashboard cards. Each resource retains independent loading/error/retry and uncertain-command recovery. There is no combined save action, completeness score or “qualified” status.

Support loading, empty, saving, success, no-change, neutral 409 recovery, unknown-result verification, offline, denied, expired and unavailable states without optimistic success. Ordinary selection/dialog navigation aborts stale reads and resets unsent drafts. An uncertain command remains bound to its original inquiry/key/body in session memory for explicit verification only. No background retry or offline queue. Logout, expiry, clinic/session replacement, offline transition, disposal, authority loss or 404 aborts and clears private state; late responses are ignored. Language recovery is isolated from contact-preference and schedule attempts.

Use the Dental Spa pearl/navy system, 14px working text, 44px mobile targets, visible focus/labels, live status feedback and reduced-motion behavior. The synthetic `/intake` demo and authenticated `/connection` mode remain visibly distinct.

## Verification and gates

Test anonymous/patient/assistant/inactive/foreign/other-owner/former-owner denial in HTTP and privileged SQL paths; reads with switches off; independent API/database write gates; null initialization; every enum and clearing; rejection of inferred/extra/free-text fields; no-op stability; stale and A→B→A conflict; revision ceiling; exact replay/key conflict; two-session contention/replay; rollback at every sink; minimized payloads; private table access; no-store/no logging; and UI cross-inquiry/late-response/session cleanup.

Real clinic vocabulary, Arabic/Darija wording, interpreter workflow, translation quality, clinical comprehension, hosted identity, production activation and messaging remain explicit approval/release gates.

Sources: [master workflows](03_MASTER_WORKFLOWS.md) GJ-01 step 3 calls for language qualification; [module PRD](04_MODULE_PRD.md) M01 requires lead qualification; [manual intake contract](INTAKE_V1_CONTRACT.md) fixes the original inquiry; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) require tenant-safe development with separate activation gates.
