import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
const path='apps/dental-api/.env.local';
let env=readFileSync(path,'utf8');
assert.match(env,/^SUPABASE_URL=http:\/\/127\.0\.0\.1:54321\s*$/m);
assert.match(env,/^SUPABASE_SERVICE_ROLE_KEY=\S+/m);
const key=env.match(/^LOCAL_TEAM_ACCESS_GATE_KEY=(.+)$/m)?.[1]?.trim()??randomBytes(32).toString('hex');
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
await db.connect();
try {
 const result=await db.query('update private.local_team_access_settings set enabled=true,api_gate_key=$1 where singleton',[key]);
 assert.equal(result.rowCount,1);
 for(const[name,value]of [['ENABLE_LOCAL_TEAM_ACCESS','true'],['LOCAL_TEAM_ACCESS_GATE_KEY',key]]) {
   const pattern=new RegExp('^'+name+'=.*$','m');env=pattern.test(env)?env.replace(pattern,name+'='+value):env+'\n'+name+'='+value+'\n';
 }
 writeFileSync(path,env);
 console.log('Local-only team access enabled; no member or role was changed. Restart API to load configuration.');
}finally{await db.end();}
