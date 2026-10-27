# Inquiry owner search page v1 — older matching results

Status: frozen and independently reviewed for bounded synthetic M01 development. The existing owner-search v1 endpoint and its no-pagination contract remain unchanged.

## Purpose and boundary

Owner search can find inquiries outside the newest-100 Intake list, but returns only the newest 50 literal-name matches. An owner who knows the correct name can therefore still be unable to reach an older matching inquiry. This slice adds explicit keyset continuation for that same current-owner, literal-name search.

This is inquiry navigation, not identity matching, duplicate detection, patient selection, exhaustive audit, contact success, urgency, priority or booking state. It adds no mutation, task, message, owner/status/deadline change, patient association, export or background loading.

## Authorization, privacy and cursor trust

- The server derives actor and clinic from the verified session. Only an active `reception`, `manager` or `dentist` member may page through that actor's currently owned inquiries. Manager role grants no cross-owner search.
- API and privileged SQL independently recheck active clinic/role/current ownership on every page. Clinic, owner, literal name and the comparison bound are applied before the 51-row limit. Privileged access does not rely on RLS alone.
- The cursor is the untrusted comparison tuple `{ created_at, inquiry_id }`. Its timestamp must preserve at most PostgreSQL microseconds and remain within normalized UTC years 0001–9999, including after applying an offset. It is not an authorization token, is never looked up and reveals nothing about whether its apparent inquiry exists, belongs to another clinic or matches the name. A fabricated valid tuple can only change the comparison boundary inside the already-authorized result set.
- No cursor signing, server-side cursor storage or durable snapshot is introduced. The cursor and results live only in memory and clear on query edit, new submission, offline, logout, expiry, authority/session/clinic change or transport disposal.
- Results retain the v1 minimal summary and omit contacts, patient/account linkage, messages, other owners, audit data and match scores. All outcomes use `Cache-Control: no-store`; request bodies and names are not logged or persisted.

## Request, matching and response

`POST /api/v1/inquiries/owner-search-page` accepts no query parameters and strict body `{ name, before }`. `name` retains the exact v1 canonical 2–80 Unicode-code-point validation and literal case-insensitive substring semantics. `before` is explicitly `null` for the first page or a strict `{ created_at, inquiry_id }` tuple returned by the preceding response. No source, contact, status, patient, sort, page number or arbitrary limit exists.

The strict response echoes authorized `clinic_id`, `owner_user_id`, exact canonical `name` and exact request `before`, then returns `items`, `truncated` and `next_before`:

- ordering is native `created_at DESC, inquiry_id DESC`; cursor and returned creation timestamps preserve at most PostgreSQL microseconds inside normalized UTC years 0001–9999;
- a continued query requires `(created_at, id) < (before.created_at, before.inquiry_id)` under that descending order;
- SQL reads 51 authorized matches and returns at most 50;
- `truncated: true` means at least one additional match was observed, exactly 50 items are returned and `next_before` equals the last returned item's tuple;
- otherwise `truncated: false` and `next_before: null`.

API and client validate scope, exact name/bound echoes, unique ordered items, strict-below-bound results and continuation consistency. Structural cursor errors return 400. A well-formed fabricated tuple remains a harmless comparison value and returns 200, including empty. Searches remain available while intake writes are disabled. Other public outcomes are 401 absent/expired identity, 403 absent active staff scope and sanitized 503 unavailable or malformed trusted output; search pages never return 404.

Each page is a fresh observation, not a stable or exhaustive snapshot. Creation time and ID are immutable ordering keys, but concurrent name corrections or reassignment can add/remove matches between requests. UI copy must never claim that every historical inquiry was traversed. Restarting from `before: null` rereads the current first page.

Selecting an item still performs the existing fresh current-owner `GET /inquiries/:id` before opening detail. Cursor possession never authorizes detail access.

## UI acceptance

Keep the existing **“Rechercher dans mes demandes”** form and initial-result presentation unchanged, but submit the first search to the new paged endpoint with `before: null`. When `next_before` exists, show **“Afficher les résultats suivants”** below the results. After advancing, also show **“Revenir aux premiers résultats”**. Replace the displayed page instead of accumulating names; do not add page numbers, infinite scroll, exact totals, source filters or a new panel.

Persistent page copy says: **“Jusqu’à 50 demandes affichées. Les résultats sont relus à chaque étape et peuvent évoluer.”** A continued page with no items says **“Aucun résultat supplémentaire retourné pour cette recherche.”** It must not say that all inquiries were checked. The submitted-results caption identifies the exact name; editing the name aborts requests, clears results and resets continuation.

Loading clears the former page. A failed next-page read retains only the requested name/bound in memory for explicit retry and does not advance. Invalid/malformed trusted continuation offers **“Recommencer la recherche”** from the first page. That restart remains available after an empty continued page or failed continuation. Selecting a detail clears continuation and ignores every delayed page response while preserving fresh detail authorization and unrelated exact-key command recovery. Offline, denied, expired, unavailable, empty first page, empty continued page, partial page, final non-empty page and missing/reassigned detail remain distinct. Authority/offline/session cleanup retains the existing privacy boundary.

On successful page replacement, move focus to a stable results-region heading and announce the new observed page without a numeric page claim. On failure, focus the retry/status context. Do not steal focus if the user moved during a delayed request. At 390px stack continuation/restart controls with 44px targets; preserve 14px text, wide-name wrapping, visible focus, reduced motion, both themes and 200% zoom.

## Verification and remaining gates

Verify HTTP and privileged SQL role/tenant/current-owner denial; v1 name/wildcard behavior; tuple filtering before limit; fabricated cursor non-authority; native timestamp/UUID ordering; exact 50/51 continuation; scope/name/bound echoes; duplicate/misordered/out-of-bound/malformed rejection; no-store and write-switch independence; fresh detail authorization; query/edit/navigation/session cleanup; delayed response and focus behavior; responsive keyboard UI. Exact-head PostgreSQL CI must apply the additive restricted read RPC and pgTAP assertions before merge.

This slice keeps M01-5 partial and M01 at 25%. Hosted identity/revocation, retention/legal review, physical-device PWA, clinic operating policy and every write workflow remain separate release gates.

Sources: [owner-search contract](INQUIRY_OWNER_SEARCH_V1_CONTRACT.md) documents the 50-result/no-pagination boundary; [module PRD](04_MODULE_PRD.md) M01 owner/due/action; [master workflow](03_MASTER_WORKFLOWS.md) inquiry follow-up; [security](09_SECURITY_SAFETY.md); [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md).
