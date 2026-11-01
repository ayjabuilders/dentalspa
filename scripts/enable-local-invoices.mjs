import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import pg from 'pg';
const file='apps/dental-api/.env.local';let env=readFileSync(file,'utf8');
const read=name=>env.match(new RegExp('^'+name+'=(.*)$','m'))?.[1]?.trim();
const url=new URL(read('SUPABASE_URL'));
assert.ok(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&url.port==='54321');
const clinic='10000000-0000-4000-8000-000000000001';
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
await db.connect();try{
  assert.equal((await db.query("select count(*)::int n from public.clinics where id=$1 and name='Cabinet Dentaire Atlas - Casablanca (FICTIF)'",[clinic])).rows[0].n,1);
  const gate=(await db.query('select api_gate_key from private.finance_draft_gates where clinic_id=$1 and enabled and synthetic_only',[clinic])).rows[0]?.api_gate_key;
  assert.ok(gate&&gate===read('LOCAL_QUOTE_DRAFT_GATE_KEY'),'Existing local quote capability required');
  await db.query("insert into private.local_invoice_settings(clinic_id,drafts_enabled,issuance_enabled,series_code) values($1,true,true,'DEMO-ATLAS') on conflict(clinic_id) do update set drafts_enabled=true,issuance_enabled=true where private.local_invoice_settings.synthetic_only",[clinic]);
  const pattern=/^ENABLE_LOCAL_INVOICES=.*$/m;env=pattern.test(env)?env.replace(pattern,'ENABLE_LOCAL_INVOICES=true'):env.trimEnd()+'\nENABLE_LOCAL_INVOICES=true\n';writeFileSync(file,env);
  console.log('Synthetic Atlas invoices enabled locally. Restart API. Existing accounts, numbers and documents preserved.');
}finally{await db.end();}
