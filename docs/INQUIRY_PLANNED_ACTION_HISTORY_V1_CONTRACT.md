# Inquiry planned-action history v1 — personal command outcomes only

Status: frozen and independently reviewed for bounded synthetic M01 development. The original planned-action acceptance deliberately excluded a history panel; this separate read extension does not reinterpret or broaden that write contract.

## Purpose and boundary

The planned-action command stores an immutable receipt for every accepted current-owner command, including no-ops. This slice exposes a bounded, on-demand journal of the **current actor's own command outcomes for the currently owned inquiry**. It helps that owner understand their recent saved, cleared and unchanged results without claiming that any review or follow-up was performed.

This is not the current planned-action state, a complete inquiry audit, staff-performance record, task history, contact history, patient timeline or proof of execution. It does not change or replay an intention, resolve an uncertain submission, create a task/reminder, send a message, reassign ownership, change deadline/status, select a patient, book a resource or trigger an event.

## Authorization and privacy

- The server derives actor and clinic from the verified session. The actor must be an active `reception`, `manager` or `dentist` member, must currently own the inquiry and may read only `set_planned_action` receipts whose stored actor is that same actor.
- Missing, foreign, no-longer-owned and other-owner inquiries share the same 404. Manager role grants no override for another owner's journal. Only receipts authored by the currently authorized actor are returned. After A→B→A, A may read A's earlier receipts again; B's receipts remain excluded. While not current owner, A has no access. No ownership-tenure boundary is inferred or introduced.
- The response echoes only the requested inquiry ID. Items contain vocabulary version, previous/resulting intention, previous/resulting revision, `changed`, recording time and event version. They omit actor/clinic IDs, request/correlation/idempotency keys, normalized payloads, names, contacts, source/status, deadlines, patient data and audit/outbox internals.
- API and privileged SQL recheck clinic, active role, current ownership, receipt actor and exact command discriminator. Privileged access does not rely on RLS alone. All authenticated outcomes use `Cache-Control: no-store`; private history is never persisted in browser storage, service-worker cache, analytics or logs.

## API, consistency and ordering

`GET /api/v1/inquiries/:id/planned-action/history` accepts one UUID path and no query parameters. It returns strict `InquiryPlannedActionHistorySchema`:

- `inquiry_id`: exact authorized path echo;
- `items`: zero to 50 immutable outcomes containing `vocabulary_version: 1`, previous/resulting planned action, previous/resulting revision, `changed`, `recorded_at` and `event_version: 1`;
- `truncated`: true only when at least one more authorized receipt exists, and then exactly 50 items are returned.

The SQL function filters clinic, inquiry, current owner, receipt actor and `set_planned_action` before reading 51 rows. Items are newest first by exact PostgreSQL receipt timestamp, then private request key descending as an unexposed deterministic tie-breaker. No-op receipts remain truthful entries. Receipt invariants match the write contract: action difference equals `changed`; changed revisions increment once; no-op revisions remain stable; revision zero has no previous value.

The read uses one statement snapshot, no row lock, idempotency header, command or write switch. Fresh `GET .../planned-action` state remains authoritative. History neither proves a continuous revision chain across omitted owners nor resolves the exact-key uncertain-write recovery flow.

Public outcomes are 200 including empty, 400 invalid path/query, 401 absent/expired identity, 403 absent active staff authority, 404 absent/foreign/no-longer-owned inquiry and sanitized 503 unavailable or malformed trusted output. The API and client validate that the echoed inquiry ID matches the requested/selected target.

## UI acceptance

Inside the existing **“Prochaine action prévue”** section, add a quiet collapsed disclosure **“Historique des intentions”** below the current-value/action row. Fetch only when opened; do not add a dashboard card, badge count, permanent expanded panel or another worklist tab. Persistent copy says **“Vos enregistrements récents uniquement”** and **“Ces résultats historiques ne décrivent pas l’intention actuelle et ne prouvent aucune action effectuée. Effacer une intention ne termine pas le suivi.”**

Each semantic-list row shows labelled previous and resulting intentions, server recording time in a named display timezone and exactly one neutral outcome. Precedence is exact: `changed: false` → **“Sans changement”**; otherwise a null result → **“Intention effacée”**; otherwise → **“Intention modifiée”**. A null→null no-op never says “effacée”. It never uses completion styling, success-green claims, former-owner identity or current-state language.

Collapsed, loading, explicit refresh, empty, partial `50+`, offline, denied, expired, missing/reassigned, unavailable, retry and success states remain distinct. Empty copy says no records by the current user were visible and does not claim the intention never changed. Partial copy says the 50 most recent personal outcomes are shown and at least one more exists. Never translate failure into empty.

Selection change, collapse, offline transition, logout/session replacement, authority loss and transport disposal abort and clear history; late responses are ignored. A 401/403/404 follows the existing private-detail cleanup boundary without broadening unrelated error handling. Confirmed planned-action persistence may explicitly refresh an open history; it never optimistically appends. History remains separate from exact-key verification of an uncertain command.

Use Dental Spa pearl/navy tokens, 14px content, 44px disclosure/refresh targets, visible focus, semantic `<time>`, status announcements, reduced motion and explicit `aria-expanded`/`aria-controls`. At 390px and 200% browser zoom, stack previous/result values in reading order with normal page scrolling and no nested scroll region. If collapsing while focus is inside, return focus to the disclosure; if authorization cleanup removes the disclosure, move focus to a surviving safe workspace context rather than an unmounted opener.

## Verification and remaining gates

Verify direct SQL and HTTP tenant/role/current-owner denial; A→B→A exposes A's own earlier receipts only while A is current and never B's receipts; exact command/actor filtering before 51; changed/no-op/clear invariants and outcome precedence; full-precision ordering/private tie-break; 50/51 truncation; exact target echo; no-store; write-switch independence; malformed/private-field rejection; fresh state authority; uncertain-command isolation; cleanup/late-read behavior; responsive keyboard UI at target widths and 200% zoom. Exact-head PostgreSQL CI must apply the additive restricted read RPC and pgTAP assertions before merge.

This slice keeps M01-5 partial and M01 at 25%. Hosted identity/revocation, retention/legal review, physical-device PWA, real operating policy and any executable workflow remain separate release gates.

Sources: [module PRD](04_MODULE_PRD.md) M01 owner/due/action; [domain model](05_DOMAIN_MODEL.md) inquiry next action and governance traceability; [planned-action contract](INQUIRY_PLANNED_ACTION_V1_CONTRACT.md) immutable receipts; [schedule-history contract](INQUIRY_SCHEDULE_HISTORY_V1_CONTRACT.md) personal-receipt precedent; [security](09_SECURITY_SAFETY.md); [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md).
