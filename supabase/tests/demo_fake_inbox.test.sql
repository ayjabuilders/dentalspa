begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(23);

insert into public.clinics(id,name) values
 ('10000000-0000-4000-8000-000000000001','Cabinet Atlas (FICTIF)'),
 ('10000000-0000-4000-8000-000000000002','Cabinet Sourire (FICTIF)')
on conflict (id) do nothing;
insert into private.demo_fake_conversations(conversation_ref,clinic_id) values
 ('DEMO-CHAT-001','10000000-0000-4000-8000-000000000001'),
 ('DEMO-CHAT-002','10000000-0000-4000-8000-000000000001'),
 ('DEMO-CHAT-003','10000000-0000-4000-8000-000000000002'),
 ('DEMO-CHAT-004','10000000-0000-4000-8000-000000000002')
on conflict (conversation_ref) do nothing;

insert into auth.users(id) values
 ('96000000-0000-4000-8000-000000000001'),
 ('96000000-0000-4000-8000-000000000002'),
 ('96000000-0000-4000-8000-000000000003');
-- Live synthetic sessions for authenticated fixture actors.
insert into auth.sessions(id,user_id,not_after) values('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',now()+interval '1 hour'),('96000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000002',now()+interval '1 hour'),('96000000-0000-4000-8000-000000000003','96000000-0000-4000-8000-000000000003',now()+interval '1 hour');
insert into public.clinic_memberships(clinic_id,user_id,role,active) values
 ('10000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001','reception',true),
 ('10000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','assistant',true),
 ('10000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000003','manager',true);

-- The active local demo may have its gate enabled; use a transaction-local setting
-- and restore the workstation state automatically with the rollback below.
update private.demo_fake_inbox_settings set enabled=false,api_gate_key='' where singleton;
select is((select enabled from private.demo_fake_inbox_settings where singleton),false,'test transaction starts with database gate disabled');
select ok(not exists(select 1 from pg_policies where schemaname='private' and tablename='demo_fake_inbound_messages' and cmd='SELECT' and 'anon'=any(roles::text[])),'anonymous has no message read policy');
select ok(not has_function_privilege('anon','public.list_demo_fake_inbound_messages(uuid)','EXECUTE'),'anonymous cannot list synthetic messages');
select ok(has_function_privilege('anon','public.accept_demo_fake_inbound_message(text,uuid,text,text,integer,timestamp with time zone,text)','EXECUTE'),'only the narrow signed-event RPC is available to anonymous role');
select ok(has_function_privilege('authenticated','public.list_demo_fake_inbound_messages(uuid)','EXECUTE'),'authenticated callers can invoke the RLS-protected list');

select set_config('request.method','POST',true);
set local role anon;
select throws_ok($$select public.accept_demo_fake_inbound_message('local-gate-secret','97000000-0000-4000-8000-000000000001','DEMO-CHAT-001','DEMO-MSG-901-001',1,now(),'Bonjour, le cabinet est-il ouvert samedi ?')$$,'42501',null,'disabled database gate refuses inbound event');
reset role;
update private.demo_fake_inbox_settings set enabled=true,api_gate_key='local-gate-secret' where singleton;
set local role anon;
select throws_ok($$select public.accept_demo_fake_inbound_message('wrong-secret','97000000-0000-4000-8000-000000000001','DEMO-CHAT-001','DEMO-MSG-901-001',1,now(),'Bonjour, le cabinet est-il ouvert samedi ?')$$,'42501',null,'database gate key is independently enforced');
select is(public.accept_demo_fake_inbound_message('local-gate-secret','97000000-0000-4000-8000-000000000001','DEMO-CHAT-001','DEMO-MSG-901-001',1,'2026-10-30T09:14:00+01:00','Bonjour, le cabinet est-il ouvert samedi ?')->>'disposition','recorded-inbound','allowlisted synthetic event is persisted');
select is(public.accept_demo_fake_inbound_message('local-gate-secret','97000000-0000-4000-8000-000000000001','DEMO-CHAT-001','DEMO-MSG-901-001',1,'2026-10-30T09:14:00+01:00','Bonjour, le cabinet est-il ouvert samedi ?')->>'disposition','duplicate-event','exact event retry is idempotent');
select is(public.accept_demo_fake_inbound_message('local-gate-secret','97000000-0000-4000-8000-000000000002','DEMO-CHAT-001','DEMO-MSG-901-001',1,'2026-10-30T09:14:00+01:00','Bonjour, le cabinet est-il ouvert samedi ?')->>'disposition','duplicate-message','duplicate provider message is not stored twice');
select throws_ok($$select public.accept_demo_fake_inbound_message('local-gate-secret','97000000-0000-4000-8000-000000000003','DEMO-CHAT-001','DEMO-MSG-901-002',2,'2026-10-30T09:15:00+01:00','J’ai mal à une dent')$$,'22023',null,'non-allowlisted message text is rejected');
select throws_ok($$select public.accept_demo_fake_inbound_message('local-gate-secret','97000000-0000-4000-8000-000000000004','DEMO-CHAT-999','DEMO-MSG-901-003',3,now(),'Bonjour, le cabinet est-il ouvert samedi ?')$$,'42501',null,'unknown conversation cannot be routed to a tenant');
select throws_ok($$select public.accept_demo_fake_inbound_message('local-gate-secret','97000000-0000-4000-8000-000000000001','DEMO-CHAT-001','DEMO-MSG-901-001',1,'2026-10-30T09:14:00+01:00','Bonjour, je souhaite connaître les horaires.')$$,'PT409',null,'same event identifier with changed content conflicts');
reset role;
select is((select count(*)::integer from private.demo_fake_inbound_messages where provider_event_id='97000000-0000-4000-8000-000000000001'),1,'duplicate delivery creates one durable inbound event');
select is((select count(*)::integer from private.audit_events where action='DemoInboundMessageReceived' and correlation_id='97000000-0000-4000-8000-000000000001'),1,'one accepted event writes one audit row');
select is((select count(*)::integer from private.outbox_events where event_type='DemoInboundMessageReceived' and correlation_id='97000000-0000-4000-8000-000000000001'),1,'one accepted event writes one outbox event');
select is((select payload ? 'text' from private.outbox_events where event_type='DemoInboundMessageReceived' and correlation_id='97000000-0000-4000-8000-000000000001'),false,'outbox excludes message content');

select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select is((select count(*)::integer from public.list_demo_fake_inbound_messages('10000000-0000-4000-8000-000000000001') where message_ref='DEMO-MSG-901-001'),1,'same-clinic Reception can read the message');
select is((select count(*)::integer from public.list_demo_fake_inbound_messages('10000000-0000-4000-8000-000000000002') where message_ref='DEMO-MSG-901-001'),0,'foreign-clinic message list is empty');
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select is((select count(*)::integer from public.list_demo_fake_inbound_messages('10000000-0000-4000-8000-000000000001') where message_ref='DEMO-MSG-901-001'),0,'Assistant cannot read Reception inbox');
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub'),''))::text,true);
set local role authenticated;
select is((select count(*)::integer from public.list_demo_fake_inbound_messages('10000000-0000-4000-8000-000000000001') where message_ref='DEMO-MSG-901-001'),0,'other-tenant Manager sees no Atlas messages');
reset role;
select throws_ok($$update private.demo_fake_inbound_messages set text='Bonjour, je souhaite connaître les horaires.'$$,'55000',null,'inbound message history is immutable');
select throws_ok($$delete from private.demo_fake_inbound_messages$$,'55000',null,'inbound message history cannot be deleted by normal table mutation');
select * from finish();
rollback;
