import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import pg from 'pg';
const file='apps/dental-api/.env.local';let env=readFileSync(file,'utf8');
const read=name=>env.match(new RegExp('^'+name+'=(.*)$','m'))?.[1]?.trim();
assert.equal(read('SUPABASE_URL'),'http://127.0.0.1:54321','Local stack only');
assert.equal(read('ENABLE_LOCAL_PAYMENTS'),'true','Existing local payments must be configured');
const clinic='10000000-0000-4000-8000-000000000001';
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',connectionTimeoutMillis:5000});
await db.connect();try{
 await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtextextended('enable-local-installments-atlas',0))");
 assert.equal((await db.query("select count(*)::int n from public.clinics where id=$1 and name='Cabinet Dentaire Atlas - Casablanca (FICTIF)'",[clinic])).rows[0].n,1);
 const gate=(await db.query('select api_gate_key from private.finance_draft_gates where clinic_id=$1 and enabled and synthetic_only',[clinic])).rows[0]?.api_gate_key;assert.ok(gate&&gate===read('LOCAL_QUOTE_DRAFT_GATE_KEY'),'Existing local gate mismatch');
 assert.equal((await db.query('select count(*)::int n from private.local_payment_settings where clinic_id=$1 and enabled and synthetic_only',[clinic])).rows[0].n,1);
 const before=(await db.query('select synthetic_only from private.local_installment_settings where clinic_id=$1',[clinic])).rows[0];assert.ok(!before||before.synthetic_only,'Refuse non-synthetic settings');
 await db.query('insert into private.local_installment_settings(clinic_id,enabled) values($1,true) on conflict(clinic_id) do update set enabled=true where private.local_installment_settings.synthetic_only',[clinic]);
 await db.query('commit');
 const pattern=/^ENABLE_LOCAL_INSTALLMENTS=.*$/m;env=pattern.test(env)?env.replace(pattern,'ENABLE_LOCAL_INSTALLMENTS=true'):env.trimEnd()+'\nENABLE_LOCAL_INSTALLMENTS=true\n';writeFileSync(file,env);
 console.log('Local synthetic Atlas installments enabled. Existing invoices, payments, agreements and credentials preserved. Restart local API.');
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
