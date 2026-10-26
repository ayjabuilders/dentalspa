# Inquiry owner search v1 — synthetic development contract

Status: coordinator draft for independent review. Development may start only after this contract is reviewed and frozen. The slice is an authenticated, read-only staff tool; it is not patient identity matching, duplicate detection, production activation, or a clinic-approved contact policy.

## Problem and boundary

The Intake page's local filter covers only the newest 100 inquiries, while each due-worklist bucket is bounded to 50. An authorized owner can therefore lose normal navigation to an older inquiry even though the existing single-inquiry endpoint can still revalidate and open it.

This slice adds explicit server-backed search across **the current actor's own inquiries**. It searches only the stored inquiry display name and returns minimal summaries. A match is an inquiry-navigation result, not an existing-patient match, verified identity, duplicate conclusion, consent signal, contact success, urgency assessment, or booking state. It adds no mutation, message, owner/status/deadline change, patient association, resource hold, or appointment.

## Authorization and privacy

- The server derives actor and clinic from the verified session. Only an active clinic member with `reception`, `manager`, or `dentist` role may search, and every candidate must have that actor as its current `owner_user_id`.
- Manager role does not grant a search across another owner's inquiries. Anonymous, patient-only, assistant, inactive, cross-clinic, and privileged bypass attempts are denied before any row is returned.
- The result envelope echoes the actor's already-authorized `clinic_id` and `owner_user_id` so API and client adapters can fail closed. Items contain only inquiry ID, display name, manually attributed source, stored `new` status, stored follow-up timestamp, and creation timestamp. They omit phone, email, messages, health detail, patient/account linkage, other owners, audit/outbox data, and match scores.
- All responses use `Cache-Control: no-store`. Search text, results, tokens and selected private detail are not written to browser persistence, service-worker caches, analytics, telemetry, or application logs. The POST body must not be logged.

## Request, matching and response

`POST /api/v1/inquiries/owner-search` accepts no query parameters and the strict body `{ "name": string }`. The client removes leading/trailing U+0020 SPACE before submission; the server and direct RPC require that already-canonical form. The value contains 2–80 Unicode code points, rejects C0/DEL controls, and otherwise remains byte-for-byte unchanged. This makes browser and PostgreSQL length/edge handling identical instead of relying on JavaScript UTF-16 counts or database-dependent whitespace trimming. No source, contact, status, patient, pagination, sort or wildcard parameter exists in v1. No idempotency key is used because this is a read.

Matching is a **literal case-insensitive substring** over the stored inquiry `display_name` under the actual database collation. Backslash is escaped first, then `%` and `_`, and SQL declares the escape character explicitly; combined or trailing backslashes and wildcard-only names remain literal. ASCII case folding is required, while accent equivalence and locale-independent Unicode folding are explicitly not promised and must be tested against the real database collation. There is no fuzzy, phonetic, token-ranking, contact-field, patient-record, or external-channel search. The UI must not claim that an empty or partial result proves absence or uniqueness.

`InquiryOwnerSearchResultSchema` returns:

- `clinic_id` and `owner_user_id`: exact authorized scope echoes;
- `items`: zero to 50 distinct `InquiryOwnerSearchItem` summaries, newest by exact `created_at DESC`, then normalized inquiry UUID descending;
- `truncated`: true only when at least one additional authorized match exists; when true exactly 50 items are returned.

The server filters clinic, current owner and literal name **before** applying the 51-row limit. The endpoint remains available while intake writes are disabled. Stable outcomes are 200 including no matches, 400 invalid body/query, 401 unauthenticated, 403 absent active staff scope, and sanitized 503 for unavailable or malformed trusted results. Searches never return 404 or disclose foreign existence.

## UI behavior

Inside `/intake`, keep the existing local newest-100 filter clearly separate from an explicit **“Rechercher dans mes demandes”** panel. The initial state explains its owner-only scope and two-character minimum. Submission—not typing—starts a server search. Results show name, source, creation date and stored deadline with text labels; partial results say **“50+ correspondances dans vos demandes”**. The empty state says **“Aucune demande correspondante dans vos demandes”**, never “nouveau patient”, “aucun doublon”, or any identity conclusion.

Selecting a result calls the existing current-owner `GET /inquiries/:id`; only that fresh authorized detail may open the existing follow-up, schedule, schedule-history and contact panels. A stale, reassigned, foreign or missing result clears the result selection and private detail without revealing which condition occurred.

Initial guidance, invalid, loading, empty, partial, offline, denied, expired, unavailable/retry, selected-detail loading and missing/reassigned states are distinct. Query edits abort active search and invalidate old results; selection changes abort/ignore late detail reads. Session/clinic change, logout, offline, denied, expired and disposal clear query, results and private detail. Ordinary query edits and successful searches do not clear an unrelated pending exact-key schedule command; authority loss and offline cleanup retain the existing privacy boundary.

Keyboard submission/focus, visible labels, reduced motion, both themes, 44px mobile targets, responsive reflow, wide-name wrapping and 200% zoom remain acceptance checks. No automatic search on every keystroke, infinite scroll, export, offline history or background refresh.

## Verification and activation

Tests cover direct SQL and HTTP role/tenant/current-owner denial, privileged bypass, filter-before-limit, literal wildcard escaping, case-insensitive substring behavior, two-character boundary, Unicode and long-name validation, exact ordering, 50/51 truncation, minimal fields, scope echoes, no-store, POST-only transport, no body logging hooks, empty/malformed/error states, selection revalidation, cleanup/late-response behavior and responsive browser layouts. Real PostgreSQL pgTAP CI is required before merge.

No hosted migration, real patient data, external integration, production deployment, clinical action, or identity inference is authorized. Hosted identity/revocation, retention/legal review, physical-device PWA and true 200% zoom remain release gates.

Sources: [module PRD](04_MODULE_PRD.md) prioritizes unified manually captured inquiries with owner/due/action; [master workflow](03_MASTER_WORKFLOWS.md) requires following up unresponded inquiries; [owner worklist contract](INQUIRY_OWNER_WORKLIST_V1_CONTRACT.md) documents bounded current navigation; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) require tenant-safe development and separate activation gates.
