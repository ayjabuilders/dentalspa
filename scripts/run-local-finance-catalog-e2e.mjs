import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
const opts={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000};
const status=JSON.parse(process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],opts):execFileSync('pnpm',['exec','supabase','status','-o','json'],opts));
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const clinic='10000000-0000-4000-8000-000000000001',code='QA-'+randomUUID().toUpperCase(),email='catalog-'+randomUUID()+'@dentalspa.test',password='Local!'+randomBytes(24).toString('base64url')+'9';
const config={host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',statement_timeout:15000};
const db=new pg.Client(config);let user;
const headers={apikey:status.SERVICE_ROLE_KEY,authorization:'Bearer '+status.SERVICE_ROLE_KEY,'content-type':'application/json'};
await db.connect();try{
  const response=await fetch(status.API_URL+'/auth/v1/admin/users',{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true})});assert.equal(response.ok,true);user=(await response.json()).id;
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true)",[clinic,user]);
  const signed=await fetch(status.API_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:status.ANON_KEY,'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(signed.ok,true);const token=(await signed.json()).access_token;
  const api='http://127.0.0.1:4300/api/v1/finance/services';
  assert.equal((await fetch(api)).status,401);
  assert.equal((await fetch(api,{headers:{Authorization:'Bearer '+token,'X-Clinic-Id':'10000000-0000-4000-8000-000000000002'}})).status,403);
  const own=await fetch(api,{headers:{Authorization:'Bearer '+token,'X-Clinic-Id':clinic}});assert.equal(own.status,200);
  const env={...process.env,LOCAL_CATALOG_EMAIL:email,LOCAL_CATALOG_PASSWORD:password,LOCAL_CATALOG_CODE:code};
  const args=['exec','playwright','test','tests/e2e/finance-catalog-local.spec.ts','--workers=1'];
  const run=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','pnpm '+args.join(' ')],{stdio:'inherit',windowsHide:true,env}):spawnSync('pnpm',args,{stdio:'inherit',env});
  assert.equal(run.status,0,'Native catalogue browser failed');
  const service=(await db.query('select id from private.finance_catalog_services where clinic_id=$1 and service_name=$2',[clinic,code])).rows[0]?.id;assert.ok(service);
  assert.deepEqual((await db.query('select version,unit_amount_minor::text amount from private.finance_catalog_price_versions where clinic_id=$1 and service_id=$2 order by version',[clinic,service])).rows,[{version:1,amount:'12550'},{version:2,amount:'15000'},{version:3,amount:'15000'},{version:4,amount:'15000'}]);
  assert.equal((await db.query('select count(*)::int n from private.finance_catalog_commands where clinic_id=$1 and actor_ref=$2',[clinic,user])).rows[0].n,4);
  const a=new pg.Client(config),b=new pg.Client(config);let pending;
  try{
    for(const connection of [a,b]){await connection.connect();await connection.query('begin');await connection.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await connection.query('set local role authenticated');}
    const gate=(await db.query('select api_gate_key from private.finance_draft_gates where clinic_id=$1',[clinic])).rows[0].api_gate_key;
    const body={service_id:service,expected_version:4,code,label:'Prestation QA fictive',category:'TEST',unit_amount_minor:16000,archived:false};
    const sql='select public.save_local_finance_service($1,$2::jsonb,$3,$4) r';
    const first=(await a.query(sql,[clinic,JSON.stringify(body),randomUUID(),gate])).rows[0].r;
    const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    pending=b.query(sql,[clinic,JSON.stringify({...body,unit_amount_minor:17000}),randomUUID(),gate]).then(result=>({result}),error=>({error}));
    let waiting=false;for(let n=0;n<50;n++){waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;if(waiting)break;await delay(50);}
    assert.equal(waiting,true);await a.query('commit');assert.equal((await pending).error?.code,'SH409');await b.query('rollback');
    assert.equal(first.price_version,5);assert.equal(first.unit_amount_minor,16000);
    assert.equal((await db.query('select count(*)::int n from private.finance_catalog_commands where clinic_id=$1 and actor_ref=$2',[clinic,user])).rows[0].n,5);
    assert.equal((await db.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and aggregate_id=$2 and event_type='LocalFinanceServiceSaved'",[clinic,service])).rows[0].n,5);
    console.log('Native catalogue: persistence, replay and two-editor conflict passed; one winning snapshot/event.');
  }finally{await a.query('rollback').catch(()=>undefined);if(pending)await pending.catch(()=>undefined);await b.query('rollback').catch(()=>undefined);await Promise.all([a.end(),b.end()]);}
}finally{
  if(user){
    await db.query('begin');await db.query("set local session_replication_role='replica'");
    const ids=(await db.query("select distinct receipt->>'service_id' id from private.finance_catalog_commands where clinic_id=$1 and actor_ref=$2 and payload->'service_id'='null'::jsonb",[clinic,user])).rows.map(row=>row.id);
    await db.query('delete from private.audit_events where clinic_id=$1 and actor_ref=$2 and aggregate_id=any($3::uuid[])',[clinic,user,ids]);
    await db.query('delete from private.outbox_events where clinic_id=$1 and actor_ref=$2 and aggregate_id=any($3::uuid[])',[clinic,user,ids]);
    await db.query('delete from private.finance_catalog_commands where clinic_id=$1 and actor_ref=$2',[clinic,user]);
    await db.query('delete from private.finance_catalog_price_versions where clinic_id=$1 and service_id=any($2::uuid[])',[clinic,ids]);
    await db.query('delete from private.finance_catalog_services where clinic_id=$1 and id=any($2::uuid[])',[clinic,ids]);
    await db.query('delete from public.clinic_memberships where user_id=$1',[user]);await db.query('commit');
    const removed=await fetch(status.API_URL+'/auth/v1/admin/users/'+user,{method:'DELETE',headers});assert.equal(removed.ok,true,'Temporary local Auth cleanup failed');
  }
  await db.end();
}
