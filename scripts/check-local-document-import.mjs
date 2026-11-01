import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const settings = Object.fromEntries(readFileSync('apps/clinic-os/.env.local','utf8').split(/\r?\n/).filter(line=>line.includes('=')).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1).replace(/^"|"$/g,'')];}));
const anon = settings.NEXT_PUBLIC_SUPABASE_ANON_KEY || settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(anon);
const access=JSON.parse(readFileSync('.local/document-demo-access.json','utf8'));
const owner=JSON.parse(readFileSync('.local/owner-demo-access.json','utf8'));
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0xkAAAAASUVORK5CYII=','base64');
for(const account of [...access.accounts,{...owner,role:'manager'}]) {
 const login=await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});assert.equal(login.status,200,'Local login');const session=await login.json();
 const root='http://127.0.0.1:4300/api/v1/patients/20000000-0000-4000-8000-000000000001/documents';
 const headers={Authorization:'Bearer '+session.access_token,'X-Clinic-Id':access.clinicId};const key=randomUUID();
 const upload=async()=>{const form=new globalThis.FormData();form.set('file',new globalThis.Blob([bytes],{type:'image/png'}),'fictif.png');return fetch(root+'/uploads',{method:'POST',headers:{...headers,'Idempotency-Key':key,'X-Document-Section':'clinical','X-Document-Category':'radiograph','X-Document-Date':'2026-11-01','X-Document-Title':"UTF-8''"+encodeURIComponent('Import technique FICTIF '+account.role)},body:form});};
 const r=await upload();assert.equal(r.status,201,'Upload '+account.role);const receipt=await r.json();
 const repeat=await upload();assert.equal(repeat.status,201);assert.equal((await repeat.json()).item.id,receipt.item.id);
 const download=await fetch(root+'/'+receipt.item.id+'/content',{headers});assert.equal(download.status,200);assert(Buffer.from(await download.arrayBuffer()).equals(bytes),'Content bytes must match original for '+account.role);
 const foreign=await fetch(root.replace('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000099')+'?section=clinical',{headers});assert.equal(foreign.status,404);
 console.log(account.role+': real Storage import, exact retry, original byte download and inaccessible patient denial PASS');
 await fetch('http://127.0.0.1:54321/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+session.access_token}});
}
