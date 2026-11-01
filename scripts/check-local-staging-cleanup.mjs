import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
process.loadEnvFile('apps/dental-api/.env.local');
assert.ok(['http://127.0.0.1:54321','http://localhost:54321'].includes(process.env.SUPABASE_URL),'Local-only Storage verification');
const require=createRequire(import.meta.url);require('reflect-metadata');
const {SupabasePrivateDocumentStorage}=require('../apps/dental-api/dist/documents/infrastructure/supabase-private-document-storage.js');
const {cleanupDocumentStaging}=require('../apps/dental-api/dist/documents/application/staging-cleanup.js');
const storage=new SupabasePrivateDocumentStorage(),now=Date.now(),old=now-4*3600000;
const expired=`_staging/${old}/${randomUUID()}`,recreated=`_staging/${old}/${randomUUID()}`,active=`_staging/${now+1800000}/${randomUUID()}`;
const final=`${randomUUID()}/${randomUUID()}/administrative/${randomUUID()}`;
const paths=[expired,recreated,active,final],bytes=Buffer.from('%PDF-1.7\n% Synthetic maintenance fixture\n%%EOF');
const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres',connectionTimeoutMillis:5000});
try {
  await db.connect();
  for(const path of paths)assert.equal(await storage.upload(path,bytes,'application/pdf'),true);
  // Only the exact test-owned object is aged. Do not move the system clock forward.
  await db.query("update storage.objects set created_at=$1 where bucket_id='patient-documents' and name=$2",[new Date(old),expired]);
  // Limit the native scan to this run's staging folders, leaving other uploads untouched.
  const isolated={listStaging:async(prefix,offset)=>{
    const page=await storage.listStaging(prefix,offset);
    return prefix==='_staging'?page.filter(entry=>[String(old),String(now+1800000)].includes(entry.name)):page;
  },removeStaging:paths=>storage.removeStaging(paths)};
  assert.deepEqual(await cleanupDocumentStaging(isolated,now),{removed:1,partial:false});
  assert.equal(await storage.download(expired),null);
  for(const path of [recreated,active,final])assert.deepEqual(await storage.download(path),bytes);
  assert.deepEqual(await cleanupDocumentStaging(isolated,now),{removed:0,partial:false});
  await assert.rejects(storage.removeStaging([final]));
  console.log('PASS expired staging removed; active/recreated staging and final object preserved');
  console.log('PASS idempotent rerun and adapter refusal of final paths');
} finally {
  // Exact synthetic fixture paths only; no bucket purge or patient-record deletion.
  for(const path of paths)await storage.remove(path);
  await db.end();
}
