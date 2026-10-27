# Inquiry owner overdue page v1 — synthetic read-only contract

Status: frozen after independent product/domain, security/database and UX review for bounded synthetic development. This is an extension of the frozen owner-worklist contract, not a clinic-approved urgency, prioritization, contact or completion policy.

## Purpose and non-claims

The existing current-owner worklist returns at most 50 overdue inquiries. This extension lets the same authorized actor explicitly request another bounded page when more than 50 overdue administrative deadlines exist and the actor does not already know a name to search.

An overdue item means only that its stored `follow_up_at` was less than or equal to the database observation time for that response. It is not a clinical-urgency judgment, task priority, proof of contact, completed work, automatic reminder, patient match, appointment or message. The original three-bucket `GET /api/v1/inquiries/owner-worklist` contract remains unchanged.

## Authorization and database boundary

- The server derives actor and clinic from the verified session. Only an active current-clinic member with `reception`, `manager` or `dentist` role may read a page, and only inquiries whose current `owner_user_id` equals that actor are eligible. Manager access does not confer another owner's worklist or clinical authority.
- `public.inquiry_owner_overdue_page(p_clinic_id uuid, p_payload jsonb)` is a restricted `SECURITY DEFINER` RPC with a fixed `search_path`. It rejects any request whose transaction-local `request.method` is not `POST`, rechecks active membership, role, clinic and current ownership, and never relies on RLS alone. Revoke execution from PUBLIC and `anon`; grant only `authenticated`. Privileged callers still pass the same independent authorization checks. The payload is the exact validated `{ "after": ... }` object; no other caller scope is accepted.
- The cursor is an untrusted comparison value. It is never looked up and never grants authority. A fabricated but structurally valid cursor returns the authorized rows after that tuple or an empty page.
- The RPC samples one `observed_at` from the database and filters current clinic, current owner, `follow_up_at IS NOT NULL`, `follow_up_at <= observed_at` and the strict cursor bound before reading 51 rows. Results order by `(follow_up_at ASC, inquiry_id ASC)`; the response returns at most 50.
- The projection reuses the minimal worklist item only: inquiry, clinic and owner IDs, display name, manually attributed source, original status, follow-up timestamp and creation timestamp. It omits contacts, patient associations, clinical content, command receipts and other owners.
- This authorized read works while Intake write switches are disabled. It creates no audit/outbox/idempotency event and performs no mutation. Responses use `Cache-Control: no-store`; names, rows and cursors stay in memory and are not cached by the service worker, browser storage, logs or analytics.

## HTTP and strict schemas

`POST /api/v1/inquiries/owner-overdue-page` accepts exactly the shared `InquiryOwnerOverduePageRequestSchema`:

```json
{ "after": null }
```

or a cursor:

```json
{
  "after": {
    "follow_up_at": "2026-10-27T09:00:00.123456Z",
    "inquiry_id": "10000000-0000-4000-8000-000000000001"
  }
}
```

Timestamps preserve at most PostgreSQL microseconds and normalize inside UTC years `0001`–`9999`. The response echoes the verified `clinic_id`, `owner_user_id`, exact validated `after`, and its own `observed_at`, plus `items`, `truncated` and `next_after`.

- When `truncated` is true, exactly 50 items are returned and `next_after` equals the final returned item's `(follow_up_at, id)` tuple.
- When `truncated` is false, `next_after` is null; zero through 50 items are valid.
- Every item is overdue at that response's `observed_at`, strictly after the requested tuple when one exists, unique by inquiry ID and in ascending deadline/ID order.
- No clinic, owner, clock, limit, sort, source, status or arbitrary filter is accepted from the caller. Query parameters and extra body fields are rejected.

Public errors: 400 malformed/unsupported input, 401 absent or expired identity, 403 absent active role/clinic authority, 503 unavailable or malformed trusted response. Provider details and private input are never echoed.

## Fresh-observation semantics

Each page is a fresh authorized observation, not a stable or exhaustive snapshot. Deadlines and ownership can change between calls. Rescheduling can move an inquiry before or after the cursor, remove it from overdue, or cause a previously displayed inquiry to repeat on a later page during the same ordinary traversal. Omissions and repeats between pages are therefore permitted; uniqueness is required only within one response. The interface must never claim that every overdue inquiry was reviewed or that the end of a sequence is durable.

