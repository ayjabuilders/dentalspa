begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(22);

create table public.api_default_privilege_probe(id bigint);
create sequence public.api_default_privilege_probe_seq;
create function public.api_default_privilege_probe_fn() returns integer language sql as $$ select 1 $$;

select ok(not has_table_privilege('anon','public.api_default_privilege_probe','SELECT'),'new public tables are not selectable by anon');
select ok(not has_table_privilege('anon','public.api_default_privilege_probe','INSERT'),'new public tables are not insertable by anon');
select ok(not has_table_privilege('anon','public.api_default_privilege_probe','UPDATE'),'new public tables are not updatable by anon');
select ok(not has_table_privilege('anon','public.api_default_privilege_probe','DELETE'),'new public tables are not deletable by anon');
select ok(not has_table_privilege('authenticated','public.api_default_privilege_probe','SELECT'),'new public tables are not selectable by authenticated');
select ok(not has_table_privilege('authenticated','public.api_default_privilege_probe','INSERT'),'new public tables are not insertable by authenticated');
select ok(not has_table_privilege('authenticated','public.api_default_privilege_probe','UPDATE'),'new public tables are not updatable by authenticated');
select ok(not has_table_privilege('authenticated','public.api_default_privilege_probe','DELETE'),'new public tables are not deletable by authenticated');
select ok(not has_table_privilege('service_role','public.api_default_privilege_probe','SELECT'),'new public tables require explicit service-role select');
select ok(not has_table_privilege('service_role','public.api_default_privilege_probe','INSERT'),'new public tables require explicit service-role insert');
select ok(not has_table_privilege('service_role','public.api_default_privilege_probe','UPDATE'),'new public tables require explicit service-role update');
select ok(not has_table_privilege('service_role','public.api_default_privilege_probe','DELETE'),'new public tables require explicit service-role delete');

select ok(not has_sequence_privilege('anon','public.api_default_privilege_probe_seq','USAGE'),'new public sequences deny anon usage');
select ok(not has_sequence_privilege('anon','public.api_default_privilege_probe_seq','SELECT'),'new public sequences deny anon select');
select ok(not has_sequence_privilege('authenticated','public.api_default_privilege_probe_seq','USAGE'),'new public sequences deny authenticated usage');
select ok(not has_sequence_privilege('authenticated','public.api_default_privilege_probe_seq','SELECT'),'new public sequences deny authenticated select');
select ok(not has_sequence_privilege('service_role','public.api_default_privilege_probe_seq','USAGE'),'new public sequences require explicit service-role usage');
select ok(not has_sequence_privilege('service_role','public.api_default_privilege_probe_seq','SELECT'),'new public sequences require explicit service-role select');

select ok(not has_function_privilege('anon','public.api_default_privilege_probe_fn()','EXECUTE'),'new public functions deny anon execution');
select ok(not has_function_privilege('authenticated','public.api_default_privilege_probe_fn()','EXECUTE'),'new public functions require explicit authenticated execution');
select ok(not has_function_privilege('service_role','public.api_default_privilege_probe_fn()','EXECUTE'),'new public functions require explicit service-role execution');
grant execute on function public.api_default_privilege_probe_fn() to authenticated;
select ok(has_function_privilege('authenticated','public.api_default_privilege_probe_fn()','EXECUTE'),'explicit authenticated function grants still work');

select * from finish();
rollback;
