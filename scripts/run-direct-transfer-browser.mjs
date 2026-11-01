import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

process.loadEnvFile('apps/dental-api/.env.local');
assert.ok(['http://127.0.0.1:54321','http://localhost:54321'].includes(process.env.SUPABASE_URL),'Local-only browser verification');
const require=createRequire(import.meta.url);
const {createApplication}=require('../apps/dental-api/dist/bootstrap.js');
process.env.ALLOWED_ORIGINS='http://localhost:4217';
const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(4217,resolve);});await new Promise(resolve=>probe.close(resolve));
const app=await createApplication();let next;
const log=openSync('.local/qa/direct-transfer-next.log','w');
try {
  await app.listen(4301,'127.0.0.1');
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','4217'],{cwd:resolve('apps/clinic-os'),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_DIST_DIR:'.local/direct-transfer-browser'}});
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){
    if(next.exitCode!==null)throw new Error('Isolated Next server exited');
    try{const response=await fetch('http://localhost:4217/connection',{signal:globalThis.AbortSignal.timeout(2000)});if(response.ok){ready=true;break;}}catch{ /* Await the owned test server startup. */ }
    await delay(500);
  }
  assert.ok(ready,'Isolated app ready');
  const test=spawn(process.execPath,['scripts/run-owner-library-browser.mjs'],{windowsHide:true,stdio:'inherit',env:{...process.env,LOCAL_DOCUMENT_APP_URL:'http://localhost:4217',LOCAL_DOCUMENT_DIRECT_TRANSFER:'true'}});
  process.exitCode=await new Promise((resolve,reject)=>{test.once('error',reject);test.once('exit',code=>resolve(code??1));});
}finally{
  if(next&&next.exitCode===null){next.kill();await new Promise(resolve=>next.once('exit',resolve));}
  await app.close();closeSync(log);
}
