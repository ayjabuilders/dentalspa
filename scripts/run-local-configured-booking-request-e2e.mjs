import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
const email=`request-${randomUUID()}@example.test`,clinic='10000000-0000-4000-8000-000000000001';
const automatic=process.argv.includes('--automatic'),move=process.argv.includes('--move'),cancel=process.argv.includes('--cancel'),confirm=process.argv.includes('--confirm')||cancel||move||automatic;
let originalConfiguration,automaticRevision,configurationGate;
const statusOptions={encoding:'utf8',stdio:['ignore','pipe','pipe']};
const status=JSON.parse(process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],statusOptions):execFileSync('pnpm',['exec','supabase','status','-o','json'],statusOptions));
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const admin={apikey:status.SERVICE_ROLE_KEY,Authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Connection:'close'};
const staffEmail=`request-review-${randomUUID()}@dentalspa.test`,staffPassword=`Local!${randomBytes(20).toString('base64url')}9`;let userId;
await db.connect();
try{
  const date=(await db.query("select to_char(current_date+7+((8-extract(isodow from current_date)::integer)%7),'YYYY-MM-DD') as date")).rows[0].date;
  const url=`http://127.0.0.1:4300/api/v1/booking-requests/configured-availability?date=${date}&visit_type_id=81000000-0000-4000-8000-000000000001`;
  const response=await fetch(url,{headers:{Connection:'close'}});assert.equal(response.status,200);assert.equal((await response.json()).request_enabled,true);
  const created=await fetch(`${status.API_URL}/auth/v1/admin/users`,{method:'POST',headers:admin,body:JSON.stringify({email:staffEmail,password:staffPassword,email_confirm:true})});assert.equal(created.ok,true);userId=(await created.json()).id;
  await db.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true)",[clinic,userId]);
  if(automatic){
    await db.query("update public.clinic_memberships set role='manager' where clinic_id=$1 and user_id=$2",[clinic,userId]);
    originalConfiguration=(await db.query('select configuration from private.agenda_configuration_versions where clinic_id=$1 order by revision desc limit 1',[clinic])).rows[0].configuration;
    configurationGate=(await db.query('select api_gate_key from private.agenda_configuration_gates where clinic_id=$1',[clinic])).rows[0].api_gate_key;
    await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
    const saved=(await db.query('select public.save_local_agenda_configuration($1,$2,$3,$4,$5) r',[clinic,originalConfiguration.revision,{...originalConfiguration,revision:originalConfiguration.revision+1,confirmation_mode:'automatic'},randomUUID(),configurationGate])).rows[0].r;
    await db.query('commit');automaticRevision=saved.settings.revision;
  }
  const login=await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:status.ANON_KEY,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({email:staffEmail,password:staffPassword})});assert.equal(login.ok,true);const token=(await login.json()).access_token;
  const endpoint='http://127.0.0.1:4300/api/v1/booking-requests/configured';
  assert.equal((await fetch(endpoint,{headers:{Connection:'close'}})).status,401);
  assert.equal((await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':'10000000-0000-4000-8000-000000000002',Connection:'close'}})).status,403);
  const env={...process.env,LOCAL_REQUEST_EMAIL:email,LOCAL_REQUEST_DATE:date,LOCAL_REQUEST_STAFF_EMAIL:staffEmail,LOCAL_REQUEST_STAFF_PASSWORD:staffPassword,LOCAL_REQUEST_CONFIRM:String(confirm),LOCAL_REQUEST_CANCEL:String(cancel),LOCAL_REQUEST_MOVE:String(move),LOCAL_REQUEST_AUTOMATIC:String(automatic)};
  const run=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','pnpm exec playwright test tests/e2e/configured-booking-request-local.spec.ts'],{stdio:'inherit',windowsHide:true,env}):spawnSync('pnpm',['exec','playwright','test','tests/e2e/configured-booking-request-local.spec.ts'],{stdio:'inherit',env});
  assert.equal(run.status,0,'Native public request browser verification failed');
  const rows=(await db.query('select id,status,contact_name,administrative_consent_version,starts_at from private.configured_booking_requests where clinic_id=$1 and contact_email=$2',[clinic,email])).rows;
  assert.equal(rows.length,1);const row=rows[0];assert.equal(row.status,'request_received');assert.equal(row.contact_name,'Salma Alaoui — FICTIF');assert.equal(row.administrative_consent_version,'local-demo-v1');
  const events=(await db.query('select (select count(*)::integer from private.audit_events where aggregate_id=$1) audit,(select count(*)::integer from private.outbox_events where aggregate_id=$1) outbox',[row.id])).rows[0];assert.deepEqual(events,{audit:1,outbox:1});
  const available=await(await fetch(url,{headers:{Connection:'close'}})).json();assert.equal(available.slots.some(slot=>Date.parse(slot.starts_at)===row.starts_at.getTime()),!confirm||cancel||move,'Only current active confirmation reserves capacity');
  if(confirm){
    const appointments=(await db.query('select id from private.configured_appointments where clinic_id=$1 and request_id=$2',[clinic,row.id])).rows;assert.equal(appointments.length,1);
    const count=1+Number(move)+Number(cancel);
    const recorded=(await db.query('select (select count(*)::int from private.scheduling_occupancy where appointment_id=$1 and active) occupancy,(select count(*)::int from private.audit_events where aggregate_id=$1) audit,(select count(*)::int from private.outbox_events where aggregate_id=$1) outbox',[appointments[0].id])).rows[0];assert.deepEqual(recorded,{occupancy:cancel?0:2,audit:count,outbox:count});
    if(move){const moved=(await db.query("select to_char(starts_at at time zone 'Africa/Casablanca','HH24:MI') time from private.configured_appointments where id=$1",[appointments[0].id])).rows[0];assert.equal(moved.time,'15:00');console.log('Native reschedule: persisted15:00 wall time, versioned retry, original capacity released.');}
    if(cancel){const final=(await db.query('select status,version from private.configured_appointments where id=$1',[appointments[0].id])).rows[0];assert.deepEqual(final,{status:'cancelled',version:count});console.log('Native cancellation: immutable retry, cancelled status/version, freed public slot and audit/outbox verified.');}
    console.log('Native confirmation: response lost, identical retry, one appointment/audit/outbox, resource occupancy, reception and agenda rereads verified.');
  }
  console.log(`Native public request: lost-response retry, single stored request, consent, audit/outbox, reception UI, session-preserving agenda links, API isolation and ${cancel?'released capacity after cancellation':confirm?'confirmed occupancy':'unreserved capacity'} verified.`);
}finally{
  await db.query('rollback');
  if(automaticRevision){
    const current=(await db.query('select max(revision) revision from private.agenda_configuration_versions where clinic_id=$1',[clinic])).rows[0].revision;
    if(current===automaticRevision){
      await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
      await db.query('select public.save_local_agenda_configuration($1,$2,$3,$4,$5)',[clinic,current,{...originalConfiguration,revision:current+1},randomUUID(),configurationGate]);await db.query('commit');
      console.log('Original configuration restored as a new version; existing immutable versions preserved.');
    }else console.log('Configuration changed concurrently; newer owner changes preserved.');
  }
  const rows=(await db.query('select id from private.configured_booking_requests where clinic_id=$1 and contact_email=$2',[clinic,email])).rows;
  for(const row of rows){
    const appointments=(await db.query('select id from private.configured_appointments where request_id=$1 and clinic_id=$2',[row.id,clinic])).rows;
    for(const a of appointments){await db.query('delete from private.configured_appointment_commands where appointment_id=$1',[a.id]);await db.query('delete from private.scheduling_occupancy where appointment_id=$1',[a.id]);await db.query('delete from private.outbox_events where aggregate_id=$1',[a.id]);await db.query('delete from private.audit_events where aggregate_id=$1',[a.id]);}
    await db.query('delete from private.configured_booking_confirmations where request_id=$1 and clinic_id=$2',[row.id,clinic]);await db.query('delete from private.configured_appointments where request_id=$1 and clinic_id=$2',[row.id,clinic]);
    await db.query('delete from private.outbox_events where aggregate_id=$1',[row.id]);await db.query('delete from private.audit_events where aggregate_id=$1',[row.id]);await db.query('delete from private.configured_booking_requests where id=$1 and clinic_id=$2',[row.id,clinic]);}
  if(userId){await db.query('delete from public.clinic_memberships where user_id=$1',[userId]);await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`,{method:'DELETE',headers:admin});}
  await db.end();
}
