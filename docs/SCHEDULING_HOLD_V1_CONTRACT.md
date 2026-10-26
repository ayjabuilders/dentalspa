# Scheduling hold v1 contract

Status: frozen development contract on 26 October 2026. This contract authorizes a synthetic, staff-only scheduling kernel. It does not authorize real clinic configuration, patient association, appointment confirmation, public booking, notification delivery or production activation.

## Outcome and boundary

The slice answers two narrow questions:

1. When were one configured provider resource and one configured chair resource simultaneously free at the database observation time?
2. Can an authorized staff actor place or release a short-lived transactional hold on both resources without double booking either one?

Availability is informational. A selected interval is a proposal until the hold transaction commits. A hold is neither an appointment nor evidence of patient identity, arrival, consultation or notification. No patient, inquiry, service, diagnosis or clinical content is accepted or stored by this contract.

The development fixtures are visibly synthetic. Operating hours, qualifications, services, durations, buffers, absence rules, public access and real resource identities remain unresolved clinic configuration and must fail closed outside the synthetic development switch.

## Roles, tenancy and activation

- Only an active clinic member with `reception`, `manager` or `dentist` may call the endpoints. `assistant`, patient-only, inactive and unauthenticated actors are denied.
- The server derives clinic and actor from the verified session. Callers cannot submit either identifier.
- Every resource and hold reference is revalidated inside the transaction against the derived clinic. Provider and chair kinds are checked independently.
- API and database development switches are explicit and default off. Enabling the API switch alone cannot bypass the database switch.
- Direct browser/database writes are denied. Privileged connections still perform explicit membership, role and clinic checks; correctness never assumes RLS covers service-role access.

## HTTP surface

All authenticated responses use `Cache-Control: no-store`. Request bodies are strict JSON. Idempotency keys are UUIDs in the `Idempotency-Key` header and are never accepted in a body.

| Endpoint | Contract |
| --- | --- |
| `GET /api/v1/scheduling/resources` | Returns the active synthetic provider/chair identifiers, kinds and safe display labels available to the authorized clinic actor. |
| `POST /api/v1/scheduling/availability` | Returns up to 200 simultaneous free intervals for one provider/chair pair inside a bounded UTC search window. Results include database `observed_at`, `informational: true` and an explicit `truncated` flag. |
| `POST /api/v1/scheduling/holds` | Atomically reserves both resources for the requested UTC half-open interval. Identical retries return the original result and do not renew expiry. |
| `GET /api/v1/scheduling/holds/:id` | Returns the authorized current projection. A persisted `held` hold projects as `expired` once database time reaches `expires_at`, even if cleanup has not yet persisted the transition. A previously released hold remains released. |
| `POST /api/v1/scheduling/holds/:id/release` | Idempotently releases active occupancy while retaining the hold, actor, audit and history. Replays never emit duplicate audit/outbox records. |

The first implementation does not expose create/update/delete resource endpoints. Synthetic resource identifiers and safe display labels, availability windows, hold TTL, maximum hold duration and booking horizon are migration fixtures or server-owned development configuration. The UI obtains connected-mode selector labels from the authorized resource-list response rather than trusting locally invented labels.

## Time and interval rules

- Inputs are offset-bearing ISO 8601 timestamps with at most millisecond precision. Naive local timestamps and unsupported precision are rejected.
- Instants persist as `timestamptz` and are normalized to UTC for comparison and idempotency.
- `display_timezone` is a validated IANA zone used only for presentation; it does not change the instant.
- The API requires `starts_at < ends_at`, supported precision, containment within both configured availability windows, and server-configured duration/horizon bounds.
- Occupancy uses half-open ranges `[starts_at, ends_at)`: adjacent intervals may coexist; overlapping intervals may not.
- The UI converts local choices explicitly and must reject or disambiguate nonexistent/repeated wall times. Casablanca is never treated as a fixed UTC offset.

## State and truthful presentation

The persisted lifecycle is `held -> released | expired`. `expired` may first be an effective read projection derived from authoritative database time; it never means a cleanup worker was punctual.

- Availability: “Available at last check · not reserved.”
- Before commit: “Proposed time.”
- Held: display the server expiry; countdowns are advisory.
- Expired: revalidate with the server and do not claim a release command ran.
- Replayed mutation: replay the exact command/key to recover its immutable receipt, then reconcile with `GET /holds/:id` before presenting a current state; the receipt may predate expiry or release. If that read fails, show “Result to verify” and never replace a newer terminal state with an older replayed item.
- Conflict: show that the resources changed; never reveal another patient or hold owner.
- Unknown network outcome: reconcile the same idempotency key before inviting a new command.
- Truncated availability: label the result as partial and narrow the search window; never imply later intervals do not exist.

