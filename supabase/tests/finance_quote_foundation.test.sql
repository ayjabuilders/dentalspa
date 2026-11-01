begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, private;
select plan(30);

select has_table('private', 'finance_catalog_services', 'finance catalog service table exists in private schema');
select has_table('private', 'finance_catalog_price_versions', 'versioned catalog prices exist in private schema');
select has_table('private', 'finance_quotes', 'finance quote header exists in private schema');
select has_table('private', 'finance_quote_versions', 'draft quote versions exist in private schema');
select has_table('private', 'finance_quote_lines', 'quote line snapshots exist in private schema');

select ok((select relrowsecurity from pg_class where oid = 'private.finance_catalog_services'::regclass), 'catalog table has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.finance_catalog_price_versions'::regclass), 'price-version table has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.finance_quotes'::regclass), 'quote table has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.finance_quote_versions'::regclass), 'quote-version table has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.finance_quote_lines'::regclass), 'quote-line table has RLS enabled');

select ok(not exists (
  select 1 from information_schema.table_privileges
  where table_schema = 'private' and table_name like 'finance_%'
    and grantee in ('anon', 'authenticated', 'service_role')
), 'Data API roles and service_role have no direct finance-table grants');
select ok(not has_table_privilege('authenticated', 'private.finance_quotes', 'SELECT'), 'authenticated has no direct read grant on finance quotes');
select is((select count(*)::integer from pg_policies where schemaname = 'private' and tablename like 'finance_%'), 0, 'finance tables have no RLS policies or implicit grants');
select ok((select bool_and(data_type = 'bigint') from information_schema.columns
  where table_schema = 'private' and table_name in ('finance_catalog_price_versions','finance_quote_versions','finance_quote_lines')
    and (column_name like '%amount_minor' or column_name in ('subtotal_minor','discount_minor','tax_minor','total_minor'))),
  'monetary values are stored as integer minor units');
select ok(not has_function_privilege('authenticated', 'private.reject_finance_snapshot_mutation()', 'EXECUTE'), 'authenticated cannot invoke the private trigger function');
select ok(exists (select 1 from pg_trigger where tgname = 'finance_price_version_immutable' and not tgisinternal), 'catalog price snapshots are immutable');
select ok(exists (select 1 from pg_trigger where tgname = 'finance_quote_version_immutable' and not tgisinternal), 'quote versions are immutable');
select ok(exists (select 1 from pg_trigger where tgname = 'finance_quote_line_immutable' and not tgisinternal), 'quote line snapshots are immutable');

insert into auth.users(id) values ('89100000-0000-4000-8000-000000000001');
insert into public.clinics(id, name) values
  ('89000000-0000-4000-8000-000000000001', 'Finance schema test A'),
  ('89000000-0000-4000-8000-000000000002', 'Finance schema test B');
insert into public.patients(id, clinic_id, reference, display_name) values
  ('89200000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', 'TEST-A', 'Profil fictif A'),
  ('89200000-0000-4000-8000-000000000002', '89000000-0000-4000-8000-000000000002', 'TEST-B', 'Profil fictif B');
insert into private.finance_catalog_services(clinic_id, id, service_code, service_name) values
  ('89000000-0000-4000-8000-000000000001', '89300000-0000-4000-8000-000000000001', 'GENERIC-TEST', 'Prestation fictive de test'),
  ('89000000-0000-4000-8000-000000000002', '89300000-0000-4000-8000-000000000002', 'GENERIC-TEST', 'Prestation fictive de test');
insert into private.finance_catalog_price_versions(clinic_id, service_id, version, unit_amount_minor, currency_code, effective_from, created_by) values
  ('89000000-0000-4000-8000-000000000001', '89300000-0000-4000-8000-000000000001', 1, 17, 'MAD', clock_timestamp(), '89100000-0000-4000-8000-000000000001'),
  ('89000000-0000-4000-8000-000000000002', '89300000-0000-4000-8000-000000000002', 1, 17, 'MAD', clock_timestamp(), '89100000-0000-4000-8000-000000000001');
