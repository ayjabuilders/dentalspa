import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const file='apps/dental-api/.env.local';let env=readFileSync(file,'utf8');
const read=name=>env.match(new RegExp(`^${name}=(.*)$`,'m'))?.[1]?.trim();
const url=new URL(read('SUPABASE_URL'));assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'&&url.port==='54321','Local Supabase required');
const clinic='10000000-0000-4000-8000-000000000001';const gate=read('LOCAL_QUOTE_DRAFT_GATE_KEY')||randomBytes(32).toString('hex');
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
await db.connect();try{
  assert.equal((await db.query("select count(*)::int n from public.clinics where id=$1 and name='Cabinet Dentaire Atlas - Casablanca (FICTIF)'",[clinic])).rows[0].n,1);
  await db.query('insert into private.finance_draft_gates(clinic_id,enabled,api_gate_key) values($1,true,$2) on conflict(clinic_id) do update set enabled=true,api_gate_key=excluded.api_gate_key',[clinic,gate]);
  for(const [name,value] of Object.entries({ENABLE_LOCAL_QUOTE_DRAFTS:'true',LOCAL_QUOTE_DRAFT_GATE_KEY:gate})){
    const pattern=new RegExp(`^${name}=.*$`,'m');env=pattern.test(env)?env.replace(pattern,`${name}=${value}`):`${env.trimEnd()}\n${name}=${value}\n`;
  }
  writeFileSync(file,env);console.log('Synthetic Atlas quote drafting enabled locally. Restart API. Existing accounts, prices and quotes preserved.');
}finally{await db.end();}
