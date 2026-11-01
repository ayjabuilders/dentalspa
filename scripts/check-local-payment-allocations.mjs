import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
const clinic=randomUUID(),patient=randomUUID(),other=randomUUID(),account=randomUUID(),gate=randomUUID(),allocationKey=randomUUID();let checks=0,committed=false;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
async function fails(code,fn){await db.query('savepoint expected_failure');let error;try{await fn();}catch(e){error=e;}await db.query('rollback to savepoint expected_failure');assert.equal(error?.code,code);}
await db.connect();try{
  await db.query('begin');
  if(!(await db.query("select to_regclass('private.finance_payment_allocations') is not null present")).rows[0].present){assert.ok(!process.argv.includes('--concurrency'),'Apply reviewed migration locally before concurrent verification');await db.query(readFileSync(new URL('../supabase/migrations/20261031121529_local_payment_allocations.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));}
  const actor=(await db.query("select user_id from public.clinic_memberships where active and role='manager' limit 1")).rows[0].user_id;
  const receipts=process.argv.includes('--receipts');
  if(receipts&&!(await db.query("select to_regclass('private.finance_payment_receipts') is not null present")).rows[0].present){assert.ok(!process.argv.includes('--concurrency'),'Apply reviewed receipt migration before concurrent verification');await db.query(readFileSync(new URL('../supabase/migrations/20261031121850_local_payment_receipts.sql',import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));}
  await db.query("insert into public.clinics(id,name) values($1,'Allocation QA FICTIF')",[clinic]);
  await db.query("insert into public.patients(clinic_id,id,reference,display_name) values($1,$2,'QA-1','Salma FICTIF'),($1,$3,'QA-2','Yassine FICTIF')",[clinic,patient,other]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true)",[clinic,actor]);
  await db.query('insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2)',[clinic,gate]);
  await db.query('insert into private.local_payment_settings(clinic_id,enabled) values($1,true)',[clinic]);
  await db.query("insert into private.local_invoice_settings(clinic_id,drafts_enabled,issuance_enabled,series_code) values($1,true,true,'DEMO-QA')",[clinic]);
  await db.query("insert into private.finance_receiving_accounts(clinic_id,id,label,kind) values($1,$2,'Caisse QA','cash_drawer')",[clinic,account]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.query('set local role authenticated');
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args)).rows[0].r;
  const service=await rpc('save_local_finance_service',[clinic,JSON.stringify({service_id:null,expected_version:0,code:'QA',label:'Prestation fictive',category:null,unit_amount_minor:10000,archived:false}),randomUUID(),gate]);
  async function invoice(quantity,issued=true,patientId=patient){const quote=await rpc('create_local_quote_draft',[clinic,patientId,JSON.stringify({lines:[{service_id:service.service_id,price_version:1,quantity}]}),randomUUID(),gate]);const draft=await rpc('prepare_local_invoice',[clinic,patientId,quote.quote_id,1,randomUUID(),gate]);if(issued)await rpc('issue_local_invoice',[clinic,patientId,draft.invoice_id,randomUUID(),gate]);return draft.invoice_id;}
  const target=await invoice(3),secondTarget=await invoice(1),draftTarget=await invoice(1,false),otherTarget=await invoice(1,true,other);
  const method=await rpc('save_local_payment_method',[clinic,JSON.stringify({method_id:null,expected_version:0,code:'CASH',label:'Espèces QA',kind:'cash',active:true,reference_required:false,settlement_behavior:'at_confirmation',receiving_account_id:account}),randomUUID(),gate]);
  async function payment(amount,confirmed=true,methodId=method.method_id){const receipt=await rpc('record_local_payment',[clinic,patient,JSON.stringify({method_id:methodId,method_version:1,amount_minor:amount,currency_code:'MAD',effective_at:new Date().toISOString(),reference:'DEMO-QA'}),randomUUID(),gate]);if(confirmed)await rpc('transition_local_payment',[clinic,patient,receipt.payment_id,1,'confirm',true,randomUUID(),gate]);return receipt.payment_id;}
  const source=await payment(20000),secondSource=await payment(25000),pending=await payment(5000,false);
  const allocate=(amount=10000,key=allocationKey,paymentId=source,invoiceId=target,patientId=patient)=>rpc('allocate_local_payment',[clinic,patientId,paymentId,invoiceId,amount,key,gate]);
  let first;
  await check('partial allocation reduces invoice and unapplied payment once',async()=>{first=await allocate();assert.equal(first.amount_minor,10000);assert.equal(first.payment_unapplied_minor,10000);assert.equal(first.invoice_remaining_minor,20000);});
  await check('same-key allocation retry returns original receipt',async()=>assert.deepEqual(await allocate(),{...first,replayed:true}));
  await check('key cannot change amount',()=>fails('SH410',()=>allocate(5000)));
  await check('payment cannot allocate more than remaining funds',()=>fails('SH409',()=>allocate(10001,randomUUID())));
  await check('second payment completes invoice without extra aggregate payment',async()=>{const receipt=await allocate(20000,randomUUID(),secondSource);assert.equal(receipt.invoice_remaining_minor,0);assert.equal(receipt.payment_unapplied_minor,5000);});
  await check('paid invoice cannot receive further allocations',()=>fails('SH409',()=>allocate(1,randomUUID(),secondSource)));
  await check('deposit remainder can fund another invoice exactly once',async()=>{const receipt=await allocate(10000,randomUUID(),source,secondTarget);assert.equal(receipt.payment_unapplied_minor,0);assert.equal(receipt.invoice_remaining_minor,0);});
  await check('original receipt remains immutable after further allocations',async()=>assert.deepEqual(await allocate(),{...first,replayed:true}));
  await check('pending payment cannot reduce an invoice',()=>fails('SH409',()=>allocate(1,randomUUID(),pending,secondTarget)));
  await check('unissued invoice rejects allocation',()=>fails('PT404',()=>allocate(1,randomUUID(),secondSource,draftTarget)));
  await check('patient mismatch cannot use another invoice or payment',async()=>{await fails('PT404',()=>allocate(1,randomUUID(),secondSource,otherTarget));await fails('PT404',()=>allocate(1,randomUUID(),secondSource,otherTarget,other));});
  await check('foreign invoice id cannot cross scope',()=>fails('PT404',()=>allocate(1,randomUUID(),secondSource,randomUUID())));
  await check('invalid fractional zero and excessive minor units rejected',async()=>{for(const amount of [0,-1,1.5,1000000000001])await fails('22023',()=>allocate(amount,randomUUID()));});
  const transfer=await rpc('save_local_payment_method',[clinic,JSON.stringify({method_id:null,expected_version:0,code:'TRANSFER',label:'Virement QA',kind:'bank_transfer',active:true,reference_required:true,settlement_behavior:'separate_verification',receiving_account_id:account}),randomUUID(),gate]);
  const uncleared=await payment(5000,true,transfer.method_id);
  await check('confirmed but unsettled transfer cannot reduce invoice',()=>fails('SH409',()=>allocate(1,randomUUID(),uncleared)));
  await rpc('transition_local_payment',[clinic,patient,uncleared,2,'settlement_failed',true,randomUUID(),gate]);
  await check('failed settlement cannot reduce invoice',()=>fails('SH409',()=>allocate(1,randomUUID(),uncleared)));
  await db.query('reset role');
  await check('allocation ledger sums match distinct payment entries',async()=>{const rows=(await db.query('select payment_id,sum(amount_minor)::int total from private.finance_payment_allocations where clinic_id=$1 group by payment_id',[clinic])).rows;assert.equal(rows.length,2);assert.equal(rows.find(row=>row.payment_id===source).total,20000);assert.equal(rows.find(row=>row.payment_id===secondSource).total,20000);});
  await check('allocations cannot be overwritten or deleted',()=>fails('55000',()=>db.query('delete from private.finance_payment_allocations where clinic_id=$1',[clinic])));
  await db.query("create function pg_temp.fail_allocation_outbox() returns trigger language plpgsql as $$ begin if new.event_type='LocalPaymentAllocated' then raise exception 'injected failure';end if;return new;end $$");await db.query('create trigger qa_allocation_outbox before insert on private.outbox_events for each row execute function pg_temp.fail_allocation_outbox()');await db.query('set local role authenticated');
  const atomicTarget=await invoice(1),atomicKey=randomUUID();
  await check('outbox failure rolls back allocation and command',()=>fails('P0001',()=>allocate(5000,atomicKey,secondSource,atomicTarget)));
  await db.query('reset role');await db.query('drop trigger qa_allocation_outbox on private.outbox_events');
  await check('failed allocation leaves available balance unchanged',async()=>{assert.equal((await db.query('select count(*)::int n from private.finance_payment_commands where clinic_id=$1 and request_key=$2',[clinic,atomicKey])).rows[0].n,0);assert.equal((await db.query('select sum(amount_minor)::int total from private.finance_payment_allocations where clinic_id=$1 and payment_id=$2',[clinic,secondSource])).rows[0].total,20000);});
  await db.query('set local role authenticated');await check('private ledger denied',()=>fails('42501',()=>db.query('select * from private.finance_payment_allocations')));
  if(receipts){
    const receiptKey=randomUUID();let issued;
    const issue=(id=source,key=receiptKey,patientId=patient)=>rpc('issue_local_payment_receipt',[clinic,patientId,id,key,gate]);
    await check('numbered receipt records confirmed payment once',async()=>{issued=await issue();assert.equal(issued.number,'DEMO-R-1');assert.equal(issued.amount_minor,20000);assert.deepEqual(await issue(),{...issued,replayed:true});});
    await check('duplicate issuance and changed payment under key rejected',async()=>{await fails('SH409',()=>issue(source,randomUUID()));await fails('SH410',()=>issue(secondSource));});
    await check('pending failed settlement and other patient cannot receive receipt',async()=>{await fails('SH409',()=>issue(pending,randomUUID()));await fails('SH409',()=>issue(uncleared,randomUUID()));await fails('PT404',()=>issue(source,randomUUID(),other));});
    await db.query('reset role');
    await check('receipt pins allocated invoices and remaining amount',async()=>{const snapshot=(await db.query('select snapshot from private.finance_payment_receipts where clinic_id=$1 and payment_id=$2',[clinic,source])).rows[0].snapshot;assert.equal(snapshot.allocated_minor,20000);assert.equal(snapshot.unapplied_minor,0);assert.equal(snapshot.allocations.length,2);assert.equal(snapshot.method.kind,'cash');assert.equal(snapshot.payer.id,patient);assert.equal(snapshot.settlement,'settled');});
    await check('receipt content cannot be overwritten',()=>fails('55000',()=>db.query("update private.finance_payment_receipts set snapshot='{}' where clinic_id=$1",[clinic])));
    await db.query("create function pg_temp.fail_receipt_outbox() returns trigger language plpgsql as $$ begin if new.event_type='LocalPaymentReceiptIssued' then raise exception 'injected failure';end if;return new;end $$");await db.query('create trigger qa_receipt_outbox before insert on private.outbox_events for each row execute function pg_temp.fail_receipt_outbox()');await db.query('set local role authenticated');
    const secondKey=randomUUID();await check('receipt outbox failure rolls back numbering and document',()=>fails('P0001',()=>issue(secondSource,secondKey)));
    await db.query('reset role');await db.query('drop trigger qa_receipt_outbox on private.outbox_events');await db.query('set local role authenticated');
    await check('next receipt retains unconsumed number after rollback',async()=>assert.equal((await issue(secondSource,secondKey)).number,'DEMO-R-2'));
    await allocate(1,randomUUID(),secondSource,atomicTarget);await db.query('reset role');
    await check('later allocation never rewrites prior receipt snapshot',async()=>{const snapshot=(await db.query('select snapshot from private.finance_payment_receipts where clinic_id=$1 and payment_id=$2',[clinic,secondSource])).rows[0].snapshot;assert.equal(snapshot.allocated_minor,20000);assert.equal(snapshot.unapplied_minor,5000);assert.equal((await db.query('select sum(amount_minor)::int total from private.finance_payment_allocations where clinic_id=$1 and payment_id=$2',[clinic,secondSource])).rows[0].total,20001);});
    await db.query('set local role authenticated');
    const transferPayment=await payment(7000,true,transfer.method_id),transferReceipt=await issue(transferPayment,randomUUID());
    await rpc('transition_local_payment',[clinic,patient,transferPayment,2,'settlement_failed',true,randomUUID(),gate]);await db.query('reset role');
    await check('confirmed transfer receipt never claims cleared funds',async()=>{const snapshot=(await db.query('select snapshot from private.finance_payment_receipts where clinic_id=$1 and id=$2',[clinic,transferReceipt.receipt_id])).rows[0].snapshot;assert.equal(snapshot.state,'confirmed');assert.equal(snapshot.settlement,'pending');assert.equal(snapshot.allocated_minor,0);assert.equal(snapshot.unapplied_minor,7000);});
    await db.query('set local role authenticated');await check('private receipt access denied',()=>fails('42501',()=>db.query('select * from private.finance_payment_receipts')));
  }
  if(process.argv.includes('--concurrency')){
    const sourceRace=await payment(15000),invoiceRaceA=await invoice(2),invoiceRaceB=await invoice(2);
    const targetRace=await invoice(1),paymentRaceA=await payment(10000),paymentRaceB=await payment(10000);
    const retrySource=await payment(10000),retryTarget=await invoice(1),retryKey=randomUUID(),stateRace=await payment(5000,false);
    const receiptSources=receipts?[await payment(1000),await payment(2000),await payment(3000)]:[];
    await db.query('reset role');await db.query('commit');committed=true;
    async function race(name,sql,argsA,argsB,replay=false){
      const config={host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',statement_timeout:15000};
      const a=new pg.Client(config),b=new pg.Client(config);let pending;
      try{
        for(const connection of [a,b]){await connection.connect();await connection.query('begin');await connection.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await connection.query('set local role authenticated');}
        const first=(await a.query(sql,argsA)).rows[0].r;
        const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
        pending=b.query(sql,argsB).then(result=>({result}),error=>({error}));
        let waiting=false;for(let n=0;n<80;n++){waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;if(waiting)break;await delay(25);}
        assert.equal(waiting,true,'Second command must contend on an actual database lock');await a.query('commit');const second=await pending;
        if(replay==='distinct'){assert.ok(second.result);assert.notEqual(second.result.rows[0].r.number,first.number);await b.query('commit');}else if(replay){assert.deepEqual(second.result?.rows[0].r,{...first,replayed:true});await b.query('commit');}else{assert.equal(second.error?.code,'SH409');await b.query('rollback');}
        checks++;console.log('PASS '+name);
      }finally{await a.query('rollback').catch(()=>undefined);if(pending)await pending;await b.query('rollback').catch(()=>undefined);await Promise.all([a.end(),b.end()]);}
    }
    const sql='select public.allocate_local_payment($1,$2,$3,$4,$5,$6,$7) r';
    await race('two invoices cannot overspend the same payment',sql,[clinic,patient,sourceRace,invoiceRaceA,10000,randomUUID(),gate],[clinic,patient,sourceRace,invoiceRaceB,10000,randomUUID(),gate]);
    await race('two payments cannot overpay the same invoice',sql,[clinic,patient,paymentRaceA,targetRace,10000,randomUUID(),gate],[clinic,patient,paymentRaceB,targetRace,10000,randomUUID(),gate]);
    await race('concurrent identical allocation returns one original receipt',sql,[clinic,patient,retrySource,retryTarget,5000,retryKey,gate],[clinic,patient,retrySource,retryTarget,5000,retryKey,gate],true);
    await race('concurrent confirm and fail produce only one next state','select public.transition_local_payment($1,$2,$3,$4,$5,$6,$7,$8) r',[clinic,patient,stateRace,1,'confirm',true,randomUUID(),gate],[clinic,patient,stateRace,1,'fail',true,randomUUID(),gate]);
    if(receipts){const receiptSql='select public.issue_local_payment_receipt($1,$2,$3,$4,$5) r',receiptRetry=randomUUID();await race('concurrent receipts receive unique series numbers',receiptSql,[clinic,patient,receiptSources[0],randomUUID(),gate],[clinic,patient,receiptSources[1],randomUUID(),gate],'distinct');await race('concurrent receipt retry retains exact number and timestamp',receiptSql,[clinic,patient,receiptSources[2],receiptRetry,gate],[clinic,patient,receiptSources[2],receiptRetry,gate],true);}
    await check('race winners have exact ledger totals and event counts',async()=>{
      assert.equal((await db.query('select sum(amount_minor)::int total from private.finance_payment_allocations where clinic_id=$1 and payment_id=$2',[clinic,sourceRace])).rows[0].total,10000);
      assert.equal((await db.query('select sum(amount_minor)::int total from private.finance_payment_allocations where clinic_id=$1 and invoice_id=$2',[clinic,targetRace])).rows[0].total,10000);
      assert.equal((await db.query('select count(*)::int n from private.finance_payment_allocations where clinic_id=$1 and payment_id=$2',[clinic,retrySource])).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from private.finance_payment_events where clinic_id=$1 and payment_id=$2',[clinic,stateRace])).rows[0].n,2);
      assert.equal((await db.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and event_type='LocalPaymentAllocated'",[clinic])).rows[0].n,receipts?7:6);
    });
    await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
  }
  await db.query('reset role');await db.query('update public.clinic_memberships set active=false where clinic_id=$1',[clinic]);await db.query('set local role authenticated');await check('revoked manager cannot replay allocation',()=>fails('42501',()=>allocate()));
  await db.query('reset role');await db.query('set local role anon');await check('anonymous allocation denied',()=>fails('42501',()=>allocate()));
  console.log(checks+' allocation checks passed.');
}finally{
  await db.query('rollback');
  if(committed){
    await db.query('begin');await db.query("set local session_replication_role='replica'");
    for(const table of ['finance_payment_receipts','finance_payment_receipt_counters','finance_payment_allocations','finance_payment_commands','finance_payment_events','finance_payments','local_payment_settings','finance_payment_method_commands','finance_payment_method_versions','finance_payment_methods','finance_receiving_accounts','finance_invoice_commands','finance_issued_invoices','finance_invoice_drafts','finance_invoice_counters','local_invoice_settings','finance_draft_commands','finance_quote_lines','finance_quote_versions','finance_quotes','finance_catalog_commands','finance_catalog_price_versions','finance_catalog_services','finance_draft_gates','audit_events','outbox_events'])await db.query('delete from private.'+table+' where clinic_id=$1',[clinic]);
    await db.query('delete from public.clinic_memberships where clinic_id=$1',[clinic]);await db.query('delete from public.patients where clinic_id=$1',[clinic]);await db.query('delete from public.clinics where id=$1',[clinic]);await db.query('commit');
  }
  await db.end();console.log('All isolated allocation fixtures removed; owner records unchanged.');
}