insert into private.finance_quotes(clinic_id, id, patient_id, created_by) values
  ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', '89200000-0000-4000-8000-000000000001', '89100000-0000-4000-8000-000000000001');
insert into private.finance_quote_versions(clinic_id, quote_id, version, state, currency_code, subtotal_minor, discount_minor, tax_minor, created_by) values
  ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', 1, 'draft', 'MAD', 34, 3, 1, '89100000-0000-4000-8000-000000000001');
insert into private.finance_quote_lines(clinic_id, quote_id, quote_version, line_number, service_id, price_version, label_snapshot, quantity, unit_amount_minor, discount_minor, tax_minor) values
  ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', 1, 1, '89300000-0000-4000-8000-000000000001', 1, 'Libellé fictif', 2, 17, 3, 1);

select is((select count(*)::integer from private.finance_catalog_services where service_code = 'GENERIC-TEST'), 2, 'the same generic service code can exist in separate clinics');
select is((select total_minor from private.finance_quote_versions where quote_id = '89400000-0000-4000-8000-000000000001'), 32::bigint, 'quote total is generated from exact integer components');
select is((select total_minor from private.finance_quote_lines where quote_id = '89400000-0000-4000-8000-000000000001'), 32::bigint, 'line total is generated from exact integer components');
select throws_ok($$insert into private.finance_quotes(clinic_id, id, patient_id, created_by) values ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000002', '89200000-0000-4000-8000-000000000002', '89100000-0000-4000-8000-000000000001')$$, '23503', null, 'quote cannot reference a patient from another clinic');
select throws_ok($$insert into private.finance_quote_lines(clinic_id, quote_id, quote_version, line_number, service_id, price_version, label_snapshot, quantity, unit_amount_minor, discount_minor, tax_minor) values ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', 1, 2, '89300000-0000-4000-8000-000000000002', 1, 'Libellé fictif', 1, 17, 0, 0)$$, '23503', null, 'quote line cannot reference another clinic catalog price');
select throws_ok($$insert into private.finance_catalog_services(clinic_id, service_code, service_name) values ('89000000-0000-4000-8000-000000000001', 'GENERIC-TEST', 'Duplicate test')$$, '23505', null, 'service code is unique within a clinic');
select throws_ok($$insert into private.finance_catalog_price_versions(clinic_id, service_id, version, unit_amount_minor, currency_code, effective_from, created_by) values ('89000000-0000-4000-8000-000000000001', '89300000-0000-4000-8000-000000000001', 2, 0, 'MAD', clock_timestamp(), '89100000-0000-4000-8000-000000000001')$$, '23514', null, 'zero price is rejected');
select throws_ok($$insert into private.finance_quote_versions(clinic_id, quote_id, version, state, currency_code, subtotal_minor, discount_minor, tax_minor, created_by) values ('89000000-0000-4000-8000-000000000001', '89400000-0000-4000-8000-000000000001', 2, 'approved', 'MAD', 1, 0, 0, '89100000-0000-4000-8000-000000000001')$$, '23514', null, 'only draft quote versions are supported by this foundation');
select throws_ok($$update private.finance_catalog_price_versions set unit_amount_minor = 18 where clinic_id = '89000000-0000-4000-8000-000000000001' and service_id = '89300000-0000-4000-8000-000000000001' and version = 1$$, '55000', 'finance_snapshot_is_immutable', 'price snapshot cannot be rewritten');
select throws_ok($$update private.finance_quote_versions set discount_minor = 4 where clinic_id = '89000000-0000-4000-8000-000000000001' and quote_id = '89400000-0000-4000-8000-000000000001' and version = 1$$, '55000', 'finance_snapshot_is_immutable', 'quote version cannot be rewritten');
select throws_ok($$delete from private.finance_quote_lines where clinic_id = '89000000-0000-4000-8000-000000000001' and quote_id = '89400000-0000-4000-8000-000000000001' and quote_version = 1 and line_number = 1$$, '55000', 'finance_snapshot_is_immutable', 'quote line snapshot cannot be deleted');

set local role authenticated;
select throws_ok($$select * from private.finance_quotes$$, '42501', null, 'authenticated users cannot read private finance quotes directly');
reset role;

select * from finish();
rollback;