The actor can explicitly restart from `{ "after": null }` at any time. A locally observed confirmed reschedule, bucket/view switch, local inquiry selection, session/clinic/authority change, offline transition or transport disposal invalidates continuation state and ignores delayed page responses. Unseen remote changes cannot invalidate client state proactively; they are covered by the fresh-observation disclaimer. Selecting a page item clears continuation and performs the existing fresh current-owner detail read; stale page membership never authorizes detail.

## Clinic UI acceptance

Keep the existing **Mes échéances → Échéances passées** layout. Initial rendering uses the existing three-bucket response; its final overdue tuple becomes the continuation only when that bucket is truncated. When advancing, call the new endpoint with that tuple, replace the overdue rows rather than accumulating names and show **Revenir au début**. **Actualiser**, **Revenir au début** and a locally confirmed reschedule clear the visible page/cursor and call the new endpoint with `{ "after": null }` for a fresh first overdue observation. A new schedule-reconciliation response may supply that fresh state only when it was obtained after the confirmed mutation; never replay an older cached snapshot. Restart remains available after an empty or failed continuation. Do not add a new card, total, infinite scroll, completion checkbox or priority score.

The initial three-bucket observation time and tab counts remain attached only to that original response. A continued or refreshed overdue page displays its own `observed_at` inside the overdue panel. While such a page is visible, hide the overdue numeric tab count and do not relabel it with the page length or a supposed remaining total. Do not imply that the unchanged upcoming or undated buckets were observed at the newer page time; switching to either restores its original rows, count and original observation label.

Copy explains: “Échéances administratives observées à cet instant. Les demandes peuvent changer entre deux lectures. Une échéance passée n’indique pas une urgence clinique.” An empty continuation says “Aucune échéance supplémentaire retournée à cette observation,” never “Tout est traité.”

Distinct states cover initial load, first-page empty, continued empty, partial/final page, unavailable/retry of the exact requested cursor, malformed continuation with restart, denied, expired, offline and missing/reassigned detail. Clear former rows while a replacement loads. Preserve unrelated uncertain command recovery during ordinary reads. After successful replacement, move focus only through a revocable focus lease to the stable overdue heading; after failure, focus the retry/status context. User movement cancels the handoff.

Use the existing Dental Spa pearl/navy system, 14px working text, visible keyboard focus, reduced motion and at least 44px touch targets. Controls stack at 390px and 200% zoom without page overflow or another nested mobile scroll region.

## Verification and remaining gates

Test anonymous, patient, assistant, inactive, foreign-clinic, other-owner and former-owner denial in HTTP and privileged SQL paths; direct GET and anonymous RPC denial; read behavior with write switches off; exact boundary equality; equal-microsecond and letter-bearing/mixed-case UUID ties; fabricated cursors; 50/51; strict echoes; malformed precision, ordering, uniqueness and continuation; reassignment/rescheduling between pages; both omission and same-traversal repetition after a deadline moves; zero writes; direct-table/RPC grants; no-store and sanitized errors. Browser tests cover initial v1 continuation, replacement, exact retry, fresh first-page restart, page-specific observation/count handling, delayed response cancellation, fresh detail, locally confirmed reschedule invalidation, privacy cleanup, focus, both themes, 390px and 200% reflow.

Real PostgreSQL migration/pgTAP, exact-head CI, hosted identity, production activation, physical-device/true-zoom review and real operating acceptance remain separate gates. Reassignment authority, closure reasons, qualification/clinical urgency, patient selection, appointment confirmation and communication are outside this contract.

Sources: [master workflows](03_MASTER_WORKFLOWS.md) GJ-01 steps 4 and 7 require a named owner, next deadline and follow-up; [module PRD](04_MODULE_PRD.md) M01 requires owner/due/action; [owner worklist](INQUIRY_OWNER_WORKLIST_V1_CONTRACT.md) freezes current-owner classification and the existing 50-row limit; [security](09_SECURITY_SAFETY.md) and [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) require tenant-safe development with separate activation gates.
