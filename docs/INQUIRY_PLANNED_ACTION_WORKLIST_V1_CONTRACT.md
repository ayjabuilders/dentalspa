# Inquiry planned-action worklist v1 — recorded intentions only

Status: draft for bounded synthetic M01 development. This contract projects recorded administrative intentions for the current owner. It is not a task queue, priority model, completion system, contact permission, deadline, booking step, clinical decision or AI recommendation.

## Meaning and source boundary

The M01 source requires an owner, due date and action, and the domain model places a next action on an inquiry. The delivered planned-action resource records one of two internal-review intentions. This slice makes those already-authorized intentions findable across older inquiries without changing the frozen deadline worklist or inventing operational policy.

- The list contains only non-null `review_inquiry` and `review_follow_up` values from vocabulary version 1.
- Ordering means only “most recently updated recorded intentions”. It is not urgency, priority, eligibility or permission to act.
- An empty response means no matching recorded intentions were visible to this owner at the database observation. It does not mean there is no work to do.
- The value follows the inquiry through future authorized reassignment and must be reviewed by the current owner. No former-owner identity is exposed.
- Reading or selecting an item does not execute, endorse, complete, clear or reschedule the intention.

## Authorization and privacy

- The server derives clinic and actor from a verified session. Only an active `reception`, `manager` or `dentist` member may read the projection, and only inquiries whose current `owner_user_id` equals that actor appear. Managers receive no override for another owner's list.
- The privileged database function independently rechecks active membership, role, clinic and current ownership under a fixed `search_path`. Tenant/current-owner filtering and `planned_action IS NOT NULL` happen before ordering and limiting.
- No caller-supplied clinic, owner, inquiry, search, filter or pagination value is accepted. Unknown query parameters fail with 400.
- Items expose only inquiry ID, display name, exact action and vocabulary version, state revision and server update time. They omit contact fields, patient identifiers, source/message content, former or entering actor identity, receipt/idempotency data, deadline, status, rank and clinical data.
- Responses are `Cache-Control: no-store`. Private names are never stored in browser persistence, service-worker caches, analytics or logs. Session, clinic, authority or offline changes abort requests and clear rendered private data.

## HTTP and shared schema

`GET /api/v1/inquiries/owner-planned-actions` returns strict `InquiryPlannedActionWorklistSchema` and accepts no query parameters. The response echoes `schema_version: 1`, current clinic and owner IDs, one authoritative database `observed_at`, `items` and `truncated`.

The API service and connected client must compare the echoed clinic and owner identifiers with the verified request/session scope after structural validation. A missing or mismatched echo is an unavailable trusted-response failure, never an empty list.

Only non-null plans with positive revision and non-null update time can appear. Order is `updated_at DESC, inquiry_id DESC`, preserving database timestamp precision. The database reads 51 rows and returns at most 50; `truncated: true` means at least one additional authorized row existed. Inquiry IDs are unique.

Selecting a row uses the existing freshly authorized `GET /api/v1/inquiries/:id` detail read, then separately rereads `GET /api/v1/inquiries/:id/planned-action`, including when the same inquiry is selected again. A missing, foreign or reassigned record keeps the existing indistinguishable 404 boundary. The list remains an observed snapshot; the fresh detail and plan reads win. A failed plan reread shows unavailable and must not present the list value as current.

Public failures are 400 unsupported query, 401 absent/expired identity, 403 absent role/clinic authority and 503 unavailable or malformed trusted response. The read remains available when intake write switches are disabled. It creates no command, receipt, audit row, outbox event, lock, notification or background work.

## UI acceptance

Extend the existing **“Mes échéances”** work panel with a separately labelled top-level tablist between **“Échéances”** and **“Intentions enregistrées”**. Keep the frozen deadline tabs and projection unchanged, and show those category tabs only inside the Échéances view. The intentions view is headed **“Intentions mises à jour récemment”** and lists a name, “Prévu : Examiner la demande” or “Prévu : Examiner l’historique du suivi”, and an update time that is not styled like a deadline. Persistent copy says: “Intention administrative, à revoir par le responsable actuel.” Show “Observé le … · [fuseau nommé]”.

Do not add completion controls, due badges, priority color, dashboard totals, automatic recommendations or a new detail card. The existing row selection flow fetches fresh authorized detail before focus moves to the detail panel. It then rereads the plan so concurrent change or clearing is represented by current state.

Support initial loading, explicit refresh, empty, partial `50+`, offline, denied, expired, unavailable, stale-response, missing/reassigned and retry states. Empty copy is: “Aucune intention enregistrée visible à cette observation. Cela ne signifie pas qu’aucun travail n’est nécessaire.” Partial copy says 50 are displayed and at least one additional result exists. Never translate unavailable into empty or retain stale private names. Slow view switches and row changes abort and ignore stale reads while preserving unrelated exact-key command recovery; authority/session/offline loss still performs full private-state cleanup. Move focus only after authorized detail succeeds; otherwise keep it at the selection/error context. At 390px, wrap action and update time beneath the name with 44px targets, no extra card and no horizontal tab scrolling. Preserve visible labels/focus, arrow-key tab behavior, status announcements, focus transfer, reduced motion and both Dental Spa themes.

## Verification and remaining gates

Verify strict schema/order/uniqueness/truncation, including case-varied duplicate UUIDs and missing/wrong scope echoes; anonymous, patient, assistant, inactive, foreign-clinic, other-owner and former-owner denial; privileged-path enforcement; filtering before limit; microsecond ordering; no-store; write-switch independence; malformed trusted output; repeated same-inquiry fresh selection; session/clinic/offline cleanup; slow view/row changes and late-response suppression; 50+ and all safe states; keyboard, responsive and reduced-motion behavior. Real PostgreSQL CI must apply the additive read RPC migration and pgTAP assertions before merge.

This slice strengthens partial M01-5 coverage but does not complete it. Reassignment authority, executable tasks, priority, deadlines, result lifecycle, operational vocabulary, hosted validation and real-use approval remain separate gates.

Sources: [module PRD](04_MODULE_PRD.md) M01 owner/due/action; [domain model](05_DOMAIN_MODEL.md) inquiry next action; [planned-action contract](INQUIRY_PLANNED_ACTION_V1_CONTRACT.md); [owner-worklist contract](INQUIRY_OWNER_WORKLIST_V1_CONTRACT.md); [security](09_SECURITY_SAFETY.md); [ADR-003](adr/ADR-003_DEVELOPMENT_AND_RELEASE_GATES.md).
