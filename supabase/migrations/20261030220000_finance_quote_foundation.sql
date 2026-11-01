begin;

-- M14 schema foundation only. No catalog rows, prices, invoices, payments,
-- role grants, or financial workflow endpoints are enabled by this migration.
create table private.finance_catalog_services (
  clinic_id uuid not null references public.clinics(id),
  id uuid not null default gen_random_uuid(),
  service_code text not null check (length(service_code) between 1 and 60),
  service_name text not null check (length(service_name) between 1 and 160),
  category_code text check (category_code is null or length(category_code) between 1 and 60),
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key (clinic_id, id),
  unique (clinic_id, service_code)
);

-- A price is a separate immutable snapshot. Values are integer minor units;
-- tax amount is deliberately absent until accounting policy is approved.
create table private.finance_catalog_price_versions (
  clinic_id uuid not null,
  service_id uuid not null,
  version integer not null check (version > 0),
  unit_amount_minor bigint not null check (unit_amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  effective_from timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key (clinic_id, service_id, version),
  foreign key (clinic_id, service_id)
    references private.finance_catalog_services(clinic_id, id)
);

create table private.finance_quotes (
  clinic_id uuid not null references public.clinics(id),
  id uuid not null default gen_random_uuid(),
  patient_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key (clinic_id, id),
  foreign key (clinic_id, patient_id)
    references public.patients(clinic_id, id)
);

-- Only draft versions exist in this foundation. Issue, acceptance, publication,
-- tax treatment, numbering, and financial approvals need separate decisions.
create table private.finance_quote_versions (
  clinic_id uuid not null,
  quote_id uuid not null,
  version integer not null check (version > 0),
  state text not null default 'draft' check (state = 'draft'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  discount_minor bigint not null check (discount_minor >= 0 and discount_minor <= subtotal_minor),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint generated always as (subtotal_minor - discount_minor + tax_minor) stored,
  valid_until date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key (clinic_id, quote_id, version),
  foreign key (clinic_id, quote_id)
    references private.finance_quotes(clinic_id, id)
);

create table private.finance_quote_lines (
  clinic_id uuid not null,
  quote_id uuid not null,
  quote_version integer not null,
  line_number integer not null check (line_number > 0),
  service_id uuid not null,
  price_version integer not null,
  label_snapshot text not null check (length(label_snapshot) between 1 and 160),
  quantity integer not null check (quantity > 0),
  unit_amount_minor bigint not null check (unit_amount_minor >= 0),
  subtotal_minor bigint generated always as (quantity * unit_amount_minor) stored,
  discount_minor bigint not null check (discount_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint generated always as (quantity * unit_amount_minor - discount_minor + tax_minor) stored,
  primary key (clinic_id, quote_id, quote_version, line_number),
  check (discount_minor <= quantity * unit_amount_minor),
  foreign key (clinic_id, quote_id, quote_version)
    references private.finance_quote_versions(clinic_id, quote_id, version),
  foreign key (clinic_id, service_id, price_version)
    references private.finance_catalog_price_versions(clinic_id, service_id, version)
);

create function private.reject_finance_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'finance_snapshot_is_immutable';
end;
$$;
revoke all on function private.reject_finance_snapshot_mutation() from public, anon, authenticated, service_role;

create trigger finance_price_version_immutable
before update or delete on private.finance_catalog_price_versions
for each row execute function private.reject_finance_snapshot_mutation();

create trigger finance_quote_version_immutable
before update or delete on private.finance_quote_versions
for each row execute function private.reject_finance_snapshot_mutation();

create trigger finance_quote_line_immutable
before update or delete on private.finance_quote_lines
for each row execute function private.reject_finance_snapshot_mutation();

alter table private.finance_catalog_services enable row level security;
alter table private.finance_catalog_price_versions enable row level security;
alter table private.finance_quotes enable row level security;
alter table private.finance_quote_versions enable row level security;
alter table private.finance_quote_lines enable row level security;

revoke all on private.finance_catalog_services,
  private.finance_catalog_price_versions,
  private.finance_quotes,
  private.finance_quote_versions,
  private.finance_quote_lines
  from public, anon, authenticated, service_role;

commit;