There is no `confirmed`, `booked`, `arrived`, `checked_in`, `consultation_started` or notification-delivered state in v1.

## Transaction, occupancy and concurrency

A hold transaction:

1. validates the activation switches and current active actor authorization, then acquires a clinic scheduling transaction lock;
2. samples authoritative database clock time after the lock is acquired;
3. normalizes the command and resolves idempotency; an exact stored replay returns its immutable receipt before mutable resource/configuration validation, while a changed payload conflicts;
4. for a new command, deactivates relevant expired occupancy and validates resource ownership/kinds/state plus current server configuration;
5. writes one hold plus provider and chair occupancy, audit, outbox and idempotency outcome in the same transaction;
6. commits before returning success.

Active occupancy is protected by a PostgreSQL exclusion constraint over `(clinic_id, resource_id, tstzrange(starts_at, ends_at, '[)'))`. Both occupancy rows are one atomic unit. A provider or chair conflict rejects the full transaction. `now()` is not used in an exclusion predicate; expiry explicitly deactivates occupancy. The clinic lock is the initial simple ordering strategy and the exclusion constraint is the final safeguard.

The required `btree_gist` extension is verified in full PostgreSQL CI before activation. PGlite evidence alone is not concurrency acceptance.

## Idempotency, errors, audit and events

Keys are scoped to `(clinic, actor, command, key)`. The create canonical payload uses normalized UTC instants and resource/timezone identifiers. The release canonical payload includes the target `hold_id` from the path. Reusing a release key for another hold is an `idempotency_conflict`. An identical retry returns the original outcome, identifiers and expiry with `replayed: true`; it does not extend the hold. A changed normalized payload returns `409 idempotency_conflict`.

Release is also state-idempotent. Releasing an active hold transitions it once and returns `transitioned: true`. A new key against an already released hold returns the current released projection with `transitioned: false` and emits no new audit/outbox transition. The same-key retry returns the immutable original response with `replayed: true`. Releasing an effectively expired hold returns `hold_expired`; it does not rewrite expiry as release.

Stable public errors are:

- `scheduling_disabled` (`503`)
- `unauthenticated` (`401`)
- `invalid_request` (`400`)
- `forbidden` (`403`)
- `resource_not_found` (`404`, also used for foreign resources)
- `hold_not_found` (`404`, also used for foreign holds)
- `resource_conflict` (`409`)
- `idempotency_conflict` (`409`)
- `hold_expired` (`409`)
- `internal_error` (`500`)

Raw database errors, actor/contact data and competing hold details never leave the boundary or enter logs. Each successful state-changing transaction writes an audit record and a versioned transactional outbox event. Frozen v1 event names are `SlotHoldCreated`, `SlotHoldReleased` and `SlotHoldExpired`; their payloads contain only hold/resource references, interval/expiry timestamps and resulting status. Created/released events use the authorized staff actor reference. Expiry cleanup uses a stable server-owned system-principal reference and is never attributed to the staff request that happened to observe it. Emission does not imply consumer delivery or a patient notification.

## Acceptance evidence

- Separate PostgreSQL connections compete for the same provider with different chairs and the same chair with different providers: exactly one transaction commits in each collision.
- Adjacent intervals commit; overlapping intervals conflict; separate clinics remain isolated.
- Release/expiry/create races do not overbook, resurrect or renew a hold.
- Identical retries create one hold, occupancy pair, audit and event; changed payload conflicts.
- Foreign-clinic identifiers, wrong resource kinds, inactive resources, revoked actors, disallowed roles and direct writes fail.
- Audit/outbox/idempotency write failures roll back the hold and both occupancy rows.
- Offset-equivalent instants replay identically across database session timezones.
- API/contract/browser tests cover loading, empty, denied, offline, conflict, unknown outcome, release and expiry states without caching authenticated responses.

## Deferred contracts

Appointment confirmation waits for an approved patient-selection policy and clinic resource rules. It must later consume a valid hold atomically, create an appointment without changing arrival/consultation state, and preserve replay semantics. Cancellation must release capacity with history. Failed rescheduling must retain the original allocation. Those commands, patient/public experiences and external notifications are not part of this contract.
