import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const file='apps/dental-api/.env.local';let env=readFileSync(file,'utf8');const read=name=>env.match(new RegExp('^'+name+'=(.*)$','m'))?.[1]?.trim();const url=new URL(read('SUPABASE_URL'));
assert.ok(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&url.port==='54321'&&!url.username&&!url.password);
const clinic='10000000-0000-4000-8000-000000000001',db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
await db.connect();try{
 await db.query('begin');assert.equal((await db.query("select count(*)::int n from public.clinics where id=$1 and name='Cabinet Dentaire Atlas - Casablanca (FICTIF)'",[clinic])).rows[0].n,1);
 const gate=(await db.query('select api_gate_key from private.finance_draft_gates where clinic_id=$1 and enabled and synthetic_only',[clinic])).rows[0]?.api_gate_key;assert.ok(gate&&gate===read('LOCAL_QUOTE_DRAFT_GATE_KEY'),'Existing local capability required');
 const actor=(await db.query("select m.user_id from public.clinic_memberships m join auth.users u on u.id=m.user_id where m.clinic_id=$1 and m.active and m.role='manager' and u.email='demo.gestionnaire@dentalspa.test'",[clinic])).rows[0]?.user_id;assert.ok(actor,'Existing synthetic manager required');
 await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['local-payments-enable:'+clinic]);
 const methods=(await db.query('select count(*)::int n from private.finance_payment_methods where clinic_id=$1',[clinic])).rows[0].n;
 if(methods===0){
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
  for(const seed of [{code:'DEMO_CASH',label:'Espèces fictives',kind:'cash',accountLabel:'Caisse Atlas (FICTIF)',accountKind:'cash_drawer',reference:false,settlement:'at_confirmation'},{code:'DEMO_TRANSFER',label:'Virement fictif',kind:'bank_transfer',accountLabel:'Banque Atlas (FICTIF)',accountKind:'bank',reference:true,settlement:'separate_verification'}]){
   const account=(await db.query('select public.save_local_receiving_account($1,$2::jsonb,$3,$4) r',[clinic,JSON.stringify({account_id:null,expected_version:0,label:seed.accountLabel,kind:seed.accountKind,active:true}),randomUUID(),gate])).rows[0].r;
   await db.query('select public.save_local_payment_method($1,$2::jsonb,$3,$4)',[clinic,JSON.stringify({method_id:null,expected_version:0,code:seed.code,label:seed.label,kind:seed.kind,active:true,reference_required:seed.reference,settlement_behavior:seed.settlement,receiving_account_id:account.account_id}),randomUUID(),gate]);
  }
  await db.query('reset role');
 }
 await db.query("insert into private.local_payment_settings(clinic_id,enabled,receipt_series) values($1,true,'DEMO-R-ATLAS') on conflict(clinic_id) do update set enabled=true where private.local_payment_settings.synthetic_only",[clinic]);
 await db.query('commit');const pattern=/^ENABLE_LOCAL_PAYMENTS=.*$/m;env=pattern.test(env)?env.replace(pattern,'ENABLE_LOCAL_PAYMENTS=true'):env.trimEnd()+'\nENABLE_LOCAL_PAYMENTS=true\n';writeFileSync(file,env);
 console.log('Local synthetic Atlas payments enabled. '+(methods===0?'Two labelled sample methods created.':'Existing methods preserved.')+' Accounts, patient records and receipt numbers preserved. Restart local API.');
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
