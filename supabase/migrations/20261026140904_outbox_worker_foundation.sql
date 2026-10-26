-- Disabled worker foundation: no grants, public RPC, dispatcher, or external delivery.
-- Delivery state is per consumer; the original outbox row is the immutable envelope.
create table private.outbox_deliveries (
  consumer_id text not null check (consumer_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  event_id uuid not null references private.outbox_events(event_id),
  status text not null default 'pending' check (status in ('pending','processing','delivered','dead')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  last_failure_code text check (last_failure_code in ('handler_failed','lease_expired')),
  primary key (consumer_id,event_id),
  check ((status = 'processing') = (lease_token is not null and lease_until is not null))
);
create index outbox_delivery_ready on private.outbox_deliveries(consumer_id,next_attempt_at) where status in ('pending','processing');
create table private.outbox_attempts (
  consumer_id text not null,
  event_id uuid not null,
  attempt integer not null check (attempt between 1 and 10),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null default 'processing' check (outcome in ('processing','delivered','handler_failed','lease_expired')),
  primary key (consumer_id,event_id,attempt),
  foreign key (consumer_id,event_id) references private.outbox_deliveries(consumer_id,event_id)
);
alter table private.outbox_deliveries enable row level security;
alter table private.outbox_attempts enable row level security;
revoke all on private.outbox_deliveries, private.outbox_attempts from public,anon,authenticated;
