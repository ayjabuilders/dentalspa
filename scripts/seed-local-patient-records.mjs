import pg from 'pg';
import { pathToFileURL } from 'node:url';

const atlas='10000000-0000-4000-8000-000000000001';
const sale='10000000-0000-4000-8000-000000000002';
const id=(prefix,n)=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const patientDemoScenarios=[
  { n:1, clinic:atlas, slug:'salma', city:'Casablanca', birth:'1992-04-18', language:'fr', checklist:'missing', amount:30000, service:'Consultation initiale fictive' },
  { n:2, clinic:atlas, slug:'youssef', city:'Mohammedia', birth:'1985-09-07', language:'ar', checklist:'received', amount:90000, service:'Soins prévus — exemple fictif' },
  { n:3, clinic:atlas, slug:'imane', city:'Casablanca', birth:'1998-12-02', language:'fr', checklist:'needs_correction', amount:50000, service:'Séance de suivi fictive' },
  { n:4, clinic:sale, slug:'nadia', city:'Salé', birth:'1979-06-21', language:'ar', checklist:'completed_manually', amount:30000, service:'Consultation initiale fictive' },
  { n:5, clinic:sale, slug:'hamza', city:'Rabat', birth:'1994-02-13', language:'fr', checklist:'not_applicable', amount:90000, service:'Soins prévus — exemple fictif' },
  { n:6, clinic:sale, slug:'oumaima', city:'Salé', birth:'2001-11-05', language:'en', checklist:'missing', amount:50000, service:'Séance de suivi fictive' },
];

