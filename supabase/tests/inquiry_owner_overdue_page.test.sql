begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(19);
insert into public.clinics(id,name) values
 ('e1000000-0000-4000-8000-000000000001','Synthetic Overdue A'),
 ('e1000000-0000-4000-8000-000000000002','Synthetic Overdue B');
insert into auth.users(id) values
 ('e2000000-0000-4000-8000-000000000001'),
 ('e2000000-0000-4000-8000-000000000002');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
 ('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','reception',true),
 ('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','manager',true);
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
select set_config('request.method','POST',true);
create function pg_temp.overdue(bound jsonb) returns jsonb language sql as $$
 select public.inquiry_owner_overdue_page('e1000000-0000-4000-8000-000000000001',jsonb_build_object('after',bound))
$$;
select ok(not has_function_privilege('anon','public.inquiry_owner_overdue_page(uuid,jsonb)','EXECUTE'),'anonymous execution denied');
set local role authenticated;
select is(jsonb_array_length(pg_temp.overdue(null)->'items'),0,'empty page works');
select throws_ok($$select public.inquiry_owner_overdue_page('e1000000-0000-4000-8000-000000000002','{"after":null}')$$,'42501',null,'cross-clinic access denied');
select throws_ok($$select public.inquiry_owner_overdue_page('e1000000-0000-4000-8000-000000000001','{}')$$,'22023',null,'missing cursor rejected');
select throws_ok($$select public.inquiry_owner_overdue_page('e1000000-0000-4000-8000-000000000001','{"after":null,"extra":true}')$$,'22023',null,'extra page field rejected');
select throws_ok($$select public.inquiry_owner_overdue_page('e1000000-0000-4000-8000-000000000001','{"after":{"follow_up_at":"2026-01-01T00:00:00Z"}}')$$,'22023',null,'incomplete cursor rejected');
select throws_ok($$select public.inquiry_owner_overdue_page('e1000000-0000-4000-8000-000000000001','{"after":{"follow_up_at":"2026-01-01T00:00:00Z","inquiry_id":"e4000000-0000-4000-8000-000000000001","extra":true}}')$$,'22023',null,'extra cursor field rejected');
reset role;
insert into public.inquiries(id,clinic_id,owner_user_id,display_name,source,follow_up_at)
 select ('e4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',
        'Synthetic overdue '||n,'phone',statement_timestamp()-make_interval(days=>(52-n))
 from generate_series(1,51)n;
insert into public.inquiries(clinic_id,owner_user_id,display_name,source,follow_up_at)
 values('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','Other owner','phone',statement_timestamp()-interval '2 days'),
       ('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','Other clinic','phone',statement_timestamp()-interval '1 day');
select is(jsonb_array_length(pg_temp.overdue(null)->'items'),50,'page is bounded at fifty');
select is((pg_temp.overdue(null)->>'truncated')::boolean,true,'fifty first result signals partial page');
select is(pg_temp.overdue(null)->'items'->0->>'display_name','Synthetic overdue 1','oldest administrative deadline first');
select is(pg_temp.overdue(null)->'next_after'->>'inquiry_id','e4000000-0000-4000-8000-000000000050','continuation equals fiftieth row');
create function pg_temp.next_overdue(bound jsonb) returns jsonb language sql as $$
 select public.inquiry_owner_overdue_page('e1000000-0000-4000-8000-000000000001',jsonb_build_object('after',bound))
$$;
select is(jsonb_array_length(pg_temp.next_overdue(pg_temp.overdue(null)->'next_after')->'items'),1,'cursor returns only remaining owner row');
select is((pg_temp.next_overdue(pg_temp.overdue(null)->'next_after')->>'truncated')::boolean,false,'last page is complete');
select is(pg_temp.next_overdue(pg_temp.overdue(null)->'next_after')->'next_after','null'::jsonb,'last page has no cursor');
select is(pg_temp.overdue(null)->>'owner_user_id','e2000000-0000-4000-8000-000000000001','current owner is server derived');
select is((select count(*)::int from private.outbox_events where clinic_id='e1000000-0000-4000-8000-000000000001'),0,'read creates no outbox events');
reset role;
select set_config('request.method','GET',true);
select throws_ok($$select pg_temp.overdue(null)$$,'22023',null,'direct GET denied');
select set_config('request.method','POST',true);
update public.clinic_memberships set role='assistant' where user_id='e2000000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.overdue(null)$$,'42501',null,'assistant role denied');
update public.clinic_memberships set role='reception',active=false where user_id='e2000000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.overdue(null)$$,'42501',null,'inactive membership denied');
select * from finish();
rollback;
