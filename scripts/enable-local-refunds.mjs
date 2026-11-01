import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const env=readFileSync('apps/dental-api/.env.local','utf8'),read=name=>env.match(new RegExp('^'+name+'=(.*)$','m'))?.[1]?.trim(),url=new URL(read('SUPABASE_URL'));
assert.ok(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&url.port==='54321'&&!url.username&&!url.password);assert.equal(read('ENABLE_LOCAL_PAYMENTS'),'true');
const clinic='10000000-0000-4000-8000-000000000001',db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
await db.connect();try{await db.query('begin');assert.equal((await db.query("select count(*)::int n from public.clinics where id=$1 and name='Cabinet Dentaire Atlas - Casablanca (FICTIF)'",[clinic])).rows[0].n,1);
const gate=(await db.query('select api_gate_key from private.finance_draft_gates where clinic_id=$1 and enabled and synthetic_only',[clinic])).rows[0]?.api_gate_key;assert.ok(gate&&gate===read('LOCAL_QUOTE_DRAFT_GATE_KEY'));
assert.equal((await db.query('select enabled and synthetic_only ready from private.local_payment_settings where clinic_id=$1',[clinic])).rows[0]?.ready,true);
const actor=(await db.query("select m.user_id from public.clinic_memberships m join auth.users u on u.id=m.user_id where m.clinic_id=$1 and m.active and m.role='manager' and u.email='demo.gestionnaire@dentalspa.test'",[clinic])).rows[0]?.user_id;assert.ok(actor);
await db.query('insert into private.local_finance_correction_permissions(clinic_id,actor_ref,refund_allowed) values($1,$2,true) on conflict(clinic_id,actor_ref) do update set refund_allowed=true',[clinic,actor]);await db.query('commit');console.log('Dedicated synthetic Atlas refund permission enabled for existing local demo manager only. No payment/refund created; credit permission unchanged.');}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