export async function seedPatientRecords(client) {
  await client.query('begin');
  try {
    await client.query("select pg_advisory_xact_lock(hashtextextended('local-patient-fixtures-v1',0))");
    const {rows:staff}=await client.query("select u.id from auth.users u join public.clinic_memberships m on m.user_id=u.id where u.email='youssef.elidrissi@dentalspa.test' and m.role='manager' and m.active and m.clinic_id in ($1,$2) group by u.id having count(distinct m.clinic_id)=2",[atlas,sale]);
    if(staff.length!==1) throw new Error('Existing local synthetic manager is required; no account reset was attempted.');
    const actor=staff[0].id;
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.method','POST',true)",[actor]);
    const emit=async(clinic,patient,action,correlation)=>{
      await client.query('insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values($1,$2,$3,$4,$5)',[clinic,actor,action,patient,correlation]);
      await client.query("insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values($1,$2,1,'synthetic_patient_fixture',$3,$4,$5,'{\"fixture_version\":1}')",[clinic,action,patient,correlation,actor]);
    };
    await client.query('update private.patient_admin_document_checklist_settings set enabled=true where singleton');
    for(const s of patientDemoScenarios) {
      const patient=id('20000000',s.n),service=id('79000000',s.n),quote=id('78000000',s.n);
      const existing=await client.query("select 1 from public.patients p join public.clinics c on c.id=p.clinic_id where p.id=$1 and p.clinic_id=$2 and p.display_name like '%(FICTIF)' and c.name like '%(FICTIF)'",[patient,s.clinic]);
      if(existing.rowCount!==1) throw new Error('Expected synthetic fixture patient/clinic not found.');
      const profile=await client.query('insert into private.patient_admin_profiles(clinic_id,patient_id,phone_display,email,city,birth_date,preferred_language,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning patient_id',[s.clinic,patient,`+212 6XX XX XX 0${s.n}`,`${s.slug}@example.test`,s.city,s.birth,s.language,actor]);
      if(profile.rowCount) await emit(s.clinic,patient,'SyntheticPatientProfileSeeded',id('7a000000',s.n));
      const checklist=await client.query('select revision from private.patient_admin_document_checklist where clinic_id=$1 and patient_id=$2 and kind=$3',[s.clinic,patient,'cnss']);
      if(!checklist.rowCount) await client.query('select public.set_patient_admin_document_checklist($1,$2,$3::jsonb,$4,$5)',[s.clinic,patient,JSON.stringify({expected_revision:0,kind:'cnss',status:s.checklist}),id('7b000000',s.n),id('7c000000',s.n)]);
      await client.query('insert into private.finance_catalog_services(clinic_id,id,service_code,service_name) values($1,$2,$3,$4) on conflict do nothing',[s.clinic,service,`LOCAL-PATIENT-FIXTURE-${s.n}`,s.service]);
      await client.query("insert into private.finance_catalog_price_versions(clinic_id,service_id,version,unit_amount_minor,currency_code,effective_from,created_by) values($1,$2,1,$3,'MAD','2026-10-01T00:00Z',$4) on conflict do nothing",[s.clinic,service,s.amount,actor]);
      const created=await client.query('insert into private.finance_quotes(clinic_id,id,patient_id,created_by) values($1,$2,$3,$4) on conflict do nothing returning id',[s.clinic,quote,patient,actor]);
      if(created.rowCount) {
        await client.query("insert into private.finance_quote_versions(clinic_id,quote_id,version,state,currency_code,subtotal_minor,discount_minor,tax_minor,created_by) values($1,$2,1,'draft','MAD',$3,0,0,$4)",[s.clinic,quote,s.amount,actor]);
        await client.query('insert into private.finance_quote_lines(clinic_id,quote_id,quote_version,line_number,service_id,price_version,label_snapshot,quantity,unit_amount_minor,discount_minor,tax_minor) values($1,$2,1,1,$3,1,$4,1,$5,0,0)',[s.clinic,quote,service,s.service,s.amount]);
        await emit(s.clinic,patient,'SyntheticPatientQuoteSeeded',id('7d000000',s.n));
      }
      if(s.clinic===atlas) {
        const requestKey=id('7e000000',s.n);
        const previous=await client.query('select id from private.demo_booking_requests where clinic_id=$1 and request_key=$2',[atlas,requestKey]);
        if(!previous.rowCount) {
          const {rows:[dates]}=await client.query("select (date_trunc('week',now() at time zone 'Africa/Casablanca')::date+7+$1::int)::text date",[s.n-1]);
          const {rows:[gate]}=await client.query('select api_gate_key,enabled from private.demo_booking_request_settings where singleton');
          if(!gate?.enabled || !gate.api_gate_key) throw new Error('Local booking request gate must already be enabled.');
          await client.query('select public.create_demo_booking_request($1,$2,$3,$4,$5)',[requestKey,s.slug,dates.date,'09:00',gate.api_gate_key]);
        }
        const {rows:[booking]}=await client.query('select id from private.demo_booking_requests where clinic_id=$1 and request_key=$2',[atlas,requestKey]);
        const {rows:[gate]}=await client.query('select api_gate_key,enabled from private.demo_booking_confirmation_settings where singleton');
        if(!gate?.enabled || !gate.api_gate_key) throw new Error('Local booking confirmation gate must already be enabled.');
        const {rows:[receipt]}=await client.query('select public.confirm_demo_booking_request($1,$2,$3,$4,$5,$6) result',[atlas,booking.id,id('73000000',1),id('73000000',3),id('7f000000',s.n),gate.api_gate_key]);
        const linked=await client.query('update private.demo_confirmed_appointments set patient_id=$1 where clinic_id=$2 and id=$3 and patient_id is null returning id',[patient,atlas,receipt.result.appointment_id]);
        if(linked.rowCount) await emit(atlas,patient,'SyntheticAppointmentPatientLinked',id('7a100000',s.n));
      }
    }
    await client.query('commit');
    return {patients:6,profiles:6,checklists:6,draft_quotes:6,confirmed_appointments:3};
  } catch(error) { await client.query('rollback'); throw error; }
}

async function main() {
  // Fixed loopback endpoint only: never read a hosted URL or service credential.
  const client=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',connectionTimeoutMillis:5000});
  try { await client.connect(); console.log(JSON.stringify(await seedPatientRecords(client))); }
  finally { await client.end(); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(`Local patient seed failed: ${error.message}`);process.exitCode=1;});
