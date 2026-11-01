import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
const atlas='10000000-0000-4000-8000-000000000001';
const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000};
const status=JSON.parse(process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],options):execFileSync('pnpm',['exec','supabase','status','-o','json'],options));
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const api='http://127.0.0.1:4300';
const email=`patient-hub-${randomUUID()}@dentalspa.test`,password=`Local!${randomBytes(24).toString('base64url')}9`;
const headers={apikey:status.SERVICE_ROLE_KEY,authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'content-type':'application/json'};
const client=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
let userId;
const appointment=randomUUID(),bookingRequest=randomUUID(),provider=randomUUID(),chair=randomUUID();
try {
  await client.connect();
  const created=await fetch(`${status.API_URL}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(created.ok,true);userId=(await created.json()).id;
  await client.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'reception',true)",[atlas,userId]);
  const signed=await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:status.ANON_KEY,'content-type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(signed.ok,true);const token=(await signed.json()).access_token;

  const {rows}=await client.query("select to_char(current_date+7+((8-extract(isodow from current_date)::int)%7),'YYYY-MM-DD') as fixture_date");
  const date=rows[0].fixture_date;
  await client.query("insert into private.demo_booking_sample_resources(id,clinic_id,kind,display_name) values($1,$3,'provider','Praticien test fictif'),($2,$3,'chair','Fauteuil test fictif')",[provider,chair,atlas]);
  await client.query("insert into private.demo_booking_requests(id,request_key,scenario_id,requested_date,requested_time) values($1,$2,'salma',$3,'14:00')",[bookingRequest,randomUUID(),date]);
  await client.query("insert into private.demo_confirmed_appointments(id,clinic_id,booking_request_id,scenario_id,provider_resource_id,chair_resource_id,starts_at,ends_at,confirmed_by,patient_id) values($1,$2,$3,'salma',$4,$5,($6::date+time '14:00') at time zone 'Africa/Casablanca',($6::date+time '14:45') at time zone 'Africa/Casablanca',$7,'20000000-0000-4000-8000-000000000001')",[appointment,atlas,bookingRequest,provider,chair,date,userId]);
  const args=['exec','playwright','test','tests/e2e/appointment-lifecycle-local.spec.ts'];
  const env={...process.env,LOCAL_PATIENT_HUB_EMAIL:email,LOCAL_PATIENT_HUB_PASSWORD:password,LOCAL_APPOINTMENT_ID:appointment,LOCAL_APPOINTMENT_DATE:date};
  const run=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c',`pnpm ${args.join(' ')}`],{stdio:'inherit',windowsHide:true,env}):spawnSync('pnpm',args,{stdio:'inherit',env});
  assert.equal(run.status,0,'Native appointment commands browser verification failed');
  const persisted=await client.query("select status,version,to_char(starts_at at time zone 'Africa/Casablanca','HH24:MI') time from private.demo_confirmed_appointments where id=$1",[appointment]);
  assert.deepEqual(persisted.rows[0],{status:'cancelled',version:3,time:'16:00'});
  const events=await client.query('select event_type from private.outbox_events where aggregate_id=$1 order by occurred_at',[appointment]);
  assert.deepEqual(events.rows.map(row=>row.event_type),['DemoAppointmentRescheduled','DemoAppointmentCancelled']);
  const list=await fetch(`${api}/api/v1/booking-requests`,{headers:{Authorization:`Bearer ${token}`,'X-Clinic-Id':atlas}});
  assert.equal(list.status,200);assert.equal((await list.json()).items.find(item=>item.id===bookingRequest)?.status,'cancelled');
  console.log('Native UI/API/database: moved, cancelled, persisted version/time, audit outbox, patient and request projections verified.');
} finally {
  await client.query('delete from private.demo_appointment_command_receipts where appointment_id=$1',[appointment]);
  await client.query('delete from private.outbox_events where aggregate_id=$1',[appointment]);
  await client.query('delete from private.audit_events where aggregate_id=$1',[appointment]);
  await client.query('delete from private.demo_confirmed_appointments where id=$1',[appointment]);
  await client.query('delete from private.demo_booking_requests where id=$1',[bookingRequest]);
  await client.query('delete from private.demo_booking_sample_resources where id in ($1,$2)',[provider,chair]);
  if(userId){await client.query('delete from public.clinic_memberships where user_id=$1',[userId]);await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`,{method:'DELETE',headers});}
  await client.end();
}
