import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import pg from 'pg';
import {AgendaSettingsSchema} from '../packages/contracts/dist/agenda-settings.js';
const clinic='10000000-0000-4000-8000-000000000001',api='http://127.0.0.1:4300/api/v1/booking-requests';
const manifestPath='.local/realistic-agenda-fixture.json';
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres',connectionTimeoutMillis:5000});
const id=n=>`83000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const names=['Salma Alaoui','Youssef Benali','Imane El Idrissi','Oumaima Chraibi','Amine Berrada','Sara Bennani','Mehdi Tazi','Nadia El Fassi'];
await db.connect();
try{
 const {rows:[g]}=await db.query('select * from private.agenda_configuration_gates where clinic_id=$1',[clinic]);
 assert.ok(g?.enabled&&g.synthetic_only&&g.public_requests_enabled&&g.confirmations_enabled,'Local synthetic booking must already be enabled');
 const {rows:[actor]}=await db.query("select m.user_id from public.clinic_memberships m join auth.users u on u.id=m.user_id join public.clinics c on c.id=m.clinic_id where m.clinic_id=$1 and m.active and m.role='manager' and u.email like '%@dentalspa.test' and c.name like '%FICTIF%' limit 1",[clinic]);assert.ok(actor);
 let manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):null;
 if(!manifest){
  const {rows:[current]}=await db.query('select configuration from private.agenda_configuration_versions where clinic_id=$1 order by revision desc limit 1',[clinic]);
  const before=current.configuration;
  const windows=Array.from({length:5},(_,i)=>[{weekday:i+1,start:'09:00',end:'12:30'},{weekday:i+1,start:'14:00',end:'18:00'}]).flat().concat([{weekday:6,start:'09:00',end:'13:00'},{weekday:6,start:'14:00',end:'18:00'}]);
  const pairs=before.visit_types.find(v=>v.active)?.resource_pairs;assert.ok(pairs?.length);
  const examples=[['Consultation et bilan — démo',30,true],['Détartrage — démo',45,true],['Consultation esthétique — démo',30,true],['Consultation enfant — démo',30,true],['Contrôle après soins — démo',20,false],['Séance de soins — démo',60,false],['Suivi orthodontique — démo',30,false]];
  const visits=examples.map(([name,duration_minutes,public_bookable],i)=>({id:id(i+1),name,duration_minutes,public_bookable,active:true,buffer_before_minutes:0,buffer_after_minutes:15,resource_pairs:pairs,weekly_windows:windows}));
  const configuration=AgendaSettingsSchema.parse({...before,revision:before.revision+1,weekly_windows:windows,visit_types:[...before.visit_types,...visits]});
  await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.user_id]);
  await db.query('select public.save_local_agenda_configuration($1,$2,$3,$4,$5)',[clinic,before.revision,configuration,randomUUID(),g.api_gate_key]);
  await db.query('commit');
  manifest={clinic,configuration_revision:configuration.revision,previous_configuration:before,visit_type_ids:visits.map(v=>v.id),requests:[]};mkdirSync('.local',{recursive:true});writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
 }
 const {rows:days}=await db.query("select to_char(d,'YYYY-MM-DD') date from generate_series((timezone('Africa/Casablanca',now())::date+2)::timestamp,(timezone('Africa/Casablanca',now())::date+12)::timestamp,interval '1 day') d where extract(isodow from d) between 1 and 5 limit 4");
 for(let i=0;i<names.length;i++){
  const key=id(100+i),previous=(await db.query('select id from private.configured_booking_requests where clinic_id=$1 and request_key=$2',[clinic,key])).rows[0];
  let request=previous?.id;
  if(!request){
   const response=await fetch(`${api}/configured-availability?date=${days[Math.floor(i/2)].date}&visit_type_id=${id(i%4+1)}`);assert.equal(response.status,200);const availability=await response.json();assert.ok(availability.slots.length);
   const slot=availability.slots[i%2===0?0:Math.floor(availability.slots.length/2)];
   const created=await fetch(`${api}/configured`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({visit_type_id:id(i%4+1),configuration_revision:availability.revision,...slot,contact_name:names[i]+' (FICTIF)',contact_email:`agenda-demo-${i+1}@example.test`,administrative_consent_version:'local-demo-v1'})});assert.equal(created.status,201);
   request=(await db.query('select id from private.configured_booking_requests where clinic_id=$1 and request_key=$2',[clinic,key])).rows[0].id;
  }
  if(i<6){await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.user_id]);await db.query('select public.confirm_local_configured_booking_request($1,$2,$3,$4,$5)',[clinic,request,id(200+i),manifest.configuration_revision,g.api_gate_key]);await db.query('commit');}
  if(!manifest.requests.some(r=>r.id===request)){manifest.requests.push({id:request,request_key:key,confirmed:i<6});writeFileSync(manifestPath,JSON.stringify(manifest,null,2));}
 }
 const {rows:[counts]}=await db.query('select count(*)::int requests,(select count(*)::int from private.configured_appointments where clinic_id=$1 and request_id=any($2::uuid[])) appointments from private.configured_booking_requests where clinic_id=$1 and id=any($2::uuid[])',[clinic,manifest.requests.map(r=>r.id)]);
 assert.equal(counts.requests,8);assert.equal(counts.appointments,6);console.log(JSON.stringify({local_only:true,added_visit_types:7,...counts,fixture_manifest:manifestPath}));
} catch(error){await db.query('rollback');throw error;}finally{await db.end();}
