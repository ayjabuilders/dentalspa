import { readFileSync,writeFileSync } from 'node:fs';
import { randomUUID,randomBytes } from 'node:crypto';
import pg from 'pg';
import { AgendaSettingsSchema } from '../packages/contracts/dist/agenda-settings.js';

// Existing local synthetic Atlas workspace only. No linked/hosted connection.
const file=new URL('../apps/dental-api/.env.local',import.meta.url);
let env=readFileSync(file,'utf8');
const value=name=>env.match(new RegExp(`^${name}=(.*)$`,'m'))?.[1]?.trim();
if(value('SUPABASE_URL')!=='http://127.0.0.1:54321')throw Error('Refusing non-local API configuration');
const clinic='10000000-0000-4000-8000-000000000001';
const requests=process.argv.includes('--requests');
const confirmations=process.argv.includes('--confirmations');
const managerGate=value('LOCAL_AGENDA_SETTINGS_GATE_KEY')||randomBytes(32).toString('hex');
const publicGate=value('LOCAL_PUBLIC_AGENDA_GATE_KEY')||randomBytes(32).toString('hex');
const provider='74000000-0000-4000-8000-000000000001',chair='74000000-0000-4000-8000-000000000003';
const windows=Array.from({length:6},(_,index)=>[{weekday:index+1,start:'09:00',end:'12:00'},{weekday:index+1,start:'14:00',end:'18:00'}]).flat();
const settings=AgendaSettingsSchema.parse({schema_version:1,revision:1,time_zone:'Africa/Casablanca',slot_step_minutes:15,minimum_notice_minutes:60,booking_horizon_days:30,confirmation_mode:'staff_review',patient_cancellation_enabled:false,patient_reschedule_enabled:false,cancellation_notice_minutes:0,reschedule_notice_minutes:0,weekly_windows:windows,closures:[],visit_types:[
  {id:'81000000-0000-4000-8000-000000000001',name:'Première visite — fictive',duration_minutes:30,public_bookable:true},
  {id:'81000000-0000-4000-8000-000000000002',name:'Contrôle — fictif',duration_minutes:20,public_bookable:false},
].map(visit=>({...visit,active:true,buffer_before_minutes:0,buffer_after_minutes:15,resource_pairs:[{provider_id:provider,chair_id:chair}],weekly_windows:windows}))});
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
await db.connect();
try{
  await db.query('begin');
  const actor=(await db.query("select m.user_id from public.clinic_memberships m join auth.users u on u.id=m.user_id where m.clinic_id=$1 and m.active and m.role='manager' and u.email='youssef.elidrissi@dentalspa.test'",[clinic])).rows[0]?.user_id;
  if(!actor)throw Error('Existing synthetic Atlas manager required');
  const resources=(await db.query('select id from private.scheduling_resources where clinic_id=$1 and id in ($2,$3) and active and synthetic_only',[clinic,provider,chair])).rows;
  if(resources.length!==2)throw Error('Run existing local scheduling setup first; resources will not be overwritten');
  await db.query("insert into private.agenda_configuration_gates(clinic_id,enabled,synthetic_only,api_gate_key,public_discovery_enabled,public_api_gate_key) values($1,true,true,$2,true,$3) on conflict(clinic_id) do update set enabled=true,synthetic_only=true,api_gate_key=excluded.api_gate_key,public_discovery_enabled=true,public_api_gate_key=excluded.public_api_gate_key",[clinic,managerGate,publicGate]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
  const existing=(await db.query('select revision from private.agenda_configuration_versions where clinic_id=$1 order by revision desc limit 1',[clinic])).rows[0];
  if(!existing)await db.query('select public.save_local_agenda_configuration($1,0,$2::jsonb,$3,$4)',[clinic,JSON.stringify(settings),randomUUID(),managerGate]);
  if(requests)await db.query('update private.agenda_configuration_gates set public_requests_enabled=true where clinic_id=$1',[clinic]);
  if(confirmations)await db.query('update private.agenda_configuration_gates set confirmations_enabled=true where clinic_id=$1',[clinic]);
  await db.query('commit');
  const entries={ENABLE_LOCAL_AGENDA_SETTINGS:'true',LOCAL_AGENDA_SETTINGS_GATE_KEY:managerGate,ENABLE_LOCAL_PUBLIC_AGENDA:'true',LOCAL_PUBLIC_AGENDA_CLINIC_ID:clinic,LOCAL_PUBLIC_AGENDA_GATE_KEY:publicGate};
  if(requests)entries.ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS='true';
  if(confirmations)entries.ENABLE_LOCAL_CONFIGURED_BOOKING_CONFIRMATIONS='true';
  for(const [name,v] of Object.entries(entries)){const pattern=new RegExp(`^${name}=.*$`,'m');env=pattern.test(env)?env.replace(pattern,`${name}=${v}`):`${env.trimEnd()}\n${name}=${v}\n`;}
  writeFileSync(file,env);
  console.log(`Local configurable agenda enabled; ${existing?'existing configuration preserved':'labelled synthetic initial configuration saved'}. Restart local API. ${requests?'Staff-review requests enabled.':''} ${confirmations?'Staff confirmation enabled locally.':'Staff confirmation unchanged.'} Automatic public confirmation remains unfinished.`);
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
