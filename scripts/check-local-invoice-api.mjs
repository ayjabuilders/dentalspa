import assert from 'node:assert/strict';
import {URLSearchParams} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import api from '../apps/dental-api/dist/bootstrap.js';
const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000};
const status=JSON.parse(process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],options):execFileSync('pnpm',['exec','supabase','status','-o','json'],options));
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const clinic=randomUUID(),patient=randomUUID(),otherPatient=randomUUID(),series='DEMO-'+randomUUID().slice(0,8).toUpperCase();
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
const adminHeaders={apikey:status.SERVICE_ROLE_KEY,Authorization:'Bearer '+status.SERVICE_ROLE_KEY,'Content-Type':'application/json'};
let app,user,service,quote,invoice,installed=false;
await db.connect();
try{
  const gate=randomBytes(32).toString('hex');
  const email='invoice-'+randomUUID()+'@dentalspa.test',password='Local!'+randomBytes(24).toString('base64url')+'9';
  const created=await fetch(status.API_URL+'/auth/v1/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email,password,email_confirm:true})});assert.equal(created.ok,true);user=(await created.json()).id;
  await db.query('insert into public.clinics(id,name) values($1,$2)',[clinic,'Cabinet Factures QA (FICTIF)']);
  await db.query('insert into public.patients(id,clinic_id,reference,display_name) values($1,$2,$3,$4),($5,$2,$6,$7)',[patient,clinic,'QA-1','Salma Alaoui (FICTIF)',otherPatient,'QA-2','Yassine QA (FICTIF)']);
  await db.query('insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2)',[clinic,gate]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true)",[clinic,user]);
  const signed=await fetch(status.API_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:status.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(signed.ok,true);const token=(await signed.json()).access_token;
  Object.assign(process.env,{SUPABASE_URL:status.API_URL,SUPABASE_ANON_KEY:status.ANON_KEY,ENABLE_LOCAL_QUOTE_DRAFTS:'true',ENABLE_LOCAL_INVOICES:'true',ENABLE_LOCAL_INSTALLMENTS:(process.argv.includes('--installments')||process.argv.includes('--installment-allocations'))?'true':'false',ENABLE_LOCAL_PAYMENTS:process.argv.includes('--payments')?'true':'false',LOCAL_QUOTE_DRAFT_GATE_KEY:gate});
  app=await api.createApplication();await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const headers={Authorization:'Bearer '+token,'X-Clinic-Id':clinic,'Content-Type':'application/json'};
  const post=async(path,body,key=randomUUID(),expected=201,override={})=>{
    const response=await fetch(base+'/api/v1/finance/'+path,{method:'POST',headers:{...headers,'Idempotency-Key':key,...override},body:JSON.stringify(body)});
    assert.equal(response.status,expected,'Unexpected response for '+path);assert.equal(response.headers.get('cache-control'),'no-store');return response.json();
  };
  const root='patients/'+patient+'/invoices';
  const read=async(path=root,expected=200,override={})=>{
    const response=await fetch(base+'/api/v1/finance/'+path,{headers:{...headers,...override}});
    assert.equal(response.status,expected);assert.equal(response.headers.get('cache-control'),'no-store');return response.json();
  };
  assert.deepEqual(await read(),{synthetic_only:true,items:[],truncated:false});
  await read(root,401,{Authorization:''});await read(root,403,{'X-Clinic-Id':'10000000-0000-4000-8000-000000000002'});
  await read('patients/20000000-0000-4000-8000-000000000004/invoices',404);
  await post(root,{quote_id:patient,quote_version:1},randomUUID(),401,{Authorization:''});
  await post(root,{quote_id:patient,quote_version:1},randomUUID(),403,{'X-Clinic-Id':'10000000-0000-4000-8000-000000000002'});
  service=(await post('services',{service_id:null,expected_version:0,code:'QA-'+randomUUID().toUpperCase(),label:'Facture HTTP FICTIF',category:null,unit_amount_minor:12550,archived:false})).service_id;
  quote=(await post('patients/'+patient+'/quotes',{lines:[{service_id:service,price_version:1,quantity:2}]})).quote_id;
  const body={quote_id:quote,quote_version:1},prepareKey=randomUUID();
  await post(root,body,prepareKey,503);
  await db.query('insert into private.local_invoice_settings(clinic_id,drafts_enabled,issuance_enabled,series_code) values($1,true,false,$2)',[clinic,series]);installed=true;
  const draft=await post(root,body,prepareKey);invoice=draft.invoice_id;assert.equal(draft.total_minor,25100);assert.equal(draft.state,'draft');assert.equal(draft.number,undefined);
  const draftRead=(await read()).items[0];assert.equal(draftRead.state,'draft');assert.equal(draftRead.number,null);assert.equal(draftRead.snapshot.quote.details.lines[0].unit_amount_minor,12550);
  assert.deepEqual(await post(root,body,prepareKey),{...draft,replayed:true});
  const issueKey=randomUUID(),issuePath=root+'/'+invoice+'/issue';
  await post(issuePath,{},issueKey,503);
  await db.query('update private.local_invoice_settings set issuance_enabled=true where clinic_id=$1 and series_code=$2',[clinic,series]);
  const receipt=await post(issuePath,{},issueKey);assert.equal(receipt.number,series+'-1');assert.equal(receipt.total_minor,25100);assert.equal(receipt.state,'issued');
  assert.deepEqual(await post(issuePath,{},issueKey),{...receipt,replayed:true});
  await post(issuePath,{},randomUUID(),409);
  await post('patients/'+otherPatient+'/invoices/'+invoice+'/issue',{},randomUUID(),404);

  if(process.argv.includes('--session-renew-browser')){
    const before=(await db.query('select count(*)::int n from private.finance_quotes where clinic_id=$1 and patient_id=$2',[clinic,patient])).rows[0].n;
    const env={...process.env,LOCAL_INVOICE_EMAIL:email,LOCAL_INVOICE_PASSWORD:password,LOCAL_INVOICE_API:base};
    await new Promise((resolve,reject)=>{const args=['exec','playwright','test','tests/e2e/session-renewal-local.spec.ts','--workers=1','--output=.local/qa/session-renewal-results'];const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','pnpm '+args.join(' ')],{env,stdio:'inherit',windowsHide:true}):spawn('pnpm',args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Native renewal browser failed')));});
    assert.equal((await db.query('select count(*)::int n from private.finance_quotes where clinic_id=$1 and patient_id=$2',[clinic,patient])).rows[0].n,before+1);
    console.log('PASS native session renewal preserves pending form and one exact quote command in PostgreSQL.');
  }
  if(process.argv.includes('--installments')){
    const path='patients/'+patient+'/installments';
    assert.equal((await read(path)).can_write,false);
    await read(path,401,{Authorization:''});await read(path,403,{'X-Clinic-Id':'10000000-0000-4000-8000-000000000001'});
    const agreement={plan_id:null,expected_version:0,reason:'Accord HTTP fictif',invoices:[{invoice_id:invoice,deposit_minor:0,credited_minor:0}],lines:[{invoice_id:invoice,due_on:'2026-11-15',amount_minor:10000},{invoice_id:invoice,due_on:'2026-12-15',amount_minor:15100}]},k=randomUUID();
    await post(path,agreement,k,503);await db.query('insert into private.local_installment_settings(clinic_id,enabled) values($1,true)',[clinic]);
    await post(path,{...agreement,clinic_id:clinic},randomUUID(),400);
    const saved=await post(path,agreement,k);assert.equal(saved.agreed_minor,25100);assert.equal(saved.status,'draft');
    assert.deepEqual(await post(path,agreement,k),{...saved,replayed:true});
    const detailPath=path+'/'+saved.plan_id+'/versions/1',transitionPath=path+'/'+saved.plan_id+'/transitions';
    const original=await read(detailPath);assert.equal(original.lines.length,2);assert.deepEqual(original.events,[]);assert.equal((await read(path)).items[0].status,'draft');
    await read('patients/'+otherPatient+'/installments/'+saved.plan_id+'/versions/1',404);await read(detailPath+'?extra=1',400);
    await post(transitionPath,{version:1,action:'accepted',reference:'DEMO-ACK'},randomUUID(),409);
    await post(transitionPath,{version:1,action:'approved',reference:'DEMO-APPROVE'});assert.equal((await read(path)).items[0].status,'approved');
    const accepted=await post(transitionPath,{version:1,action:'accepted',reference:'DEMO-ACK'});assert.equal(accepted.status,'accepted');assert.equal((await read(path)).items[0].accepted_version,1);
    const revision={...agreement,plan_id:saved.plan_id,expected_version:1,reason:'Dates révisées',lines:agreement.lines.map(i=>({...i,due_on:'2027'+i.due_on.slice(4)}))};await post(path,revision);await post(path,revision,randomUUID(),409);
    const history=await read(detailPath);assert.deepEqual(history.lines,original.lines);assert.equal(history.events.length,2);assert.equal(history.accepted_version,1);assert.equal(history.latest_version,2);
    const latest=await read(path);assert.equal(latest.items[0].status,'draft');assert.equal(latest.items[0].accepted_version,1);
    await db.query('update private.local_installment_settings set enabled=false where clinic_id=$1',[clinic]);assert.equal((await read(path)).can_write,false);await read(detailPath);await post(path,agreement,k,503);
    if(process.argv.includes('--installment-browser')){
      assert.ok(process.argv.includes('--payments'),'Installment browser requires --payments');
      await db.query('update private.local_installment_settings set enabled=true where clinic_id=$1',[clinic]);
      await db.query('insert into private.local_payment_settings(clinic_id,enabled) values($1,true)',[clinic]);
      const q2=await post('patients/'+patient+'/quotes',{lines:[{service_id:service,price_version:1,quantity:1}]});
      const i2=await post(root,{quote_id:q2.quote_id,quote_version:1});const issued2=await post(root+'/'+i2.invoice_id+'/issue',{});
      const env={...process.env,LOCAL_INVOICE_EMAIL:email,LOCAL_INVOICE_PASSWORD:password,LOCAL_INVOICE_API:base,LOCAL_INSTALLMENT_NUMBER:issued2.number};
      await new Promise((resolve,reject)=>{const args=['exec','playwright','test','tests/e2e/patient-installments-local.spec.ts','--workers=1','--output=.local/qa/installment-test-results'];const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','pnpm '+args.join(' ')],{env,stdio:'inherit',windowsHide:true}):spawn('pnpm',args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Native installment browser failed')));});
      const plans=(await read(path)).items;assert.equal(plans.length,2);const createdPlan=plans.find(p=>p.plan_id!==saved.plan_id);assert.equal(createdPlan.latest_version,2);assert.equal(createdPlan.accepted_version,1);assert.equal(createdPlan.status,'draft');
      const acceptedVersion=await read(path+'/'+createdPlan.plan_id+'/versions/1');assert.equal(acceptedVersion.events.length,2);assert.equal(acceptedVersion.lines.length,2);assert.equal(acceptedVersion.agreed_minor,12550);
      await db.query('delete from private.local_payment_settings where clinic_id=$1',[clinic]);
    }
    console.log('PASS native installment HTTP/Auth/PostgreSQL draft, immutable versions, approval/acceptance, retry and isolation.');
  }
  if(process.argv.includes('--payments')){
    const configPath='payment-configuration',accountBody={account_id:null,expected_version:0,label:'Banque QA FICTIF',kind:'bank',active:true},accountKey=randomUUID();
    assert.equal((await read(configPath)).accounts.length,0);
    await read(configPath,401,{Authorization:''});await read(configPath,403,{'X-Clinic-Id':'10000000-0000-4000-8000-000000000001'});
    await post(configPath+'/accounts',{...accountBody,iban:'NOT-ALLOWED'},randomUUID(),400);
    const account=await post(configPath+'/accounts',accountBody,accountKey);assert.equal(account.version,1);assert.deepEqual(await post(configPath+'/accounts',accountBody,accountKey),{...account,replayed:true});
    const receiving=account.account_id;
    await db.query('insert into private.local_payment_settings(clinic_id,enabled) values($1,true)',[clinic]);
    const methodBody={method_id:null,expected_version:0,code:'TRANSFER',label:'Virement QA',kind:'bank_transfer',active:true,reference_required:true,settlement_behavior:'separate_verification',receiving_account_id:receiving},methodKey=randomUUID();
    const method=await post(configPath+'/methods',methodBody,methodKey);assert.deepEqual(await post(configPath+'/methods',methodBody,methodKey),{...method,replayed:true});
    const revised=await post(configPath+'/accounts',{...accountBody,account_id:receiving,expected_version:1,label:'Banque QA renommée'});assert.equal(revised.version,2);
    await post(configPath+'/accounts',{...accountBody,account_id:receiving,expected_version:1},randomUUID(),409);
    const configuration=await read(configPath);assert.equal(configuration.accounts[0].label,'Banque QA renommée');assert.equal(configuration.methods[0].receiving_account.label,'Banque QA FICTIF');assert.equal(configuration.methods[0].destination_active,true);
    const paymentPath='patients/'+patient+'/payments',paymentBody={method_id:method.method_id,method_version:1,amount_minor:15000,currency_code:'MAD',effective_at:new Date().toISOString(),reference:'DEMO-TRANSFER-QA'},paymentKey=randomUUID();
    await post(paymentPath,paymentBody,randomUUID(),401,{Authorization:''});await post(paymentPath,paymentBody,randomUUID(),403,{'X-Clinic-Id':'10000000-0000-4000-8000-000000000001'});
    const recorded=await post(paymentPath,paymentBody,paymentKey);assert.equal(recorded.state,'pending');assert.equal(recorded.amount_minor,15000);assert.deepEqual(await post(paymentPath,paymentBody,paymentKey),{...recorded,replayed:true});
    const pendingRead=await read(paymentPath);assert.equal(pendingRead.payments[0].available_minor,0);assert.equal(pendingRead.payments[0].unallocated_minor,15000);assert.equal(pendingRead.methods[0].id,method.method_id);
    await read(paymentPath,401,{Authorization:''});await read(paymentPath,403,{'X-Clinic-Id':'10000000-0000-4000-8000-000000000001'});
    assert.deepEqual((await read('patients/'+otherPatient+'/payments')).payments,[]);
    const target=paymentPath+'/'+recorded.payment_id,confirmedKey=randomUUID(),confirmation={expected_version:1,action:'confirm',verified:true};
    const confirmed=await post(target+'/transitions',confirmation,confirmedKey);assert.equal(confirmed.state,'confirmed');assert.equal(confirmed.settlement,'pending');assert.deepEqual(await post(target+'/transitions',confirmation,confirmedKey),{...confirmed,replayed:true});
    await post(target+'/allocations',{invoice_id:invoice,amount_minor:10000},randomUUID(),409);
    const receiptKey=randomUUID(),receipt=await post(target+'/receipts',{},receiptKey);assert.equal(receipt.number,'DEMO-R-1');assert.deepEqual(await post(target+'/receipts',{},receiptKey),{...receipt,replayed:true});
    const historical=await read(target+'/receipt');assert.equal(historical.snapshot.settlement,'pending');assert.equal(historical.snapshot.allocated_minor,0);
    await read('patients/'+otherPatient+'/payments/'+recorded.payment_id+'/receipt',404);
    const settled=await post(target+'/transitions',{expected_version:2,action:'settle',verified:true});assert.equal(settled.settlement,'settled');
    const allocationKey=randomUUID(),allocationBody={invoice_id:invoice,amount_minor:10000},allocated=await post(target+'/allocations',allocationBody,allocationKey);assert.equal(allocated.payment_unapplied_minor,5000);assert.equal(allocated.invoice_remaining_minor,15100);assert.deepEqual(await post(target+'/allocations',allocationBody,allocationKey),{...allocated,replayed:true});
    const current=await read(paymentPath);assert.equal(current.payments[0].available_minor,5000);assert.equal(current.payments[0].allocated_minor,10000);assert.equal(current.payments[0].settlement,'settled');assert.equal(current.invoices.find(i=>i.invoice_id===invoice).remaining_minor,15100);assert.deepEqual(await read(target+'/receipt'),historical);
    await post(target+'/allocations',{invoice_id:invoice,amount_minor:5001},randomUUID(),409);
    await post('patients/'+otherPatient+'/payments/'+recorded.payment_id+'/receipts',{},randomUUID(),404);
    if(process.argv.includes('--payment-browser')){
      if(process.argv.includes('--refund-browser'))await db.query('insert into private.local_finance_correction_permissions(clinic_id,actor_ref,refund_allowed) values($1,$2,true)',[clinic,user]);
      const env={...process.env,LOCAL_INVOICE_EMAIL:email,LOCAL_INVOICE_PASSWORD:password,LOCAL_INVOICE_API:base,LOCAL_PAYMENT_METHOD:method.method_id,LOCAL_PAYMENT_INVOICE:invoice,LOCAL_REFUND_BROWSER:process.argv.includes('--refund-browser')?'true':'false'};
      await new Promise((resolve,reject)=>{const args=['exec','playwright','test','tests/e2e/patient-payments-local.spec.ts','--workers=1','--output=.local/qa/payment-test-results'];const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','pnpm '+args.join(' ')],{env,stdio:'inherit',windowsHide:true}):spawn('pnpm',args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Native payment browser failed')));});
    }
    const snapshot=(await db.query('select snapshot from private.finance_payment_receipts where clinic_id=$1 and payment_id=$2',[clinic,recorded.payment_id])).rows[0].snapshot;assert.equal(snapshot.settlement,'pending');assert.equal(snapshot.allocated_minor,0);assert.equal(snapshot.unapplied_minor,15000);
    assert.equal((await db.query('select count(*)::int n from private.finance_payment_allocations where clinic_id=$1 and payment_id=$2',[clinic,recorded.payment_id])).rows[0].n,1);
    if(process.argv.includes('--installment-allocations')){
      const path='patients/'+patient+'/installments';
      await db.query('insert into private.local_installment_settings(clinic_id,enabled) values($1,true)',[clinic]);
      const plan=await post(path,{plan_id:null,expected_version:0,reason:'Allocation QA fictive',invoices:[{invoice_id:invoice,deposit_minor:10000,credited_minor:0}],lines:[{invoice_id:invoice,due_on:'2020-01-01',amount_minor:5000},{invoice_id:invoice,due_on:'2030-01-01',amount_minor:10100}]});
      const detail=await read(path+'/'+plan.plan_id+'/versions/1'),line=detail.lines.find(l=>l.amount_minor===5000);
      const balancePath=path+'/'+plan.plan_id+'/versions/1/balances',allocatePath=path+'/'+plan.plan_id+'/allocations';
      assert.equal((await read(balancePath)).active,false);
      if(process.argv.includes('--reminder-queue'))assert.equal((await read('installment-reminders')).items.length,0);
      const body={version:1,line_id:line.line_id,payment_id:recorded.payment_id,amount_minor:3000},key=randomUUID();
      await post(allocatePath,body,key,409);
      for(const action of ['approved','accepted'])await post(path+'/'+plan.plan_id+'/transitions',{version:1,action,reference:'DEMO-QA'});
      assert.equal((await read(balancePath)).lines.find(l=>l.line_id===line.line_id).overdue,true);
      await post(allocatePath,{...body,amount_minor:0},randomUUID(),400);await post(allocatePath,{...body,clinic_id:clinic},randomUUID(),400);
      await read(balancePath+'?clinic_id='+clinic,400);await read(balancePath,401,{Authorization:''});
      await read(balancePath,403,{'X-Clinic-Id':'10000000-0000-4000-8000-000000000002'});
      await read('patients/'+otherPatient+'/installments/'+plan.plan_id+'/versions/1/balances',404);
      process.env.ENABLE_LOCAL_PAYMENTS='false';await post(allocatePath,body,key,503);process.env.ENABLE_LOCAL_PAYMENTS='true';
      const receipt=await post(allocatePath,body,key);assert.equal(receipt.line_paid_minor,3000);assert.equal(receipt.line_remaining_minor,2000);
      assert.deepEqual(await post(allocatePath,body,key),{...receipt,replayed:true});await post(allocatePath,{...body,amount_minor:2000},key,409);
      if(process.argv.includes('--reminder-queue')){const queue=await read('installment-reminders');assert.equal(queue.items.length,1);assert.equal(queue.items[0].remaining_minor,2000);assert.equal(queue.items[0].overdue,true);await read('installment-reminders?after_due=2020-01-01',400);await read('installment-reminders?clinic_id='+clinic,400);await read('installment-reminders',401,{Authorization:''});await read('installment-reminders',403,{'X-Clinic-Id':'10000000-0000-4000-8000-000000000002'});}
      const partial=await read(balancePath);assert.equal(partial.requires_revision,false);assert.equal(partial.lines.find(l=>l.line_id===line.line_id).payment_state,'partial');
      await post(allocatePath,{...body,amount_minor:2001},randomUUID(),409);
      if(process.argv.includes('--installment-allocation-browser')){
        const env={...process.env,LOCAL_INVOICE_EMAIL:email,LOCAL_INVOICE_PASSWORD:password,LOCAL_INVOICE_API:base};
        await new Promise((resolve,reject)=>{const args=['exec','playwright','test','tests/e2e/installment-allocation-local.spec.ts','--workers=1'];const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','pnpm '+args.join(' ')],{env,stdio:'inherit',windowsHide:true}):spawn('pnpm',args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Installment allocation browser failed')));});
      }else await post(allocatePath,{...body,amount_minor:2000});
      const paid=await read(balancePath),paidLine=paid.lines.find(l=>l.line_id===line.line_id);assert.equal(paidLine.payment_state,'paid');assert.equal(paidLine.overdue,false);assert.equal(paid.invoices[0].invoice_remaining_minor,10100);
      assert.equal((await db.query('select count(*)::int n from private.finance_installment_allocations where clinic_id=$1',[clinic])).rows[0].n,2);
      if(process.argv.includes('--reminder-queue')){
        assert.equal((await read('installment-reminders')).items.length,0);
        const lines=Array.from({length:11},(_,i)=>({invoice_id:invoice,due_on:'2020-01-'+String(i+2).padStart(2,'0'),amount_minor:i===10?1100:900}));
        await post(path,{plan_id:plan.plan_id,expected_version:1,reason:'Pagination QA',invoices:[{invoice_id:invoice,deposit_minor:15000,credited_minor:0}],lines});
        for(const action of ['approved','accepted'])await post(path+'/'+plan.plan_id+'/transitions',{version:2,action,reference:'DEMO-QUEUE'});
        const first=await read('installment-reminders');assert.equal(first.items.length,10);assert.ok(first.next_cursor);assert.equal(first.items.every(i=>i.version===2),true);
        const second=await read('installment-reminders?'+new URLSearchParams({after_due:first.next_cursor.due_on,after_id:first.next_cursor.line_id}));assert.equal(second.items.length,1);assert.equal(second.next_cursor,null);assert.equal(new Set([...first.items,...second.items].map(i=>i.line_id)).size,11);
        const otherQuote=await post('patients/'+otherPatient+'/quotes',{lines:[{service_id:service,price_version:1,quantity:1}]}),otherDraft=await post('patients/'+otherPatient+'/invoices',{quote_id:otherQuote.quote_id,quote_version:1}),otherInvoice=otherDraft.invoice_id;
        await post('patients/'+otherPatient+'/invoices/'+otherInvoice+'/issue',{});
        const obstruction=await post('patients/'+otherPatient+'/installments',{plan_id:null,expected_version:0,reason:'Search pagination QA',invoices:[{invoice_id:otherInvoice,deposit_minor:0,credited_minor:0}],lines:Array.from({length:11},(_,i)=>({invoice_id:otherInvoice,due_on:'2000-01-'+String(i+2).padStart(2,'0'),amount_minor:i===10?1550:1100}))});
        for(const action of ['approved','accepted'])await post('patients/'+otherPatient+'/installments/'+obstruction.plan_id+'/transitions',{version:1,action,reference:'DEMO-OBSTRUCTION'});
        const searchFirst=await read('installment-reminders?'+new URLSearchParams({q:'  Salma  '}));assert.equal(searchFirst.items.length,10);assert.ok(searchFirst.items.every(i=>i.patient_id===patient));assert.ok(searchFirst.next_cursor);
        const searchSecond=await read('installment-reminders?'+new URLSearchParams({q:'Salma',after_due:searchFirst.next_cursor.due_on,after_id:searchFirst.next_cursor.line_id}));assert.equal(searchSecond.items.length,1);assert.equal(searchSecond.items[0].patient_id,patient);assert.equal(searchSecond.next_cursor,null);assert.equal(new Set([...searchFirst.items,...searchSecond.items].map(i=>i.line_id)).size,11);
        const byReference=await read('installment-reminders?'+new URLSearchParams({q:'qa-1'}));assert.equal(byReference.items.length,10);assert.ok(byReference.items.every(i=>i.patient_id===patient));
        for(const literal of ['%','_','%_'])assert.equal((await read('installment-reminders?'+new URLSearchParams({q:literal}))).items.length,0);
        await read('installment-reminders?'+new URLSearchParams({q:'x'.repeat(101)}),400);
        if(process.argv.includes('--reminder-browser')){
          const env={...process.env,LOCAL_REMINDER_EMAIL:email,LOCAL_REMINDER_PASSWORD:password,LOCAL_REMINDER_API:base,LOCAL_REMINDER_PATIENT_ID:patient,LOCAL_REMINDER_PLAN_ID:plan.plan_id,LOCAL_REMINDER_VERSION:'2'};
          await new Promise((resolve,reject)=>{
            const args=['exec','playwright','test','--config=tests/e2e/installment-reminders.config.ts'];
            const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','pnpm '+args.join(' ')],{env,stdio:'inherit',windowsHide:true}):spawn('pnpm',args,{env,stdio:'inherit'});
            child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Native installment reminder browser failed')));
          });
        }
        await db.query("update public.clinic_memberships set role='assistant' where clinic_id=$1 and user_id=$2",[clinic,user]);await read('installment-reminders',403);await db.query("update public.clinic_memberships set role='manager' where clinic_id=$1 and user_id=$2",[clinic,user]);
        await db.query('update public.clinic_memberships set active=false where clinic_id=$1 and user_id=$2',[clinic,user]);await read('installment-reminders',403);await db.query('update public.clinic_memberships set active=true where clinic_id=$1 and user_id=$2',[clinic,user]);
        console.log('Native reminder queue passed: draft/future exclusion, net partial balance, paid removal, accepted revision only, exact 10+1 pagination, full-queue name/reference search before cursor, literal %/_ handling, query bounds, manager/tenant/session/revocation denial. No messages sent.');
      }
      await db.query('update public.clinic_memberships set active=false where clinic_id=$1 and user_id=$2',[clinic,user]);await read(balancePath,403);await post(allocatePath,body,key,403);await db.query('update public.clinic_memberships set active=true where clinic_id=$1 and user_id=$2',[clinic,user]);
      console.log('Native installment allocations HTTP passed: draft denial, accepted/overdue, partial/paid, exact replay, limits, strict input, process gate, tenant/patient/session and revoked membership denial; two SQL links only.');
    }
    if(process.argv.includes('--refunds')){
      const context=await read(target+'/refunds');assert.equal(context.can_refund,false);assert.equal(context.net_paid_minor,15000);assert.equal(context.allocations[0].remaining_minor,10000);
      const refundBody={kind:'refund',amount_minor:5000,reason:'Remboursement QA fictif vérifié',reference:'DEMO-REFUND-QA',effective_at:new Date().toISOString(),verified:true,releases:[{allocation_id:allocated.allocation_id,amount_minor:5000}]},refundKey=randomUUID();
      await post(target+'/refunds',refundBody,randomUUID(),403);
      await db.query('insert into private.local_finance_correction_permissions(clinic_id,actor_ref,refund_allowed) values($1,$2,true) on conflict(clinic_id,actor_ref) do update set refund_allowed=true',[clinic,user]);
      assert.equal((await read(target+'/refunds')).can_refund,true);
      await read('patients/'+otherPatient+'/payments/'+recorded.payment_id+'/refunds',404);await read(target+'/refunds',401,{Authorization:''});
      await post(target+'/refunds',{...refundBody,verified:false},randomUUID(),400);await post(target+'/refunds',{...refundBody,bank_account:'FORBIDDEN'},randomUUID(),400);
      const refund=await post(target+'/refunds',refundBody,refundKey);assert.equal(refund.net_paid_minor,10000);assert.equal(refund.released_minor,5000);assert.deepEqual(await post(target+'/refunds',refundBody,refundKey),{...refund,replayed:true});
      const after=await read(target+'/refunds');assert.equal(after.refunded_minor,5000);assert.equal(after.allocated_minor,5000);assert.equal(after.unallocated_minor,5000);assert.equal(after.refunds.length,1);assert.equal(after.allocations[0].released_minor,5000);assert.equal(after.refunds[0].reason,refundBody.reason);
      const updated=await read(paymentPath);assert.equal(updated.payments.find(p=>p.payment_id===recorded.payment_id).refunded_minor,5000);assert.equal(updated.invoices.find(i=>i.invoice_id===invoice).remaining_minor,20100);assert.deepEqual(await read(target+'/receipt'),historical);
      await db.query('update private.local_finance_correction_permissions set refund_allowed=false where clinic_id=$1',[clinic]);await post(target+'/refunds',refundBody,refundKey,403);assert.equal((await read(target+'/refunds')).can_refund,false);
      console.log('Native refund HTTP passed: dedicated privilege, net balances, explicit releases, immutable receipt, exact retry and revoked permission.');
    }
    if(process.argv.includes('--credit-browser')){
      await db.query('insert into private.local_finance_correction_permissions(clinic_id,actor_ref,credit_allowed) values($1,$2,true) on conflict(clinic_id,actor_ref) do update set credit_allowed=true',[clinic,user]);
      const env={...process.env,LOCAL_INVOICE_EMAIL:email,LOCAL_INVOICE_PASSWORD:password,LOCAL_INVOICE_API:base,LOCAL_CREDIT_INVOICE_NUMBER:series+'-1'};
      await new Promise((resolve,reject)=>{const args=['exec','playwright','test','tests/e2e/patient-credits-local.spec.ts','--workers=1','--output=.local/qa/credit-test-results'];const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','pnpm '+args.join(' ')],{env,stdio:'inherit',windowsHide:true}):spawn('pnpm',args,{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Native credit browser failed')));});
    }
    if(process.argv.includes('--credits')){
      const creditPath=root+'/'+invoice+'/credits',creditBody={amount_minor:5000,reason:'Avoir HTTP fictif'},creditKey=randomUUID(),before=await read(creditPath);assert.equal(before.can_credit,false);
      await post(creditPath,creditBody,randomUUID(),403);
      await db.query('insert into private.local_finance_correction_permissions(clinic_id,actor_ref,credit_allowed) values($1,$2,true) on conflict(clinic_id,actor_ref) do update set credit_allowed=true',[clinic,user]);
      await read('patients/'+otherPatient+'/invoices/'+invoice+'/credits',404);await read(creditPath,401,{Authorization:''});await post(creditPath,{...creditBody,approved_by:user},randomUUID(),400);
      const credited=await post(creditPath,creditBody,creditKey);assert.equal(credited.number,'DEMO-C-1');assert.equal(credited.invoice_remaining_minor,Math.max(0,before.remaining_minor-5000));assert.deepEqual(await post(creditPath,creditBody,creditKey),{...credited,replayed:true});
      const creditRead=await read(creditPath);assert.equal(creditRead.credited_minor,5000);assert.equal(creditRead.credits.length,1);assert.equal(creditRead.creditable_minor,20100);
      const document=await read(creditPath+'/'+credited.credit_id);assert.equal(document.amount_minor,5000);assert.equal(document.snapshot.invoice_total_minor,25100);assert.equal(document.snapshot.invoice_id,invoice);assert.deepEqual(document.snapshot.invoice_snapshot,draftRead.snapshot);
      await read('patients/'+otherPatient+'/invoices/'+invoice+'/credits/'+credited.credit_id,404);await post(creditPath,{...creditBody,amount_minor:20101},randomUUID(),409);
      await db.query('update private.local_finance_correction_permissions set credit_allowed=false where clinic_id=$1',[clinic]);await post(creditPath,creditBody,creditKey,403);assert.equal((await read(creditPath)).can_credit,false);assert.deepEqual(await read(creditPath+'/'+credited.credit_id),document);
      console.log('Native credit HTTP passed: dedicated privilege, numbering, exact retry, net balance, immutable invoice snapshot and revoked capability.');
    }
    await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await db.query('set local role authenticated');
    for(let n=0;n<51;n++)await db.query('select public.record_local_payment($1,$2,$3::jsonb,$4,$5)',[clinic,patient,JSON.stringify({...paymentBody,amount_minor:1}),randomUUID(),gate]);
    await db.query('commit');await db.query('update private.local_payment_settings set enabled=false where clinic_id=$1',[clinic]);
    const limited=await read(paymentPath);assert.equal(limited.payments.length,50);assert.equal(limited.payments_truncated,true);assert.equal(limited.payments.every(item=>item.available_minor===0),true);assert.deepEqual(await read(target+'/receipt'),historical);
    console.log('Native payment HTTP passed: record, confirmation, settlement, allocation, numbered receipt, exact retries and authoritative SQL snapshot.');
  }
  await post('patients/'+patient+'/quotes/'+quote+'/revisions',{expected_version:1,lines:[{service_id:service,price_version:1,quantity:3}]});
  if(process.argv.includes('--browser')){
    const env={...process.env,LOCAL_INVOICE_EMAIL:email,LOCAL_INVOICE_PASSWORD:password,LOCAL_INVOICE_API:base,LOCAL_INVOICE_QUOTE:quote,LOCAL_INVOICE_NUMBER:series+'-2'};
    await new Promise((resolve,reject)=>{
      const args=['exec','playwright','test','tests/e2e/patient-invoices-local.spec.ts','--workers=1','--output=.local/qa/invoice-test-results'];
      const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','pnpm '+args.join(' ')],{env,stdio:'inherit',windowsHide:true}):spawn('pnpm',args,{env,stdio:'inherit'});
      child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Native invoice browser failed')));
    });
    assert.equal((await db.query('select count(*)::int n from private.finance_issued_invoices where clinic_id=$1 and series_code=$2',[clinic,series])).rows[0].n,2);
  }
  await db.query('update private.local_invoice_settings set drafts_enabled=false,issuance_enabled=false where clinic_id=$1 and series_code=$2',[clinic,series]);
  const invoiceRead=(await read()).items.find(item=>item.invoice_id===invoice);assert.equal(invoiceRead.state,'issued');assert.equal(invoiceRead.number,receipt.number);assert.deepEqual(invoiceRead.snapshot,draftRead.snapshot);assert.equal(invoiceRead.total_minor,25100);
  assert.deepEqual(Object.keys(invoiceRead).sort(),['created_at','currency_code','invoice_id','issued_at','number','patient_id','quote_id','quote_version','snapshot','state','total_minor'].sort());
  const otherPatientInvoices=(await read('patients/'+otherPatient+'/invoices')).items;
  if(process.argv.includes('--reminder-queue'))assert.equal(otherPatientInvoices.length,1);
  else assert.deepEqual(otherPatientInvoices,[]);
  await db.query("update public.clinic_memberships set active=false where clinic_id=$1 and user_id=$2",[clinic,user]);
  await post(issuePath,{},issueKey,403);
  await read(root,403);
  const row=(await db.query('select d.total_minor::int total,i.number from private.finance_invoice_drafts d join private.finance_issued_invoices i on i.clinic_id=d.clinic_id and i.invoice_id=d.id where d.clinic_id=$1 and d.id=$2',[clinic,invoice])).rows[0];assert.deepEqual(row,{total:25100,number:series+'-1'});
  assert.equal((await db.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and aggregate_id=$2 and event_type='LocalInvoiceIssued'",[clinic,invoice])).rows[0].n,1);
  console.log('Native invoice Auth/API/PostgreSQL passed: prepare, issue, replay, immutable read after quote revision and issuance disabled, tenant/patient/role denial and one issued event.');
}finally{
  await app?.close();
  if(user){
    await db.query('rollback');await db.query('begin');await db.query("set local session_replication_role='replica'");
    if(process.argv.includes('--payments')){
      for(const table of ['finance_credit_commands','finance_invoice_credits','finance_credit_counters','finance_allocation_releases','finance_payment_refunds','local_finance_correction_permissions','finance_receiving_account_commands','finance_payment_receipts','finance_payment_receipt_counters','finance_payment_allocations','finance_payment_commands','finance_payment_events','finance_payments','local_payment_settings','finance_payment_method_commands','finance_payment_method_versions','finance_payment_methods','finance_receiving_accounts'])await db.query('delete from private.'+table+' where clinic_id=$1',[clinic]);
      for(const table of ['audit_events','outbox_events'])await db.query('delete from private.'+table+' where clinic_id=$1',[clinic]);
    }
    for(const table of ['finance_installment_allocations','finance_installment_commands','finance_installment_events','finance_installment_lines','finance_installment_versions','finance_installment_invoices','finance_installment_plans','local_installment_settings'])await db.query('delete from private.'+table+' where clinic_id=$1',[clinic]);
    for(const table of ['audit_events','outbox_events'])await db.query('delete from private.'+table+' where clinic_id=$1',[clinic]);
    // Discover only records owned by this newly-created test account, including a failed response.
    const invoices=(await db.query('select id from private.finance_invoice_drafts where clinic_id=$1 and created_by=$2',[clinic,user])).rows.map(r=>r.id);
    const quotes=(await db.query("select distinct receipt->>'quote_id' id from private.finance_draft_commands where clinic_id=$1 and actor_ref=$2",[clinic,user])).rows.map(r=>r.id);
    const services=(await db.query("select distinct receipt->>'service_id' id from private.finance_catalog_commands where clinic_id=$1 and actor_ref=$2",[clinic,user])).rows.map(r=>r.id);
    for(const table of ['audit_events','outbox_events'])await db.query('delete from private.'+table+' where clinic_id=$1 and actor_ref=$2 and aggregate_id=any($3::uuid[])',[clinic,user,[...invoices,...quotes,...services]]);
    for(const table of ['finance_invoice_commands','finance_draft_commands','finance_catalog_commands'])await db.query('delete from private.'+table+' where clinic_id=$1 and actor_ref=$2',[clinic,user]);
    await db.query('delete from private.finance_issued_invoices where clinic_id=$1 and invoice_id=any($2::uuid[])',[clinic,invoices]);
    await db.query('delete from private.finance_invoice_drafts where clinic_id=$1 and id=any($2::uuid[])',[clinic,invoices]);
    for(const table of ['finance_quote_lines','finance_quote_versions'])await db.query('delete from private.'+table+' where clinic_id=$1 and quote_id=any($2::uuid[])',[clinic,quotes]);
    await db.query('delete from private.finance_quotes where clinic_id=$1 and id=any($2::uuid[])',[clinic,quotes]);
    await db.query('delete from private.finance_catalog_price_versions where clinic_id=$1 and service_id=any($2::uuid[])',[clinic,services]);
    await db.query('delete from private.finance_catalog_services where clinic_id=$1 and id=any($2::uuid[])',[clinic,services]);
    if(installed){await db.query('delete from private.finance_invoice_counters where clinic_id=$1 and series_code=$2',[clinic,series]);await db.query('delete from private.local_invoice_settings where clinic_id=$1 and series_code=$2',[clinic,series]);}
    await db.query('delete from public.clinic_memberships where clinic_id=$1 and user_id=$2',[clinic,user]);await db.query('delete from private.finance_draft_gates where clinic_id=$1',[clinic]);await db.query('delete from public.patients where clinic_id=$1',[clinic]);await db.query('delete from public.clinics where id=$1',[clinic]);await db.query('commit');
    const removed=await fetch(status.API_URL+'/auth/v1/admin/users/'+user,{method:'DELETE',headers:adminHeaders});assert.equal(removed.ok,true,'Temporary Auth cleanup failed');
    console.log('Temporary invoice account, records and issuance settings removed.');
  }
  await db.end();
}
