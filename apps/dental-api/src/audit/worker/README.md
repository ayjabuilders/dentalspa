# Disabled transactional outbox worker foundation

This class is deliberately not wired to Nest, an HTTP endpoint, a scheduler or an external transport. Calling `runOnce` performs at most one attempt; idle is explicit. There is no delivery or production-readiness claim.

## Required adapter and policy

Supply a server-only `TransactionalDatabase` whose callback executes on one PostgreSQL connection inside a real transaction, commits only on success and rolls back on every exception. The runtime must enforce connection, statement and transaction timeouts below the lease budget. No database driver or credential is introduced here; no environment variable is currently read. Before activation, provision a dedicated least-privilege worker database role and appropriate RLS policies outside the browser/API public schema, select the worker host and configure its secret connection outside source control.

Configure one stable consumer name, an explicit event-type subscription, 1–10 attempts, 1–300 second leases and 1–3600 second initial backoff. Backoff doubles with a one-hour cap. Configuration is copied at construction. Unknown event versions must be rejected by the registered handler; do not silently parse them as supported.

## Guarantees and limits

- Claims materialize up to 100 pending subscription rows and lease one with `FOR UPDATE SKIP LOCKED`. A random token fences replaced leases. Expired leases are reclaimable, including attempts lost to a crash. Exhausted attempts move to `dead`.
- Handler writes, unique `(consumer_id,event_id)` consumption, attempt completion and delivery completion commit together. Handler errors roll back those writes and schedule a bounded retry in a separate transaction. A crash between transactions leaves a recoverable lease.
- Handlers are **local database mutations only** and must use the supplied transaction. Do not send email, notifications, AI requests, storage writes or other external effects here. SQL transaction rollback cannot undo them. External delivery requires a separately designed idempotent transport and its own confirmed-delivery state.
- The worker does not mark `outbox_events.published_at`: delivery is per consumer and is not evidence of transport publication. Original global attempt/lease fields are retained for compatibility and are not used.
- Attempt history contains timestamps, event references, attempt count and fixed outcomes only. Exception text and event payload are never persisted or logged. Tenant context comes from the envelope; each handler must enforce its own clinic-scoped writes and version contract.
- Dead work is not automatically replayed. Review the failure and consumer-version compatibility before introducing a controlled replay operation. No replay endpoint exists.
- No producer/domain mutation is added; future producers must atomically write their domain change, audit and outbox row.

The migration keeps both new tables private with RLS and no client grants. PGlite tests execute the actual SQL with schema stubs, including rollback, retry/dead state, expired leases, token fencing, independent consumers and interleaved worker calls. PGlite serializes transactions; this does **not** substitute for multi-connection contention/crash tests against hosted or full local PostgreSQL before activation.
