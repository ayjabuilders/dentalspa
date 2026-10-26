-- M01 foundation only; reviewed clinical models and booking belong to later milestones.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.clinic_memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('dentist','reception','assistant','manager')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (clinic_id,user_id,role)
);
create index membership_actor_scope on public.clinic_memberships(user_id,clinic_id) where active;
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  reference text not null,
  display_name text not null check (length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (clinic_id,id), unique (clinic_id,reference)
);
create table public.patient_account_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  primary key (clinic_id,user_id),
  unique (clinic_id,patient_id),
  foreign key (clinic_id,patient_id) references public.patients(clinic_id,id),
  check ((verified_at is null and verified_by is null) or (verified_at is not null and verified_by is not null))
);
create index patient_link_actor on public.patient_account_links(user_id,clinic_id) where verified_at is not null;

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.clinic_memberships enable row level security;
alter table public.patients enable row level security;
alter table public.patient_account_links enable row level security;
revoke all on public.clinics, public.profiles, public.clinic_memberships, public.patients, public.patient_account_links from anon, authenticated;
grant select on public.clinics, public.profiles, public.clinic_memberships, public.patients, public.patient_account_links to authenticated;
create policy own_profile on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy own_memberships on public.clinic_memberships for select to authenticated using (user_id = (select auth.uid()) and active);
create policy own_verified_link on public.patient_account_links for select to authenticated using (user_id = (select auth.uid()) and verified_at is not null);
create policy authorized_clinic on public.clinics for select to authenticated using (
  exists (select 1 from public.clinic_memberships m where m.clinic_id = clinics.id and m.user_id = (select auth.uid()) and m.active)
  or exists (select 1 from public.patient_account_links l where l.clinic_id = clinics.id and l.user_id = (select auth.uid()) and l.verified_at is not null)
);
create policy scoped_patient on public.patients for select to authenticated using (
  exists (select 1 from public.clinic_memberships m where m.clinic_id = patients.clinic_id and m.user_id = (select auth.uid()) and m.active)
  or exists (select 1 from public.patient_account_links l where l.clinic_id = patients.clinic_id and l.patient_id = patients.id and l.user_id = (select auth.uid()) and l.verified_at is not null)
);
-- No client mutations, self-enrollment, role upgrades, or patient linking are allowed.
-- Provision verified development identities via trusted local administration only.

create table private.audit_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  actor_ref uuid not null,
  action text not null,
  aggregate_id uuid not null,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
  -- No free-form note, transcript, request body, or credential field.
);
create table private.outbox_events (
  event_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  event_type text not null,
  event_version integer not null check(event_version > 0),
  aggregate_id uuid not null,
  correlation_id uuid not null,
  actor_ref uuid not null,
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  attempts integer not null default 0 check(attempts >= 0),
  lease_until timestamptz
);
create index pending_outbox on private.outbox_events(occurred_at) where published_at is null;
create table private.consumed_events (
  consumer_id text not null,
  event_id uuid not null references private.outbox_events(event_id),
  consumed_at timestamptz not null default now(),
  primary key (consumer_id,event_id)
);
alter table private.audit_events enable row level security;
alter table private.outbox_events enable row level security;
alter table private.consumed_events enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
-- Atomic domain-write + audit + outbox writer is added alongside the first command
-- in M02, using a transaction. There is no pretend worker or delivery guarantee in M01.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('patient-documents','patient-documents',false,10485760,array['application/pdf','image/jpeg','image/png']);
-- No storage.objects policies are added: uploads, reads, and signed-link creation
-- stay denied until document release/ownership commands are implemented.
