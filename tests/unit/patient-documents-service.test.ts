import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { createHash } from 'node:crypto';
import { A,STAFF,P1,P2 } from '../fixtures';

const rpc=vi.hoisted(()=>vi.fn());
const upload=vi.hoisted(()=>vi.fn());
const remove=vi.hoisted(()=>vi.fn());
const download=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({
  scopedClient:()=>({rpc,from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{id:P1},error:null})})})})})}),
}));
import { DocumentsService,validateDocumentBytes } from '../../apps/dental-api/src/documents/application/documents.service';

const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['manager' as const]};
const stamp='2026-11-01T10:00:00+00:00';
const originalEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,enabled:process.env.ENABLE_LOCAL_PATIENT_DOCUMENTS,gate:process.env.LOCAL_PATIENT_DOCUMENTS_GATE_KEY};
const storage={upload,remove,download};
function item(id=P2) { return {id,clinic_id:A,patient_id:P1,section:'administrative',category:'identity',document_type:'upload',title:'Carte identité',document_date:'2026-11-01',content_type:'application/pdf',size_bytes:pdf().length,created_at:stamp,created_by:STAFF,finalized_at:stamp,version:1,source:'upload',status:'stored',template_id:null,template_version:null}; }
function pdf() { return Buffer.from('%PDF-1.7\n%%EOF'); }
function setEnabled() { process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-local-key';process.env.ENABLE_LOCAL_PATIENT_DOCUMENTS='true';process.env.LOCAL_PATIENT_DOCUMENTS_GATE_KEY='synthetic-gate'; }

describe('patient document backend service',()=>{
 beforeEach(()=>{rpc.mockReset();upload.mockReset().mockResolvedValue(true);remove.mockReset().mockResolvedValue(undefined);download.mockReset();setEnabled();});
 afterEach(()=>{for(const [key,value] of Object.entries({SUPABASE_URL:originalEnv.url,SUPABASE_SERVICE_ROLE_KEY:originalEnv.key,ENABLE_LOCAL_PATIENT_DOCUMENTS:originalEnv.enabled,LOCAL_PATIENT_DOCUMENTS_GATE_KEY:originalEnv.gate})) if(value===undefined) delete process.env[key];else process.env[key]=value;});

 it('checks actual container signatures and rejects truncated or mislabeled files',()=>{
  expect(validateDocumentBytes(pdf(),'application/pdf')).toBe(true);
  expect(validateDocumentBytes(Buffer.from('%PDF-1.7'),'application/pdf')).toBe(false);
  expect(validateDocumentBytes(Buffer.from([0xff,0xd8,0xff,0xd9]),'image/jpeg')).toBe(true);
  expect(validateDocumentBytes(Buffer.from([0xff,0xd8,0xff,0x00]),'image/jpeg')).toBe(false);
  expect(validateDocumentBytes(Buffer.from('not a png'),'image/png')).toBe(false);
  expect(validateDocumentBytes(pdf(),'image/jpeg')).toBe(false);
 });

 it('registers a scoped upload with an immutable private path and returns only the metadata receipt',async()=>{
  rpc.mockResolvedValueOnce({data:{item:item(),replayed:false},error:null});
  let result; try { result=await new DocumentsService(storage).upload(actor,P1,'administrative','identity',"UTF-8''Carte%20identit%C3%A9",'2026-11-01',{buffer:pdf(),size:pdf().length,mimetype:'application/pdf'},P2,P2); } catch(error) { throw new Error(`${String(error)}; uploadMockCalls=${upload.mock.calls.length}`); }
  expect(result).toEqual({item:item(),replayed:false});
  expect(upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${A}/${P1}/administrative/`)),expect.any(Buffer),'application/pdf');
  expect(rpc).toHaveBeenCalledWith('register_patient_document_upload',expect.objectContaining({p_clinic_id:A,p_patient_id:P1,p_section:'administrative',p_request_key:P2,p_storage_path:expect.stringMatching(new RegExp(`^${A}/${P1}/administrative/`))}));
  expect(remove).not.toHaveBeenCalled();
 });

 it('cleans up an object for an explicit metadata conflict without replacing the original',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:'PT409',message:'private text'}});
  await expect(new DocumentsService(storage).upload(actor,P1,'administrative','identity',"UTF-8''Identity",'2026-11-01',{buffer:pdf(),size:pdf().length,mimetype:'application/pdf'},P2,P2)).rejects.toMatchObject({status:409});
  expect(upload).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${A}/${P1}/administrative/`)));
 });

 it('keeps the uploaded object when the metadata RPC response is lost after a possible commit',async()=>{
  rpc.mockRejectedValueOnce(new Error('connection reset after commit'));
  await expect(new DocumentsService(storage).upload(actor,P1,'administrative','identity',"UTF-8''Identity",'2026-11-01',{buffer:pdf(),size:pdf().length,mimetype:'application/pdf'},P2,P2)).rejects.toMatchObject({status:503});
  expect(upload).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
 });

 it('cleans a temporary duplicate after an idempotent metadata replay',async()=>{
  rpc.mockResolvedValueOnce({data:{item:item(),replayed:true},error:null});
  const result=await new DocumentsService(storage).upload(actor,P1,'administrative','identity',"UTF-8''Identity",'2026-11-01',{buffer:pdf(),size:pdf().length,mimetype:'application/pdf'},P2,P2);
  expect(result.replayed).toBe(true);
  expect(remove).toHaveBeenCalledTimes(1);
 });

 it('proxies private bytes only after metadata scope and integrity checks',async()=>{
  const bytes=pdf(),path=`${A}/${P1}/administrative/${P2}`;
  rpc.mockResolvedValueOnce({data:{kind:'upload',clinic_id:A,patient_id:P1,document_id:P2,content_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),storage_path:path,title:'Identity'},error:null});
  download.mockResolvedValueOnce(bytes);
  const result=await new DocumentsService(storage).content(actor,P1,P2);
  expect(result).toMatchObject({type:'upload',body:bytes,contentType:'application/pdf'});
  expect(download).toHaveBeenCalledWith(path);
  expect(JSON.stringify(result)).not.toContain('signedUrl');
  rpc.mockResolvedValueOnce({data:{kind:'upload',clinic_id:A,patient_id:P2,document_id:P2,content_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),storage_path:`${A}/${P2}/administrative/${P2}`,title:'Foreign'},error:null});
  await expect(new DocumentsService(storage).content(actor,P1,P2)).rejects.toMatchObject({status:503});
  expect(download).toHaveBeenCalledTimes(1);
 });

 it('fails closed when the private object does not match metadata checksum or byte signature',async()=>{
  const bytes=Buffer.from('HTML error page'),path=`${A}/${P1}/administrative/${P2}`;
  rpc.mockResolvedValueOnce({data:{kind:'upload',clinic_id:A,patient_id:P1,document_id:P2,content_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),storage_path:path,title:'Identity'},error:null});
  download.mockResolvedValueOnce(bytes);
  await expect(new DocumentsService(storage).content(actor,P1,P2)).rejects.toMatchObject({status:503});
 });

 it('issues a bounded download capability only after scope, revocation and integrity checks',async()=>{
  const bytes=pdf(),path=`${A}/${P1}/administrative/${P2}`;
  const meta={kind:'upload',clinic_id:A,patient_id:P1,document_id:P2,content_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),storage_path:path,title:'Identity'};
  const signedDownload=vi.fn().mockResolvedValue('https://project.supabase.co/storage/v1/object/sign/patient-documents/'+path+'?token=synthetic');
  const service=new DocumentsService({...storage,signedDownload});
  rpc.mockResolvedValue({data:meta,error:null});download.mockResolvedValue(bytes);
  expect(await service.downloadLink(actor,P1,P2)).toMatchObject({schema_version:1,clinic_id:A,patient_id:P1,document_id:P2,expires_in:30,size_bytes:bytes.length,sha256:meta.sha256});
  expect(signedDownload).toHaveBeenCalledWith(path,30);
  rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}});
  await expect(service.downloadLink(actor,P1,P2)).rejects.toMatchObject({status:403});
  rpc.mockResolvedValueOnce({data:{...meta,patient_id:P2},error:null});
  await expect(service.downloadLink(actor,P1,P2)).rejects.toMatchObject({status:503});
  download.mockResolvedValueOnce(Buffer.from('corrupt'));
  await expect(service.downloadLink(actor,P1,P2)).rejects.toMatchObject({status:503});
  expect(signedDownload).toHaveBeenCalledTimes(1);
 });

 it('keeps the feature default-off outside local development',async()=>{
  process.env.SUPABASE_URL='https://example.supabase.co';
  await expect(new DocumentsService(storage).list(actor,P1,'administrative')).rejects.toMatchObject({status:503});
  expect(rpc).not.toHaveBeenCalled();
 });

 it('grants managers clinical import capabilities without clinical authoring capabilities',async()=>{
  const manager={...actor,roles:['manager' as const]};
  rpc.mockResolvedValueOnce({data:{schema_version:1,clinic_id:A,patient_id:P1,section:'clinical',items:[],next_cursor:null},error:null});
  const list=await new DocumentsService(storage).list(manager,P1,'clinical');
  expect(list.capabilities).toMatchObject({can_read_clinical:true,can_upload_clinical:true,can_create_report:false,can_create_prescription:false,can_edit_draft:false,can_validate:false});
  expect(list.capabilities.categories).toContain('radiograph');
  await expect(new DocumentsService(storage).templates(manager,P1,'report')).rejects.toMatchObject({status:403});
  const body={type:'report',template_id:P2,template_version:1,title:'Compte rendu vierge',document_date:'2026-11-01',content:{body:''}};
  await expect(new DocumentsService(storage).createDraft(manager,P1,body,P2,P2)).rejects.toMatchObject({status:403});
  expect(rpc).toHaveBeenCalledTimes(1);
 });

 it('allows a manager to upload and proxy an imported clinical file',async()=>{
  const manager={...actor,roles:['manager' as const]};
  const clinicalItem={...item(),section:'clinical',category:'radiograph'};
  rpc.mockResolvedValueOnce({data:{item:clinicalItem,replayed:false},error:null});
  const result=await new DocumentsService(storage).upload(manager,P1,'clinical','radiograph',"UTF-8''Radio%20fictive",'2026-11-01',{buffer:pdf(),size:pdf().length,mimetype:'application/pdf'},P2,P2);
  expect(result.item).toMatchObject({section:'clinical',category:'radiograph',status:'stored'});

  const bytes=pdf(),path=`${A}/${P1}/clinical/${P2}`;
  rpc.mockResolvedValueOnce({data:{kind:'upload',clinic_id:A,patient_id:P1,document_id:P2,content_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),storage_path:path,title:'Radio fictive'},error:null});
  download.mockResolvedValueOnce(bytes);
  expect(await new DocumentsService(storage).content(manager,P1,P2)).toMatchObject({type:'upload',contentType:'application/pdf'});
 });

 it('denies assistants prescription draft creation before calling SQL',async()=>{
  const assistant={...actor,roles:['assistant' as const]};
  const body={type:'prescription',template_id:P2,template_version:1,title:'Ordonnance vierge',document_date:'2026-11-01',content:{body:''}};
  await expect(new DocumentsService(storage).createDraft(assistant,P1,body,P2,P2)).rejects.toMatchObject({status:403});
  expect(rpc).not.toHaveBeenCalled();
 });
});
