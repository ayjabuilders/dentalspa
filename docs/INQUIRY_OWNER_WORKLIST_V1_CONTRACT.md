# Inquiry owner worklist v1 — synthetic read-only contract

Status: frozen and independently reviewed for a bounded M02 Growth/Intake synthetic development slice. This is not a clinic-approved urgency, triage, staffing, or contact policy. It can be developed after the manual-intake foundation; it does not require patient selection or appointment confirmation.

## Meaning and source boundary

The intake source already records a verified creator as `owner_user_id` and an optional `follow_up_at`. The worklist projects **the current owner's inquiries** into overdue, upcoming and undated buckets using one authoritative database observation time. It is an operational reminder view, not a task-completion system. Recording a historical contact action does not automatically clear, close, reschedule or reassign the original deadline. An overdue label means only that a stored deadline passed; it is not a clinical urgency judgment.

The original inquiry receipt stays unchanged. This slice adds no write command, patient identity assertion, appointment, message delivery, clinical content, due-date mutation or external channel integration.

## Authorization and data boundary

- The server derives clinic and actor from a verified session. Only an active clinic member with `reception`, `manager` or `dentist` role may request the worklist or a selected detail; only inquiries whose **current** `owner_user_id` equals that actor appear. Manager access does not imply clinical authority or an automatic view of another owner's list.
- No caller-supplied clinic or owner identifier, search string, arbitrary patient identifier or query parameter is accepted. The database RPC rechecks active membership, role and clinic under a fixed `search_path`; privileged server connections do not rely on RLS alone.
- The projection omits phone, email, contact message, health detail and patient reference. It contains only inquiry ID, clinic/owner IDs, display name, manually attributed source, original status, original follow-up timestamp and creation timestamp. Every cross-clinic ID remains inaccessible.
- Responses use `Cache-Control: no-store`. Existing intake command switches govern writes and do **not** disable these authorized read-only projections. No browser storage, service-worker caching of private responses, offline history, or analytics/logging of names and contact details.

## HTTP and shared schemas

`GET /api/v1/inquiries/owner-worklist` returns the strict `InquiryOwnerWorklistSchema` from `packages/contracts/src/inquiry-worklist.ts`. No query parameters are accepted. Each bucket has `items` and `truncated`, with at most 50 items; truncation means at least one additional item exists. An empty bucket remains explicit. `observed_at` is sampled once from the database clock for all three classifications; it is not the browser clock or a promise that the data stayed unchanged afterward.

`GET /api/v1/inquiries/:id` returns the existing strict `InquirySchema` only after rechecking the current owner, active role and clinic for that ID. A nonexistent, foreign or no-longer-owned ID returns the same 404. The body may contain the existing inquiry contact fields for the authorized owner; the worklist response itself never does. This endpoint exists so an old overdue inquiry outside the newest-100 intake list can still open its full authorized detail. It accepts one UUID path identifier and no query parameters, and it does not mutate any record.

| Bucket | Inclusion at `observed_at` | Deterministic order |
| --- | --- | --- |
| `overdue` | `follow_up_at <= observed_at` | oldest due first, then inquiry ID |
| `upcoming` | `follow_up_at > observed_at` | nearest due first, then inquiry ID |
| `undated` | `follow_up_at IS NULL` | newest creation first, then inquiry ID descending |

The API returns only the first 50 per bucket; no cursor/pagination is claimed in v1. Public errors: 400 unsupported query, 401 absent/expired identity, 403 absent role/clinic authority, 503 unavailable or malformed trusted response. An actor with no owned inquiries receives empty buckets, not a cross-tenant error or evidence about others.

## UI acceptance

Show a compact **“Mes échéances”** worklist in Clinic Intake with three text-labelled tabs and an explicit observation time. Display each item's name, attributed source and original due date, or “Sans date”; selecting a row fetches its currently authorized single-inquiry detail before opening the existing detail panel. Do not assume the item is present in the newest-100 intake list or show contact data from a stale cache. Distinguish overdue from upcoming with text and icon as well as color. Show “50+” rather than an exact total when truncated, and explain that the list is partial. Empty, loading, offline, denied, expired, missing/reassigned, unavailable and retry states are distinct; never show a stale list after session/clinic change. The browser may format timestamps in its named IANA timezone but must not recalculate bucket membership using local time. No action is labelled “completed” or “contacted” by this projection alone.

## Verification and remaining gates

Test direct API and privileged SQL isolation, role denial, strict worklist projection, current-owner detail lookup including a record outside the newest-100 list, foreign/missing/reassigned ID indistinguishability, exact-boundary classification, all three ordering rules, 50/51 truncation, no-store, empty/unknown errors and browser focus/reflow. The real PostgreSQL CI database job must apply the additive RPC migration and pgTAP assertions before development merge. No real clinic configuration or hosted data is touched. A later approved command/projection would be required to change ownership or due dates; this read-only view does not infer how historical follow-ups affect a deadline.

Sources: [master workflows](03_MASTER_WORKFLOWS.md) GJ-01 calls for a named owner and next deadline; [module PRD](04_MODULE_PRD.md) M01 calls for owner/due/action; [manual-intake contract](INTAKE_V1_CONTRACT.md) fixes creator ownership and optional due timestamp; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) require tenant-safe development with separate release gates. The three-bucket view is a synthetic development design, not an approved clinic SOP.
