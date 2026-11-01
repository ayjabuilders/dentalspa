import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// Uses the compiled services against real local Auth, PostgreSQL and private Storage.
// Does not restart the owner's running application or print tokens/signed URLs.
process.loadEnvFile('apps/dental-api/.env.local');
assert.ok(['http://127.0.0.1:54321','http://localhost:54321'].includes(process.env.SUPABASE_URL), 'Local-only verification');
const require=createRequire(import.meta.url);
require('reflect-metadata');
const {DocumentsService}=require('../apps/dental-api/dist/documents/application/documents.service.js');
const {PatientDocumentLibraryService}=require('../apps/dental-api/dist/documents/application/document-library.service.js');
const {SupabasePrivateDocumentStorage}=require('../apps/dental-api/dist/documents/infrastructure/supabase-private-document-storage.js');
const storage=new SupabasePrivateDocumentStorage(), documents=new DocumentsService(storage), library=new PatientDocumentLibraryService(storage);
const account=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
const settings=Object.fromEntries(readFileSync('apps/clinic-os/.env.local','utf8').split(/\r?\n/).filter(line=>line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).replace(/^"|"$/g,'')];}));
const key=settings.NEXT_PUBLIC_SUPABASE_ANON_KEY||settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const auth=await fetch(process.env.SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
assert.equal(auth.status,200,'Synthetic manager login');
const session=await auth.json();
const actor={userId:session.user.id,token:session.access_token,clinicId:'10000000-0000-4000-8000-000000000001',roles:['manager']};
const patient='20000000-0000-4000-8000-000000000001';
const bytes=Buffer.alloc(6*1024*1024,32);bytes.write('%PDF-1.7\n% Synthetic transfer verification\n');bytes.write('\n%%EOF',bytes.length-6);
const hash=createHash('sha256').update(bytes).digest('hex');
let item,archived=false;
let originalUpload;
try {
  const requestKey=randomUUID(),input={metadata:{category:'administrative',type:'identity',title:'Transfert privé FICTIF '+randomUUID(),document_date:null,notes:'Synthetic 6 MiB transfer test',related_appointment_id:null},content_type:'application/pdf',size_bytes:bytes.length,sha256:hash,original_name:'synthetic-transfer.pdf'};
  async function transfer() {
    const started=await library.startUpload(actor,patient,input,requestKey);
    originalUpload ??= started;
    const sent=await fetch(started.upload_url,{method:'PUT',headers:{'Content-Type':'application/pdf','cache-control':'0'},body:bytes,redirect:'error'});
    assert.ok(sent.ok,'Direct private staging upload');
    await assert.rejects(library.finishUpload({...actor,userId:randomUUID()},patient,{ticket:started.ticket},requestKey,randomUUID()));
    return library.finishUpload(actor,patient,{ticket:started.ticket},requestKey,randomUUID());
  }
  const result=await transfer();
  item=result.item;
  // Simulate losing the first completion response: reuse its ticket, not a new
  // upload or a new signed URL. This previously failed after staging deletion.
  const recovered=await library.finishUpload(actor,patient,{ticket:originalUpload.ticket},requestKey,randomUUID());
  assert.equal(recovered.item.id,item.id);assert.equal(recovered.replayed,true);
  console.log('PASS lost completion response recovered with original ticket and document id');
  const replay=await transfer();assert.equal(replay.item.id,item.id);assert.equal(replay.replayed,true);
  console.log('PASS direct 6 MiB upload, actor binding and idempotent finalization');
  const ticket=await documents.downloadLink(actor,patient,item.id);
  assert.equal(ticket.expires_in,30);assert.equal(ticket.sha256,hash);
  assert.ok(JSON.stringify(ticket).length<2048,'Small Vercel response');
  const response=await fetch(ticket.url,{cache:'no-store',credentials:'omit',redirect:'error'});
  assert.equal(response.status,200,'Private Storage accepts short-lived capability');
  const downloaded=Buffer.from(await response.arrayBuffer());
  assert.equal(downloaded.length,bytes.length);assert.equal(createHash('sha256').update(downloaded).digest('hex'),hash);
  console.log('PASS private 6 MiB download, exact bytes, small API response');
  await assert.rejects(documents.downloadLink(actor,'20000000-0000-4000-8000-000000000002',item.id));
  await assert.rejects(documents.downloadLink({...actor,clinicId:'10000000-0000-4000-8000-000000000002'},patient,item.id));
  console.log('PASS other patient and other clinic denied');
  await library.archive(actor,patient,item.id,{expected_version:item.version},randomUUID(),randomUUID());archived=true;
  await assert.rejects(documents.downloadLink(actor,patient,item.id));
  console.log('PASS archived document cannot issue a new capability');
  await delay(32000);
  const expired=await fetch(ticket.url,{cache:'no-store',credentials:'omit',redirect:'error'});
  assert.ok(!expired.ok,'Capability expires');
  console.log('PASS signed capability expires after 30 seconds');
} finally {
  try {
    if(item&&!archived)await library.archive(actor,patient,item.id,{expected_version:item.version},randomUUID(),randomUUID());
  } finally {
    const logout=await fetch(process.env.SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`}});
    assert.ok(logout.ok,'Synthetic verifier session revoked');
  }
  // Keep archived bytes under the existing retention policy; no destructive purge.
}
