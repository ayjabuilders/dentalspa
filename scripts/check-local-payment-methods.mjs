import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
const clinic=randomUUID(),foreignClinic=randomUUID(),account=randomUUID(),foreignAccount=randomUUID(),gate=randomUUID(),key=randomUUID();let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
async function fails(code,fn){await db.query('savepoint expected_failure');let error;try{await fn();}catch(e){error=e;}await db.query('rollback to savepoint expected_failure');assert.equal(error?.code,code);}
await db.connect();try{
  await db.query('begin');
  if(!(await db.query("select to_regclass('private.finance_payment_methods') is not null present")).rows[0].present)await db.query(readFileSync(new URL('../supabase/migrations/20261031120850_local_payment_method_foundation.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
  const actor=(await db.query("select user_id from public.clinic_memberships where active and role='manager' limit 1")).rows[0].user_id;
  await db.query("insert into public.clinics(id,name) values($1,'Paiements QA FICTIF'),($2,'Autre QA FICTIF')",[clinic,foreignClinic]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true)",[clinic,actor]);
  await db.query('insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2)',[clinic,gate]);
  await db.query("insert into private.finance_receiving_accounts(clinic_id,id,label,kind) values($1,$2,'Banque fictive','bank'),($3,$4,'Autre banque fictive','bank')",[clinic,account,foreignClinic,foreignAccount]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
  const body={method_id:null,expected_version:0,code:'TRANSFER',label:'Virement fictif',kind:'bank_transfer',active:true,reference_required:true,settlement_behavior:'separate_verification',receiving_account_id:account};
  const save=async(payload=body,requestKey=key,capability=gate)=>(await db.query('select public.save_local_payment_method($1,$2::jsonb,$3,$4) r',[clinic,JSON.stringify(payload),requestKey,capability])).rows[0].r;
  let first,second;
  await check('create pins account, reference and separate settlement policy',async()=>{first=await save();assert.equal(first.version,1);assert.deepEqual(first.receiving_account,{id:account,label:'Banque fictive',kind:'bank'});assert.equal(first.reference_required,true);assert.equal(first.settlement_behavior,'separate_verification');assert.equal(first.synthetic_only,true);});
  await check('same key returns exact receipt',async()=>assert.deepEqual(await save(),{...first,replayed:true}));
  await check('all five method kinds preserve explicit settlement behavior',async()=>{
    await db.query('savepoint method_kinds');
    for(const kind of ['cash','card_terminal','bank_transfer','cheque','custom']){
      const behavior=kind==='cash'?'at_confirmation':'separate_verification';
      const receipt=await save({...body,kind,code:kind.toUpperCase(),settlement_behavior:behavior},randomUUID());
      assert.equal(receipt.kind,kind);assert.equal(receipt.settlement_behavior,behavior);
    }
    await db.query('rollback to savepoint method_kinds');
  });
  await check('same key cannot change method',()=>fails('SH410',()=>save({...body,label:'Changed'})));
  await check('duplicate method code conflicts',()=>fails('SH409',()=>save(body,randomUUID())));
  await check('foreign receiving account denied',()=>fails('PT404',()=>save({...body,code:'OTHER',receiving_account_id:foreignAccount},randomUUID())));
  await check('wrong capability denied',()=>fails('PT503',()=>save(body,randomUUID(),'incorrect')));
  await check('extra bank credentials and invalid configuration rejected',async()=>{for(const payload of [{...body,iban:'DO-NOT-STORE'},{...body,reference_required:null},{...body,kind:'unknown'},{...body,settlement_behavior:'automatic_provider'},{...body,expected_version:1},{...body,label:''},{...body,active:'true'}])await fails('22023',()=>save(payload,randomUUID()));});
  const revision={...body,method_id:first.method_id,expected_version:1,code:'TRANSFER2',label:'Virement révisé',active:false};
  await db.query('reset role');await db.query("update private.finance_receiving_accounts set label='Destination renommée' where clinic_id=$1 and id=$2",[clinic,account]);await db.query('set local role authenticated');
  await check('edit appends immutable version with current destination snapshot',async()=>{second=await save(revision,randomUUID());assert.equal(second.version,2);assert.equal(second.active,false);assert.equal(second.receiving_account.label,'Destination renommée');});
  await check('stale edit rejected',()=>fails('SH409',()=>save(revision,randomUUID())));
  await check('creation replay survives later version changes',async()=>assert.deepEqual(await save(),{...first,replayed:true}));
  await db.query('reset role');
  await check('historical label code and destination preserved',async()=>{const row=(await db.query('select code,label,account_snapshot from private.finance_payment_method_versions where clinic_id=$1 and method_id=$2 and version=1',[clinic,first.method_id])).rows[0];assert.equal(row.code,'TRANSFER');assert.equal(row.label,'Virement fictif');assert.equal(row.account_snapshot.label,'Banque fictive');});
  await check('snapshot updates prohibited',()=>fails('55000',()=>db.query('update private.finance_payment_method_versions set active=false where clinic_id=$1',[clinic])));
  await db.query('savepoint inactive_account');await db.query('update private.finance_receiving_accounts set active=false where clinic_id=$1',[clinic]);await db.query('set local role authenticated');
  await check('inactive receiving destination blocks new versions',()=>fails('PT404',()=>save({...revision,expected_version:2},randomUUID())));await db.query('rollback to savepoint inactive_account');
  await db.query("create function pg_temp.fail_method_outbox() returns trigger language plpgsql as $$ begin if new.event_type='LocalPaymentMethodSaved' then raise exception 'injected failure'; end if; return new; end $$");
  await db.query('create trigger qa_method_outbox before insert on private.outbox_events for each row execute function pg_temp.fail_method_outbox()');await db.query('set local role authenticated');
  await check('outbox failure rolls back method version and receipt',()=>fails('P0001',()=>save({...revision,expected_version:2,active:true},randomUUID())));
  await db.query('reset role');await db.query('drop trigger qa_method_outbox on private.outbox_events');
  await check('one event and command per committed version',async()=>{for(const table of ['finance_payment_method_versions','finance_payment_method_commands','outbox_events','audit_events'])assert.equal((await db.query('select count(*)::int n from private.'+table+' where clinic_id=$1',[clinic])).rows[0].n,2);});
  await db.query('set local role authenticated');await check('private payment data denied',()=>fails('42501',()=>db.query('select * from private.finance_payment_methods')));
  await db.query('reset role');await db.query('update public.clinic_memberships set active=false where clinic_id=$1',[clinic]);await db.query('set local role authenticated');
  await check('revoked manager cannot replay',()=>fails('42501',()=>save()));
  await db.query('reset role');await db.query('set local role anon');await check('anonymous method command denied',()=>fails('42501',()=>save()));
  console.log(checks+' payment-method checks passed; all fixture/configuration changes rolled back.');
}finally{await db.query('rollback');await db.end();}
