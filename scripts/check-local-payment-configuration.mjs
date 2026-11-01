import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
const clinic=randomUUID(),other=randomUUID(),foreign=randomUUID(),gate=randomUUID(),key=randomUUID();let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
async function fails(code,fn){await db.query('savepoint expected_failure');let error;try{await fn();}catch(e){error=e;}await db.query('rollback to savepoint expected_failure');assert.equal(error?.code,code);}
await db.connect();try{
 await db.query('begin');const actor=(await db.query("select user_id from public.clinic_memberships where role='manager' and active limit 1")).rows[0].user_id;
 await db.query("insert into public.clinics(id,name) values($1,'Configuration QA FICTIF'),($2,'Autre QA FICTIF')",[clinic,other]);
 await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true)",[clinic,actor]);await db.query('insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2)',[clinic,gate]);
 await db.query("insert into private.finance_receiving_accounts(clinic_id,id,label,kind) values($1,$2,'Autre banque','bank')",[other,foreign]);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
 const body={account_id:null,expected_version:0,label:'Caisse fictive',kind:'cash_drawer',active:true};
 const save=async(payload=body,k=key,capability=gate)=>(await db.query('select public.save_local_receiving_account($1,$2::jsonb,$3,$4) r',[clinic,JSON.stringify(payload),k,capability])).rows[0].r;
 const read=async(id=clinic)=>(await db.query('select public.read_local_payment_configuration($1,$2) r',[id,gate])).rows[0].r;
 let account,method;
 await check('empty configuration is scoped and explicit',async()=>assert.deepEqual(await read(),{clinic_id:clinic,synthetic_only:true,accounts:[],methods:[],accounts_truncated:false,methods_truncated:false}));
 await check('create receiving account',async()=>{account=await save();assert.equal(account.version,1);assert.equal(account.kind,'cash_drawer');});
 await check('exact command retry',async()=>assert.deepEqual(await save(),{...account,replayed:true}));
 await check('key reuse rejects changed command',()=>fails('SH410',()=>save({...body,label:'Different'})));
 await check('strict validation rejects secrets and malformed states',async()=>{for(const payload of [{...body,iban:'SYNTHETIC-NOT-ALLOWED'},{...body,label:' '},{...body,active:null},{...body,expected_version:1},{...body,kind:'unknown'},{...body,expected_version:0.5}])await fails('22023',()=>save(payload,randomUUID()));});
 await check('wrong gate denied',()=>fails('PT503',()=>save(body,randomUUID(),'wrong')));
 await check('foreign account edit denied',()=>fails('PT404',()=>save({...body,account_id:foreign,expected_version:1},randomUUID())));
 const methodBody={method_id:null,expected_version:0,code:'CASH',label:'Espèces fictives',kind:'cash',active:true,reference_required:false,settlement_behavior:'at_confirmation',receiving_account_id:account.account_id};
 method=(await db.query('select public.save_local_payment_method($1,$2::jsonb,$3,$4) r',[clinic,JSON.stringify(methodBody),randomUUID(),gate])).rows[0].r;
 await check('rename/archive increments version without changing method snapshot',async()=>{const revised=await save({...body,account_id:account.account_id,expected_version:1,label:'Caisse renommée',active:false},randomUUID());assert.equal(revised.version,2);const config=await read();assert.equal(config.accounts[0].label,'Caisse renommée');assert.equal(config.accounts[0].active,false);assert.equal(config.methods[0].destination_active,false);assert.equal(config.methods[0].receiving_account.label,'Caisse fictive');assert.equal(config.methods[0].id,method.method_id);});
 await check('stale edit conflicts',()=>fails('SH409',()=>save({...body,account_id:account.account_id,expected_version:1},randomUUID())));
 await check('replay stays historical after rename/archive',async()=>assert.deepEqual(await save(),{...account,replayed:true}));
 await check('foreign configuration denied',()=>fails('42501',()=>read(other)));
 await db.query('reset role');await db.query("create function pg_temp.fail_account_outbox() returns trigger language plpgsql as $$ begin if new.event_type='LocalReceivingAccountSaved' then raise exception 'injected';end if;return new;end $$");await db.query('create trigger qa_account_outbox before insert on private.outbox_events for each row execute function pg_temp.fail_account_outbox()');await db.query('set local role authenticated');
 await check('outbox failure rolls back account change',()=>fails('P0001',()=>save({...body,account_id:account.account_id,expected_version:2},randomUUID())));
 await db.query('reset role');await db.query('drop trigger qa_account_outbox on private.outbox_events');
 await check('rollback preserved version and exact event count',async()=>{assert.equal((await db.query('select version from private.finance_receiving_accounts where clinic_id=$1',[clinic])).rows[0].version,2);for(const table of ['finance_receiving_account_commands','audit_events','outbox_events']){const extra=table==='finance_receiving_account_commands'?'':" and "+(table==='audit_events'?'action':'event_type')+"='LocalReceivingAccountSaved'";assert.equal((await db.query('select count(*)::int n from private.'+table+' where clinic_id=$1'+extra,[clinic])).rows[0].n,2);}});
 await check('command receipts immutable',()=>fails('55000',()=>db.query('delete from private.finance_receiving_account_commands where clinic_id=$1',[clinic])));
 await db.query('set local role authenticated');await check('direct private table denied',()=>fails('42501',()=>db.query('select * from private.finance_receiving_account_commands')));
 await db.query('reset role');await db.query("update public.clinic_memberships set role='reception' where clinic_id=$1",[clinic]);await db.query('set local role authenticated');await check('reception read and command denied',async()=>{await fails('42501',()=>read());await fails('42501',()=>save());});
 await db.query('reset role');await db.query("update public.clinic_memberships set role='manager',active=false where clinic_id=$1",[clinic]);await db.query('set local role authenticated');await check('revoked manager denied even replay',()=>fails('42501',()=>save()));await db.query('reset role');await db.query('set local role anon');await check('anonymous configuration denied',()=>fails('42501',()=>read()));
 console.log(checks+' configuration checks passed; all changes rolled back.');
}finally{await db.query('rollback');await db.end();}
