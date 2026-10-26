# Team activity v1 — bounded operational journal

Status: frozen for a synthetic M16 development slice, pending independent review. This is a read-only operational projection, not a complete security, clinical, legal or employee-monitoring audit report.

## Meaning and limits

The journal presents recent audited actions that the product already emits: inquiry creation, manual inquiry follow-up recording, temporary scheduling-hold creation and hold release. It does not infer productivity, attendance, clinical urgency, approval, patient contact success or staff qualification. It does not add audit events and it cannot change, approve, export or replay an action.

Only these four explicit action kinds are projected. Unknown and future audit actions are excluded until separately reviewed. Read access, authentication attempts, approvals, exports and full security investigations are not covered in v1, so the UI must call this “Activité récente” and explain that it is not exhaustive.

## Authorization and privacy boundary

- The server derives actor and clinic from a verified session. Only an active `manager` member of the current clinic may read the projection. Dentist, reception, assistant, inactive and cross-clinic callers are denied. This deny-by-default choice grants no new management or clinical authority.
- The database function repeats the active manager and clinic checks under a fixed `search_path`; a privileged server connection does not rely on RLS alone.
- The response contains only a normalized action kind, optional current actor display name and occurrence timestamp. It omits patient/inquiry/resource names, aggregate IDs, correlation IDs, contact details, request bodies, clinical content and outbox state.
- A removed or incomplete actor profile becomes `actor_display_name: null`; the API never falls back to exposing a user UUID. Current names are a presentation aid, not immutable historical identity evidence.
- Responses are `Cache-Control: no-store`. The connected UI retains events only in component memory and clears them on logout, expiry, offline transition, clinic/session change or transport disposal. The service worker must not cache authorized responses.

## HTTP and ordering

`GET /api/v1/team/activity` accepts no query string or body and returns strict `TeamActivitySchema` from `packages/contracts/src/team-activity.ts`.

- `observed_at` is sampled once from the database clock.
- The database reads the first 51 supported events and returns at most the first 50. `truncated: true` is valid only with exactly 50 returned items and means at least one additional supported event exists. V1 has no pagination and does not report an exact total.
- Items are newest first by the full PostgreSQL timestamp instant, preserving available fractional-second precision and equivalent timezone offsets, then by private audit-event ID descending only as an internal stable tie-breaker.
- Public failures: 400 unsupported query/body, 401 absent or expired identity, 403 missing active manager authority, 503 unavailable or malformed trusted response.

Internal actions map to public kinds as follows: `InquiryCreated` → `inquiry_created`; `InquiryFollowUpRecorded` → `inquiry_follow_up_recorded`; `SlotHoldCreated` → `slot_hold_created`; `SlotHoldReleased` → `slot_hold_released`.

## UI acceptance

Add a visually distinct activity panel to Team using the existing pearl/navy system, 14px working text, 44px mobile targets and restrained entrance motion. Show text and icon labels for each supported kind, actor display name or “Membre non affiché”, localized timestamp, observation time and an explicit non-exhaustive note. Show `50+`/partial language when truncated.

Demo mode uses clearly synthetic names and in-memory events. Connected mode must distinguish loading, empty, partial, denied, expired, offline and unavailable states; offer retry only where meaningful; abort superseded requests; and never leave stale events visible after loss of authority. Reduced-motion preferences disable decorative entrance motion. No generic data-table treatment, actor performance score or AI summary.

## Verification and remaining gates

Test direct SQL and API isolation, manager-only access, same-clinic filtering, allowlist mapping, 50/51 truncation, stable ordering, missing profiles, unsupported query/body, strict parsing, no-store and sanitized failures. Browser tests cover demo and intercepted connected flows, cleanup, keyboard access and responsive pearl/navy layouts. Real hosted identity, complete read/export auditing, retention policy, employee-monitoring/legal review and production release remain separate gates.

Sources: [module PRD](04_MODULE_PRD.md) M16 includes access/change/approval/export audit; [domain model](05_DOMAIN_MODEL.md) defines immutable audit events; [security](09_SECURITY_SAFETY.md) requires audit for high-risk reads/exports and all writes; [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md) permits bounded synthetic development while activation gates remain open.
