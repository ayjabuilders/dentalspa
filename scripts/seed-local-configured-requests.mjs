import assert from 'node:assert/strict';
import pg from 'pg';
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
const api='http://127.0.0.1:4300',clinic='10000000-0000-4000-8000-000000000001';
const scenarios=[['Salma Alaoui — FICTIF','salma.request@example.test'],['Youssef Benali — FICTIF','youssef.request@example.test'],['Imane El Idrissi — FICTIF','imane.request@example.test']];
await db.connect();
try{
  const date=(await db.query("select to_char(current_date+7+((8-extract(isodow from current_date)::integer)%7),'YYYY-MM-DD') as date")).rows[0].date;
  let created=0,preserved=0;
  for(const [index,[contact_name,contact_email]] of scenarios.entries()){
    const requestKey=`82000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;
    if((await db.query('select 1 from private.configured_booking_requests where clinic_id=$1 and request_key=$2',[clinic,requestKey])).rowCount){preserved++;continue;}
    const response=await fetch(`${api}/api/v1/booking-requests/configured-availability?date=${date}&visit_type_id=81000000-0000-4000-8000-000000000001`,{headers:{Connection:'close'}});assert.equal(response.status,200);
    const available=await response.json();assert.equal(available.request_enabled,true);assert.ok(available.slots.length>=3);
    const slot=available.slots[index===0?0:index===1?Math.floor(available.slots.length/2):available.slots.length-1];
    const result=await fetch(`${api}/api/v1/booking-requests/configured`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey,Connection:'close'},body:JSON.stringify({visit_type_id:available.selected_visit_type_id,configuration_revision:available.revision,...slot,contact_name,contact_email,administrative_consent_version:'local-demo-v1'})});assert.equal(result.status,201);assert.equal((await result.json()).status,'request_received');created++;
  }
  console.log(`Local synthetic public requests: ${created} created through API, ${preserved} existing records preserved. No appointment confirmed.`);
}finally{await db.end();}
