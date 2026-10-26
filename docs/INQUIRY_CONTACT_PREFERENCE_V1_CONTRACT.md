# Inquiry contact preference v1 — explicitly stated administrative record

Status: draft for independent review before bounded synthetic M01 development. This resource records only the contact channel preference a person explicitly stated for one inquiry. It is not consent, verified reachability, a contact instruction, a successful contact, or authorization to send a message.

## Meaning and vocabulary

- The separate preference projection starts as `null`, meaning **no preference is recorded**. It is not the same as `no_preference`, which means staff explicitly recorded that the person stated no particular preference.
- The synthetic v1 vocabulary is `phone`, `email` and `no_preference`. This is a development vocabulary, not an approved clinic policy. It deliberately excludes WhatsApp/provider activation, free text, contact windows, urgency, language, refusal or do-not-contact semantics.
- Staff must select a value deliberately. The system never infers it from inquiry source, available phone/email fields, previous follow-up channel or any patient record. A preference may be recorded even when the corresponding contact detail is absent; that does not make the detail reachable or valid.
- Clearing to `null` means only that the administrative preference record was cleared. It does not withdraw consent or create a do-not-contact instruction.
- Preference state follows the inquiry through a future authorized reassignment. The former owner cannot read or replay it; the new current owner sees no former-owner identity through this resource.

## Authority and privacy

- The server derives clinic and actor from a verified session. Only the inquiry's **current owner**, with an active `reception`, `manager` or `dentist` membership in that clinic, may read or change this resource. Managers have no implicit override for another owner's inquiry.
- API and privileged database paths independently enforce tenant, active role and current ownership. Absent, foreign-clinic and other-owner targets share the same not-found boundary. Patient, assistant, inactive and former-owner callers are denied.
- Preference state is stored in a private projection rather than adding a broadly staff-readable inquiry column. Original inquiry and intake receipts remain unchanged. Direct table access is denied.
- Reads return only schema version, inquiry/clinic/current-owner identifiers, nullable preference, revision and server update time. Receipts and events contain no name, contact value, source, evidence text or former-owner identity. All responses and errors are `Cache-Control: no-store`; request bodies are not logged.

## HTTP, revisions and idempotency

`GET /api/v1/inquiries/:id/contact-preference` returns strict `InquiryContactPreferenceStateSchema`. Initial state is `preference: null`, `revision: 0`, `updated_at: null`. Any positive revision has a non-null update time. Reads remain available while write switches are disabled. GET and POST reject query parameters; internal database RPCs are invoked through POST-only transport.

`POST /api/v1/inquiries/:id/contact-preference` requires one UUID path, UUID `Idempotency-Key` header and strict `SetInquiryContactPreferenceSchema`: `{ expected_revision, preference }`. Revision is an integer from 0 through 2147483647 and prevents stale A→B→A overwrites. Every successful command, including first execution, no-op and replay, returns HTTP 200.

Inside one transaction, the database locks the current-clinic inquiry, revalidates current ownership and active role, verifies both existing default-off intake write switches, then resolves an exact actor/clinic/inquiry/command/key receipt before compare-and-set. An exact payload replay returns the immutable original receipt; the same key with different normalized input returns 409. Revoked/former owners and disabled activation cannot replay saved receipts.

After replay resolution, the current revision must equal `expected_revision`, even when the requested value equals current state. A no-op atomically stores an immutable receipt with the same revision and update time and emits no audit/outbox event. A real change increments revision once, updates the state timestamp and atomically stores the receipt, audit and outbox rows. At maximum revision, replay/no-op remains possible but a real change returns sanitized 409.

The strict result returns `receipt` plus `replayed`. The receipt records inquiry/clinic/current-owner IDs, previous/requested preference, previous/current revision, `changed`, server `recorded_at` and `event_version: 1`. It is historical command evidence, not proof of current state after later changes. After every success or replay, the client fetches fresh authorized state before presenting the current preference.

Public failures: 400 malformed input/header/path, 401 identity absent/expired, 403 role denied, 404 absent/foreign/not-current-owner, 409 stale revision/key conflict/revision exhaustion, and 503 disabled/unavailable. Writes require API `ENABLE_INTAKE_COMMANDS=true` and trusted `private.intake_command_settings.enabled=true`; a disabled write preserves `intake_disabled`.

For a real change, audit action and outbox event `InquiryContactPreferenceChanged` version 1 use the inquiry aggregate. The outbox payload is exactly `{ previous_preference, preference, previous_revision, revision, recorded_at }`; identity and correlation remain envelope fields. No consumer, notification or message delivery is activated.

## UI acceptance

The existing authorized inquiry detail shows a compact “Préférence de contact déclarée” block. `null` displays “Aucune préférence consignée,” not “Aucune préférence.” The dialog shows the freshly read current value separately and requires an explicit new selection with no derived default.

The dialog distinguishes “Sans préférence particulière — explicitement déclaré” from the separate action “Effacer la préférence consignée.” Clearing is a deliberate action, never the empty select placeholder. A 409 uses the neutral instruction “La modification ne peut pas être appliquée. Relisez l’état actuel avant une nouvelle décision,” because stale revision, key conflict and revision exhaustion share that boundary.

Persistent explanatory copy states: “Déclaration manuelle. Elle ne vaut pas consentement, ne vérifie pas les coordonnées et n’envoie aucun message.” Missing contact coordinates are shown separately and do not disable a preference choice. There is no contact/send action.

The interface supports loading, empty, saving, success, no-change, stale conflict, unknown-result verification, offline, denied, expired and unavailable states without optimistic success. Ordinary selection or dialog navigation aborts stale reads and resets unsent drafts. An unknown network result instead remains bound to its original inquiry/key/body in session memory and offers only explicit verification; there is no automatic/background retry or offline queue. Preference recovery state is isolated from schedule/follow-up recovery. Logout, expiry, clinic/session replacement, offline transition, transport disposal, authority loss or a 404 aborts requests and clears selected private detail plus pending recovery; late responses are ignored.

Use the Dental Spa pearl/navy system, 14px working text, 44px mobile targets, visible labels/focus, live status announcements and reduced-motion support. Return focus to the initiating control. The synthetic `/intake` demo and authenticated `/connection` mode remain visibly distinct.

## Verification and gates

Test anonymous/patient/assistant/inactive/foreign/other-owner/former-owner denial in HTTP and privileged SQL paths; read behavior with switches off; independent API/database write gates; null initialization; every enum; explicit clearing; rejection of inferred/extra/contact fields; no-op revision stability; stale and A→B→A conflicts; revision ceiling; exact replay/key conflict; two-session contention/replay; rollback at each persistence boundary; minimized payloads; direct-table denial; no-store/no logging; and UI late-response/cross-inquiry/session lifecycle races.

Real clinic vocabulary, consent/legal interpretation, provider use, hosted identity, production activation and any messaging remain separate approval/release gates.

Sources: [master workflows](03_MASTER_WORKFLOWS.md) GJ-01 step 3 explicitly calls for contact preference; [module PRD](04_MODULE_PRD.md) M01 calls for callback preference; [manual intake contract](INTAKE_V1_CONTRACT.md) fixes the original inquiry; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) require tenant-safe development with separate activation gates.
