import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { seedPatientRecords } from './seed-local-patient-records.mjs';
const atlas='10000000-0000-4000-8000-000000000001',sale='10000000-0000-4000-8000-000000000002';
const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000};
const status=JSON.parse(process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],options):execFileSync('pnpm',['exec','supabase','status','-o','json'],options));
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const api='http://127.0.0.1:4300';
const email=`patient-hub-${randomUUID()}@dentalspa.test`,password=`Local!${randomBytes(24).toString('base64url')}9`;
const createQuote=process.argv.includes('--create-quote'),quoteKey=randomUUID(),raceKey=randomUUID(),revisionKey=randomUUID(),raceRevisionKeys=[randomUUID(),randomUUID()];
const headers={apikey:status.SERVICE_ROLE_KEY,authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'content-type':'application/json'};
const client=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
let userId;
try {
  await client.connect();
  const counts=async()=>JSON.stringify((await client.query("select (select count(*) from private.audit_events)::int audits,(select count(*) from private.finance_quotes)::int quotes,(select count(*) from private.demo_confirmed_appointments where patient_id is not null)::int linked")).rows[0]);
  const before=await counts();await seedPatientRecords(client);assert.equal(await counts(),before,'Rerunning seed must not duplicate or overwrite records/events');
  const created=await fetch(`${status.API_URL}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(created.ok,true);userId=(await created.json()).id;
  await client.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,$3,true)",[atlas,userId,createQuote?'manager':'reception']);
  const signed=await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:status.ANON_KEY,'content-type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(signed.ok,true);const token=(await signed.json()).access_token;
  const read=(patient,clinic=atlas)=>fetch(`${api}/api/v1/patients/${patient}/hub`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':clinic}});
  const own=await read('20000000-0000-4000-8000-000000000001');assert.equal(own.status,200);
  const body=await own.json();assert.equal(body.profile.email,'salma@example.test');assert.equal(body.appointments.length,1);assert.equal(body.quotes.length,1);assert.equal(body.checklist.length,1);
  assert.equal(body.quotes[0].details.lines.length,1);
  assert.deepEqual(body.quotes[0].details.lines[0],{line_number:1,service_id:'79000000-0000-4000-8000-000000000001',price_version:1,label:'Consultation initiale fictive',quantity:1,unit_amount_minor:30000,subtotal_minor:30000,discount_minor:0,tax_minor:0,total_minor:30000});
  assert.equal(body.quotes[0].details.subtotal_minor,30000);
  assert.equal(body.quotes[0].state,'draft');
  const date=body.appointments[0].starts_at.slice(0,10);
  const calendar=await fetch(`${api}/api/v1/appointments?from=${date}&until=${date}`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':atlas}});
  assert.equal(calendar.status,200);const calendarData=await calendar.json();
  assert.equal(calendarData.items.find(item=>item.id===body.appointments[0].id)?.patient.id,body.patient.id);
  assert.equal((await fetch(`${api}/api/v1/appointments?from=${date}&until=${date}`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':sale}})).status,403);
  assert.equal((await read('20000000-0000-4000-8000-000000000004')).status,404);
  assert.equal((await read('20000000-0000-4000-8000-000000000004',sale)).status,403);
  assert.equal((await fetch(`${api}/api/v1/patients/20000000-0000-4000-8000-000000000001/hub`)).status,401);
  process.env.LOCAL_QUOTE_CREATION_KEY=createQuote?quoteKey:'';
  process.env.LOCAL_QUOTE_REVISION_KEY=createQuote?revisionKey:'';
  const args=['exec','playwright','test','tests/e2e/patient-hub-local.spec.ts'];
  const run=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c',`pnpm ${args.join(' ')}`],{stdio:'inherit',windowsHide:true,env:{...process.env,LOCAL_PATIENT_HUB_EMAIL:email,LOCAL_PATIENT_HUB_PASSWORD:password}}):spawnSync('pnpm',args,{stdio:'inherit',env:{...process.env,LOCAL_PATIENT_HUB_EMAIL:email,LOCAL_PATIENT_HUB_PASSWORD:password}});
  assert.equal(run.status,0,'Native patient hub browser verification failed');
  if(createQuote){
    const rows=(await client.query('select receipt from private.finance_draft_commands where clinic_id=$1 and actor_ref=$2 and request_key=$3',[atlas,userId,quoteKey])).rows;
    assert.equal(rows.length,1);const receipt=rows[0].receipt;assert.equal(receipt.total_minor,60000);
    assert.equal((await client.query('select count(*)::int n from private.finance_quote_lines where clinic_id=$1 and quote_id=$2',[atlas,receipt.quote_id])).rows[0].n,2);
    const versionRows=(await client.query('select version,total_minor::text from private.finance_quote_versions where clinic_id=$1 and quote_id=$2 order by version',[atlas,receipt.quote_id])).rows;
    assert.deepEqual(versionRows,[{version:1,total_minor:'60000'},{version:2,total_minor:'90000'}]);
    assert.equal((await client.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and correlation_id=$2 and event_type='LocalQuoteDraftRevised'",[atlas,revisionKey])).rows[0].n,1);
    assert.equal((await client.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and correlation_id=$2 and event_type='LocalQuoteDraftCreated'",[atlas,quoteKey])).rows[0].n,1);
    console.log('Native draft creation: one quote, exact quantity/price total and one outbox event after lost-response replay.');
    const connections=[0,1].map(()=>new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',statement_timeout:15000}));
    let second;
    try{
      for(const db of connections){await db.connect();await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);await db.query('set local role authenticated');}
      const gate=(await client.query('select api_gate_key from private.finance_draft_gates where clinic_id=$1',[atlas])).rows[0].api_gate_key;
      const payload={lines:[{service_id:'79000000-0000-4000-8000-000000000001',price_version:1,quantity:3}]};
      const args=[atlas,'20000000-0000-4000-8000-000000000001',JSON.stringify(payload),raceKey,gate];
      const sql='select public.create_local_quote_draft($1,$2,$3::jsonb,$4,$5) receipt';
      const first=(await connections[0].query(sql,args)).rows[0].receipt;
      const pid=(await connections[1].query('select pg_backend_pid() pid')).rows[0].pid;
      second=connections[1].query(sql,args);second.catch(()=>undefined);
      let waiting=false;
      for(let n=0;n<50;n++){
        waiting=(await client.query("select wait_event='advisory' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;
        if(waiting)break;await delay(50);
      }
      assert.equal(waiting,true,'Second session must wait on the exact-key transaction lock');
      await connections[0].query('commit');const replay=(await second).rows[0].receipt;await connections[1].query('commit');
      assert.deepEqual(replay,{...first,replayed:true});assert.equal(first.total_minor,90000);
      assert.equal((await client.query('select count(*)::int n from private.finance_draft_commands where clinic_id=$1 and actor_ref=$2 and request_key=$3',[atlas,userId,raceKey])).rows[0].n,1);
      assert.equal((await client.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and correlation_id=$2 and event_type='LocalQuoteDraftCreated'",[atlas,raceKey])).rows[0].n,1);
      console.log('Two native sessions: same-key concurrent creation produced one quote and one event.');
      for(const db of connections){await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);await db.query('set local role authenticated');}
      const revisionSql='select public.revise_local_quote_draft($1,$2,$3,1,$4::jsonb,$5,$6) receipt';
      const revised=(await connections[0].query(revisionSql,[atlas,args[1],first.quote_id,JSON.stringify({lines:[{...payload.lines[0],quantity:4}]}),raceRevisionKeys[0],gate])).rows[0].receipt;
      second=connections[1].query(revisionSql,[atlas,args[1],first.quote_id,JSON.stringify({lines:[{...payload.lines[0],quantity:5}]}),raceRevisionKeys[1],gate]).then(result=>({result}),error=>({error}));
      waiting=false;
      for(let n=0;n<50;n++){waiting=(await client.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;if(waiting)break;await delay(50);}
      assert.equal(waiting,true,'Second editor must wait on the quote row');await connections[0].query('commit');
      const loser=await second;assert.equal(loser.error?.code,'SH409');await connections[1].query('rollback');
      assert.equal(revised.version,2);assert.equal(revised.total_minor,120000);
      assert.equal((await client.query('select count(*)::int n from private.finance_quote_versions where clinic_id=$1 and quote_id=$2',[atlas,first.quote_id])).rows[0].n,2);
      assert.equal((await client.query('select count(*)::int n from private.outbox_events where clinic_id=$1 and correlation_id=$2',[atlas,raceRevisionKeys[1]])).rows[0].n,0);
      console.log('Two native editors: one immutable revision wins; stale competitor rejects without event or overwrite.');
    }finally{
      await connections[0].query('rollback').catch(()=>undefined);
      if(second)await second.catch(()=>undefined);
      await connections[1].query('rollback').catch(()=>undefined);
      await Promise.all(connections.map(db=>db.end()));
    }
  }
  console.log('Native patient hub: seed replay, API isolation and browser reload checks passed.');
} finally {
  if(createQuote&&userId){
    await client.query('begin');await client.query("set local session_replication_role='replica'");
    const keys=[quoteKey,raceKey,revisionKey,...raceRevisionKeys];
    const quotes=(await client.query('select receipt->>\'quote_id\' id from private.finance_draft_commands where clinic_id=$1 and actor_ref=$2 and request_key=any($3::uuid[])',[atlas,userId,keys])).rows.map(row=>row.id);
    await client.query('delete from private.audit_events where clinic_id=$1 and correlation_id=any($2::uuid[])',[atlas,keys]);
    await client.query('delete from private.outbox_events where clinic_id=$1 and correlation_id=any($2::uuid[])',[atlas,keys]);
    await client.query('delete from private.finance_draft_commands where clinic_id=$1 and actor_ref=$2 and request_key=any($3::uuid[])',[atlas,userId,keys]);
    for(const table of ['finance_quote_lines','finance_quote_versions'])await client.query(`delete from private.${table} where clinic_id=$1 and quote_id=any($2::uuid[])`,[atlas,quotes]);
    await client.query('delete from private.finance_quotes where clinic_id=$1 and id=any($2::uuid[])',[atlas,quotes]);await client.query('commit');
  }
  if(userId){await client.query('delete from public.clinic_memberships where user_id=$1',[userId]);await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`,{method:'DELETE',headers});}
  await client.end();
}
