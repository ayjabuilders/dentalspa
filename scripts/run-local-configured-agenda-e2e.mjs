import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { URLSearchParams } from 'node:url';
// The browser subprocess can outlive the API's idle keep-alive timeout.
const fetch=(url,options={})=>globalThis.fetch(url,{...options,headers:{...options.headers,Connection:'close'}});
const atlas='10000000-0000-4000-8000-000000000001',sale='10000000-0000-4000-8000-000000000002';
const options={encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000};
const status=JSON.parse(process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','pnpm exec supabase status -o json'],options):execFileSync('pnpm',['exec','supabase','status','-o','json'],options));
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const api='http://127.0.0.1:4300';
const email=`patient-hub-${randomUUID()}@dentalspa.test`,password=`Local!${randomBytes(24).toString('base64url')}9`;
const headers={apikey:status.SERVICE_ROLE_KEY,authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'content-type':'application/json'};
const client=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
let userId;
try {
  await client.connect();
  const created=await fetch(`${status.API_URL}/auth/v1/admin/users`,{method:'POST',headers,body:JSON.stringify({email,password,email_confirm:true})});
  assert.equal(created.ok,true);userId=(await created.json()).id;
  await client.query("insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,'manager',true)",[atlas,userId]);
  const signed=await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:status.ANON_KEY,'content-type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(signed.ok,true);const token=(await signed.json()).access_token;

  const auth={Authorization:`Bearer ${token}`,'X-Clinic-Id':atlas};
  const read=await fetch(`${api}/api/v1/agenda-settings`,{headers:auth});assert.equal(read.status,200);
  const before=(await read.json()).settings;
  const date=(await client.query("select to_char(current_date+7+((8-extract(isodow from current_date)::int)%7),'YYYY-MM-DD') as fixture_date")).rows[0].fixture_date;
  const query=new URLSearchParams({date,visit_type_id:'81000000-0000-4000-8000-000000000001'});
  const availability=await fetch(`${api}/api/v1/booking-requests/configured-availability?${query}`);assert.equal(availability.status,200);
  const result=await availability.json();assert.ok(result.slots.length>0);assert.equal(result.visit_types.length,1);
  assert.ok(!JSON.stringify(result).includes('resource_id'));assert.ok(!JSON.stringify(result).includes('patient'));
  query.set('visit_type_id','81000000-0000-4000-8000-000000000002');
  const hidden=await fetch(`${api}/api/v1/booking-requests/configured-availability?${query}`);assert.equal(hidden.status,200);assert.equal((await hidden.json()).slots.length,0);
  assert.equal((await fetch(`${api}/api/v1/agenda-settings`,{headers:{...auth,'X-Clinic-Id':sale}})).status,403);
  const env={...process.env,LOCAL_PATIENT_HUB_EMAIL:email,LOCAL_PATIENT_HUB_PASSWORD:password,LOCAL_AGENDA_DATE:date};
  const command='pnpm exec playwright test tests/e2e/configured-agenda-local.spec.ts';
  const run=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c',command],{stdio:'inherit',windowsHide:true,env}):spawnSync('pnpm',['exec','playwright','test','tests/e2e/configured-agenda-local.spec.ts'],{stdio:'inherit',env});
  assert.equal(run.status,0,'Native configured agenda browser verification failed');
  const after=(await(await fetch(`${api}/api/v1/agenda-settings`,{headers:auth})).json()).settings;
  assert.equal(after.revision,before.revision+1);assert.deepEqual({...after,revision:before.revision},before);
  const publicAfter=await(await fetch(`${api}/api/v1/booking-requests/configured-availability?date=${date}`)).json();assert.equal(publicAfter.revision,after.revision);
  console.log('Native configured agenda: manager save/read, revision projected publicly, available slots and hidden follow-up type verified.');
} finally {
  if(userId){await client.query('delete from public.clinic_memberships where user_id=$1',[userId]);await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`,{method:'DELETE',headers});}
  await client.end();
}
