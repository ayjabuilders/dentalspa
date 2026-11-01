import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {execFileSync} from 'node:child_process';
const options={host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'};
const db=new pg.Client(options),first=new pg.Client(options),second=new pg.Client(options);
const clinic=randomUUID(),provider=randomUUID(),chair=randomUUID(),gate=randomUUID();
let actorA=randomUUID(),actorB=randomUUID(),app,status,admin,endpoint;
const nativeHttp=process.argv.includes('--http'),accounts=[];
const tokens=new Map();
await Promise.all([db.connect(),first.connect(),second.connect()]);
async function race(client,actor,sql,args,role='authenticated'){
  await client.query('begin');
  try{
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method','POST',true)",[actor]);
    assert.ok(['authenticated','anon'].includes(role));await client.query(`set local role ${role}`);
    const result=await client.query(sql,args);await client.query('commit');return {ok:true,receipt:result.rows[0].r};
  }catch(error){await client.query('rollback');return {ok:false,code:error.code};}
}
try{
  if(nativeHttp){
    const capture={encoding:'utf8',stdio:['ignore','pipe','pipe']};
    status=JSON.parse(process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],capture):execFileSync('pnpm',['exec','supabase','status','-o','json'],capture));
    assert.equal(status.API_URL,'http://127.0.0.1:54321');
    admin={apikey:status.SERVICE_ROLE_KEY,Authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'Content-Type':'application/json'};
    for(let i=0;i<2;i++){
      const email=`confirm-${randomUUID()}@example.test`,password=`Local!${randomUUID()}9`;
      const response=await fetch(`${status.API_URL}/auth/v1/admin/users`,{method:'POST',headers:admin,body:JSON.stringify({email,password,email_confirm:true})});assert.equal(response.ok,true);
      const user=await response.json();accounts.push(user.id);
      const login=await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:status.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.ok,true);tokens.set(user.id,(await login.json()).access_token);
    }
    [actorA,actorB]=accounts;
    process.env.SUPABASE_URL=status.API_URL;process.env.SUPABASE_ANON_KEY=status.ANON_KEY;
    process.env.ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS='true';process.env.LOCAL_AGENDA_SETTINGS_GATE_KEY=gate;
    const {default:api}=await import('../apps/dental-api/dist/bootstrap.js');
    app=await api.createApplication();await app.listen(0,'127.0.0.1');endpoint=await app.getUrl();
  }
  await db.query('begin');
  await db.query("insert into public.clinics(id,name) values($1,'Concurrency test · FICTIF')",[clinic]);
  if(!nativeHttp)await db.query('insert into auth.users(id) values($1),($2)',[actorA,actorB]);
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true),($1,$3,'manager',true)",[clinic,actorA,actorB]);
  await db.query('insert into private.scheduling_settings(clinic_id,enabled) values($1,true)',[clinic]);
  await db.query("insert into private.scheduling_resources(id,clinic_id,kind,display_name) values($2,$1,'provider','Praticien fictif'),($3,$1,'chair','Fauteuil fictif')",[clinic,provider,chair]);
  const date=(await db.query("select to_char(current_date+7+((8-extract(isodow from current_date)::integer)%7),'YYYY-MM-DD') date")).rows[0].date;
  await db.query("insert into private.scheduling_windows(clinic_id,resource_id,starts_at,ends_at) select $1,id,($2::date+time '08:00') at time zone 'Africa/Casablanca',($2::date+time '19:00') at time zone 'Africa/Casablanca' from private.scheduling_resources where clinic_id=$1",[clinic,date]);
  const source=(await db.query("select configuration from private.agenda_configuration_versions where clinic_id='10000000-0000-4000-8000-000000000001' order by revision desc limit 1")).rows[0].configuration;
  const config={...source,revision:1,closures:[],visit_types:source.visit_types.map(v=>({...v,resource_pairs:[{provider_id:provider,chair_id:chair}]}))};
  const visit=config.visit_types.find(v=>v.active&&v.public_bookable);assert.ok(visit);
  await db.query('insert into private.agenda_configuration_versions(clinic_id,revision,configuration,actor_ref,request_key) values($1,1,$2,$3,$4)',[clinic,config,actorB,randomUUID()]);
  await db.query('insert into private.agenda_configuration_gates(clinic_id,enabled,public_discovery_enabled,public_requests_enabled,confirmations_enabled,api_gate_key,public_api_gate_key) values($1,true,true,true,true,$2,$2)',[clinic,gate]);
  const request=async(time)=>{
    const times=(await db.query("select private.scheduling_time(($1::date+$2::time) at time zone 'Africa/Casablanca') starts_at,private.scheduling_time((($1::date+$2::time) at time zone 'Africa/Casablanca')+$3*interval '1 minute') ends_at",[date,time,visit.duration_minutes])).rows[0];
    const snap=(await db.query('select private.agenda_availability_snapshot($1,$2) s',[clinic,date])).rows[0].s;
    const payload={visit_type_id:visit.id,configuration_revision:1,...times,contact_name:'Youssef · FICTIF',contact_email:'concurrency@example.test',administrative_consent_version:'local-demo-v1'};
    const result=(await db.query('select public.create_local_configured_booking_request($1,$2,$3,$4,$5) r',[clinic,randomUUID(),payload,snap,gate])).rows[0].r;
    return {...result,...times};
  };
  const a=await request('09:00'),b=await request('09:00'),c=await request('11:00'),d=await request('14:00'),e=await request('15:00');
  await db.query('commit');
  const sql='select public.confirm_local_configured_booking_request($1,$2,$3,1,$4) r';
  const httpConfirm=async(actor,id)=>{
    const key=randomUUID(),url=`${endpoint}/api/v1/booking-requests/configured/${id}/confirm`;
    const options={method:'POST',headers:{Authorization:`Bearer ${tokens.get(actor)}`,'X-Clinic-Id':clinic,'Idempotency-Key':key,'Content-Type':'application/json'},body:JSON.stringify({expected_revision:1})};
    const response=await fetch(url,options),receipt=await response.json();
    assert.equal(response.headers.get('cache-control'),'no-store');
    if(response.status===409)return {ok:false,code:'SH409'};
    assert.equal(response.status,201);assert.equal(receipt.request_id,id);assert.equal(receipt.status,'confirmed');
    const retry=await fetch(url,options);assert.equal(retry.status,201);assert.deepEqual(await retry.json(),{...receipt,replayed:true});
    return {ok:true,receipt};
  };
  if(nativeHttp){
    const url=`${endpoint}/api/v1/booking-requests/configured/${a.request_id}/confirm`;
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${tokens.get(actorA)}`,'X-Clinic-Id':randomUUID(),'Idempotency-Key':randomUUID(),'Content-Type':'application/json'},body:JSON.stringify({expected_revision:1})})).status,403);
  }
  const results=await Promise.all([
    nativeHttp?httpConfirm(actorA,a.request_id):race(first,actorA,sql,[clinic,a.request_id,randomUUID(),gate]),
    nativeHttp?httpConfirm(actorB,b.request_id):race(second,actorB,sql,[clinic,b.request_id,randomUUID(),gate])
  ]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok).code,'SH409');
  assert.equal((await db.query('select count(*)::int n from private.configured_appointments where clinic_id=$1',[clinic])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from private.scheduling_occupancy where clinic_id=$1 and active',[clinic])).rows[0].n,2);
  console.log('PASS concurrent confirmations: one appointment, two occupancy rows, one conflict');
  const hold={provider_resource_id:provider,chair_resource_id:chair,starts_at:c.starts_at,ends_at:c.ends_at,display_timezone:'Africa/Casablanca'};
  const mixed=await Promise.all([
    nativeHttp?httpConfirm(actorA,c.request_id):race(first,actorA,sql,[clinic,c.request_id,randomUUID(),gate]),
    race(second,actorB,'select public.scheduling_create_hold($1,$2,$3,$4) r',[clinic,randomUUID(),hold,randomUUID()])
  ]);
  assert.equal(mixed.filter(r=>r.ok).length,1);assert.equal(mixed.find(r=>!r.ok).code,'SH409');
  const collisions=(await db.query('select count(*)::int n from private.scheduling_occupancy a join private.scheduling_occupancy b on a.clinic_id=b.clinic_id and a.resource_id=b.resource_id and a.id<b.id and a.period&&b.period where a.clinic_id=$1 and a.active and b.active',[clinic])).rows[0].n;
  assert.equal(collisions,0);
  assert.equal((await db.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and event_type in ('ConfiguredBookingConfirmed','SlotHoldCreated')",[clinic])).rows[0].n,2);
  console.log('PASS concurrent hold/confirmation: one winner, no overlapping occupancy or duplicate event');
  const appointment=results.find(result=>result.ok).receipt.appointment_id;
  const cancellations=await Promise.all([
    race(first,actorA,'select public.cancel_local_configured_appointment($1,$2,1,$3,$4) r',[clinic,appointment,randomUUID(),gate]),
    race(second,actorB,'select public.cancel_local_configured_appointment($1,$2,1,$3,$4) r',[clinic,appointment,randomUUID(),gate])
  ]);
  assert.equal(cancellations.filter(result=>result.ok).length,1);assert.equal(cancellations.find(result=>!result.ok).code,'SH409');
  assert.equal((await db.query("select count(*)::int n from private.outbox_events where aggregate_id=$1 and event_type='ConfiguredAppointmentCancelled'",[appointment])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from private.scheduling_occupancy where appointment_id=$1 and active',[appointment])).rows[0].n,0);
  console.log('PASS concurrent cancellation: one transition, one event and capacity released');
  const movableA=await race(first,actorA,sql,[clinic,d.request_id,randomUUID(),gate]);
  const movableB=await race(second,actorB,sql,[clinic,e.request_id,randomUUID(),gate]);
  assert.equal(movableA.ok,true);assert.equal(movableB.ok,true);
  const target=(await db.query("select private.scheduling_time(($1::date+time '16:00') at time zone 'Africa/Casablanca') starts_at,private.scheduling_time((($1::date+time '16:00') at time zone 'Africa/Casablanca')+$2*interval '1 minute') ends_at",[date,visit.duration_minutes])).rows[0];
  const moveSql='select public.reschedule_local_configured_appointment($1,$2,1,$3,1,$4,$5,$6) r';
  const moves=await Promise.all([
    race(first,actorA,moveSql,[clinic,movableA.receipt.appointment_id,randomUUID(),target.starts_at,target.ends_at,gate]),
    race(second,actorB,moveSql,[clinic,movableB.receipt.appointment_id,randomUUID(),target.starts_at,target.ends_at,gate])
  ]);
  assert.equal(moves.filter(result=>result.ok).length,1);assert.equal(moves.find(result=>!result.ok).code,'SH409');
  const loser=moves[0].ok?{id:movableB.receipt.appointment_id,time:e.starts_at}:{id:movableA.receipt.appointment_id,time:d.starts_at};
  assert.equal((await db.query('select starts_at from private.configured_appointments where id=$1',[loser.id])).rows[0].starts_at.toISOString(),loser.time);
  assert.equal((await db.query('select count(*)::int n from private.scheduling_occupancy where appointment_id=$1 and active',[loser.id])).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int n from private.outbox_events where clinic_id=$1 and event_type='ConfiguredAppointmentRescheduled'",[clinic])).rows[0].n,1);
  console.log('PASS concurrent moves: one target winner, loser retains original appointment and occupancy');
  const autoConfig={...config,revision:2,confirmation_mode:'automatic'};
  await db.query('insert into private.agenda_configuration_versions(clinic_id,revision,configuration,actor_ref,request_key) values($1,2,$2,$3,$4)',[clinic,autoConfig,actorB,randomUUID()]);
  const autoTimes=(await db.query("select private.scheduling_time(($1::date+time '17:00') at time zone 'Africa/Casablanca') starts_at,private.scheduling_time((($1::date+time '17:00') at time zone 'Africa/Casablanca')+$2*interval '1 minute') ends_at",[date,visit.duration_minutes])).rows[0];
  const autoSnapshot=(await db.query('select private.agenda_availability_snapshot($1,$2) s',[clinic,date])).rows[0].s;
  const autoPayload={visit_type_id:visit.id,configuration_revision:2,...autoTimes,contact_name:'Imane · FICTIF',contact_email:'automatic@example.test',administrative_consent_version:'local-demo-v1'};
  const autoKeys=[randomUUID(),randomUUID()],autoSql='select public.create_local_configured_booking_request($1,$2,$3,$4,$5) r';
  const automatic=await Promise.all([
    race(first,actorA,autoSql,[clinic,autoKeys[0],autoPayload,autoSnapshot,gate],'anon'),
    race(second,actorB,autoSql,[clinic,autoKeys[1],autoPayload,autoSnapshot,gate],'anon')
  ]);
  assert.equal(automatic.filter(result=>result.ok).length,1);assert.equal(automatic.find(result=>!result.ok).code,'SH409');
  const winner=automatic.findIndex(result=>result.ok);assert.equal(automatic[winner].receipt.status,'confirmed');
  const replay=await race(first,actorA,autoSql,[clinic,autoKeys[winner],autoPayload,null,gate],'anon');
  assert.deepEqual(replay.receipt,{...automatic[winner].receipt,replayed:true});
  assert.equal((await db.query('select count(*)::int n from private.configured_booking_requests where clinic_id=$1 and request_key=any($2::uuid[])',[clinic,autoKeys])).rows[0].n,1);
  console.log('PASS concurrent automatic public booking: one request/appointment, one conflict, immutable replay');
  if(nativeHttp)console.log('PASS native Auth → NestJS → PostgreSQL, receipt replay, anonymous401 and foreign403');
}finally{
  await app?.close();
  await db.query('rollback');
  await db.query('begin');
  // Only this generated clinic and these generated users; no existing records.
  for(const table of ['scheduling_occupancy','configured_appointment_commands','configured_booking_confirmations','configured_appointments','configured_booking_requests','scheduling_idempotency','scheduling_holds','scheduling_windows','scheduling_resources','scheduling_settings','agenda_configuration_versions','agenda_configuration_gates','audit_events','outbox_events'])await db.query(`delete from private.${table} where clinic_id=$1`,[clinic]);
  await db.query('delete from public.clinic_memberships where clinic_id=$1',[clinic]);
  await db.query('delete from public.clinics where id=$1',[clinic]);
  if(!nativeHttp)await db.query('delete from auth.users where id in ($1,$2)',[actorA,actorB]);
  await db.query('commit');
  for(const id of accounts){const removed=await fetch(`${status.API_URL}/auth/v1/admin/users/${id}`,{method:'DELETE',headers:admin});assert.equal(removed.ok,true);}
  await Promise.all([db.end(),first.end(),second.end()]);
}
