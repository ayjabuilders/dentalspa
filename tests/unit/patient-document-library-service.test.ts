import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { A,STAFF,P1,P2 } from '../fixtures';

const rpc=vi.hoisted(()=>vi.fn());
const storageUpload=vi.hoisted(()=>vi.fn());
const storageRemove=vi.hoisted(()=>vi.fn());
const storageDownload=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({
  scopedClient:()=>({rpc,from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{id:P1},error:null})})})})})}),
}));
import { PatientDocumentLibraryService } from '../../apps/dental-api/src/documents/application/document-library.service';
import { createHash } from 'node:crypto';
import { openUploadTicket, sealUploadTicket } from '../../apps/dental-api/src/documents/application/document-upload-ticket';

const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['manager' as const]};
const stamp='2026-11-01T10:00:00+00:00';
const pdf=()=>Buffer.from('%PDF-1.7\n%%EOF');
const baseItem={id:P2,clinic_id:A,patient_id:P1,category:'imaging',type:'legacy_unspecified',title:'scan.pdf',document_date:null,notes:'',related_appointment_id:null,content_type:'application/pdf',size_bytes:pdf().length,created_at:stamp,uploaded_by:'Manager Salma',version:1,can_edit:true,can_delete:true};
const receipt={item:baseItem,replayed:false};
const storage={upload:storageUpload,remove:storageRemove,download:storageDownload};
const originalEnv={url:process.env.SUPABASE_URL,enabled:process.env.ENABLE_LOCAL_PATIENT_DOCUMENTS,gate:process.env.LOCAL_PATIENT_DOCUMENTS_GATE_KEY};
function setEnabled(){process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.ENABLE_LOCAL_PATIENT_DOCUMENTS='true';process.env.LOCAL_PATIENT_DOCUMENTS_GATE_KEY='synthetic-gate';}

describe('patient document library service',()=>{
 const service=new PatientDocumentLibraryService(storage);
 beforeEach(()=>{setEnabled();rpc.mockReset();storageUpload.mockReset().mockResolvedValue(true);storageRemove.mockReset().mockResolvedValue(undefined);storageDownload.mockReset();});
 afterEach(()=>{for(const [key,value] of Object.entries({SUPABASE_URL:originalEnv.url,ENABLE_LOCAL_PATIENT_DOCUMENTS:originalEnv.enabled,LOCAL_PATIENT_DOCUMENTS_GATE_KEY:originalEnv.gate})) if(value===undefined) delete process.env[key]; else process.env[key]=value;});

 it('binds direct upload tickets to actor, patient, key, expiry and verified bytes',async()=>{
  const signedUpload=vi.fn().mockResolvedValue('http://127.0.0.1:54321/storage/v1/object/upload/sign/patient-documents/_staging/1/00000000-0000-4000-8000-000000000000?token=test');
  const direct=new PatientDocumentLibraryService({...storage,signedUpload});
  rpc.mockImplementation(async(name:string)=>({data:name==='read_patient_document_library_options'?{clinic_id:A,patient_id:P1,categories:[],appointments:[]}:receipt,error:null}));
  const input={metadata:{category:'imaging',type:'legacy_unspecified',title:'',document_date:null,notes:'',related_appointment_id:null},original_name:'scan.pdf',content_type:'application/pdf',size_bytes:pdf().length,sha256:createHash('sha256').update(pdf()).digest('hex')};
  const issued=await direct.startUpload(actor,P1,input,P2);
  const opened=openUploadTicket(issued.ticket,'synthetic-gate')!;
  expect(opened.user_id).toBe(STAFF);expect(issued.ticket).not.toContain('scan.pdf');
  expect(openUploadTicket(issued.ticket,'wrong-key')).toBeNull();
  expect(openUploadTicket(issued.ticket,'synthetic-gate',opened.expires_at)).toBeNull();
  expect(openUploadTicket(issued.ticket.slice(0,-5)+'ABCDE','synthetic-gate')).toBeNull();
  await expect(direct.finishUpload({...actor,userId:P2},P1,{ticket:issued.ticket},P2,P2)).rejects.toMatchObject({status:403});
  await expect(direct.finishUpload(actor,P2,{ticket:issued.ticket},P2,P2)).rejects.toMatchObject({status:403});
  await expect(direct.finishUpload(actor,P1,{ticket:issued.ticket},P1,P2)).rejects.toMatchObject({status:403});
  expect(storageDownload).not.toHaveBeenCalled();
  storageDownload.mockResolvedValueOnce(Buffer.from('invalid'));
  await expect(direct.finishUpload(actor,P1,{ticket:issued.ticket},P2,P2)).rejects.toMatchObject({status:400});
  expect(storageUpload).not.toHaveBeenCalled();
  storageDownload.mockResolvedValueOnce(pdf());
  expect(await direct.finishUpload(actor,P1,{ticket:issued.ticket},P2,P2)).toEqual(receipt);
  expect(storageUpload.mock.calls[0]![0]).not.toContain('_staging');
  expect(storageRemove).not.toHaveBeenCalledWith(opened.path);
  const expired=sealUploadTicket({...opened,expires_at:Date.now()-1},'synthetic-gate');
  await expect(direct.finishUpload(actor,P1,{ticket:expired},P2,P2)).rejects.toMatchObject({status:403});
 });

 it('recovers a lost completion receipt using the original ticket without another document',async()=>{
  const objects=new Map<string,Buffer>();
  const upload=vi.fn(async(path:string,bytes:Buffer)=>{objects.set(path,bytes);return true;});
  const remove=vi.fn(async(path:string)=>{objects.delete(path);});
  const download=vi.fn(async(path:string)=>objects.get(path)??null);
  const direct=new PatientDocumentLibraryService({upload,remove,download,signedUpload:vi.fn().mockResolvedValue('https://storage.example.test/synthetic')});
  let registered=false;
  rpc.mockImplementation(async(name:string)=>{
   if(name==='read_patient_document_library_options')return {data:{clinic_id:A,patient_id:P1,categories:[],appointments:[]},error:null};
   const replayed=registered;registered=true;return {data:{...receipt,replayed},error:null};
  });
  const input={metadata:{category:'imaging',type:'legacy_unspecified',title:'',document_date:null,notes:'',related_appointment_id:null},original_name:'scan.pdf',content_type:'application/pdf',size_bytes:pdf().length,sha256:createHash('sha256').update(pdf()).digest('hex')};
  const issued=await direct.startUpload(actor,P1,input,P2);
  const opened=openUploadTicket(issued.ticket,'synthetic-gate')!;
  objects.set(opened.path,pdf());
  const original=await direct.finishUpload(actor,P1,{ticket:issued.ticket},P2,P2);
  // Simulate the browser not receiving the original response.
  const recovered=await direct.finishUpload(actor,P1,{ticket:issued.ticket},P2,P2);
  expect(recovered).toEqual({...original,replayed:true});
  expect(objects.has(opened.path)).toBe(true);
  expect([...objects.keys()].filter(path=>!path.startsWith('_staging/'))).toHaveLength(1);
  expect(remove).not.toHaveBeenCalledWith(opened.path);
  rpc.mockResolvedValue({data:null,error:{code:'42501'}});
  download.mockClear();
  await expect(direct.finishUpload(actor,P1,{ticket:issued.ticket},P2,P2)).rejects.toMatchObject({status:403});
  expect(download).not.toHaveBeenCalled();
 });

 it('checks live database permission before signing or consuming a staging object',async()=>{
  const signedUpload=vi.fn(),direct=new PatientDocumentLibraryService({...storage,signedUpload});
  const input={metadata:{category:'imaging',type:'legacy_unspecified',title:'',document_date:null,notes:'',related_appointment_id:null},original_name:'scan.pdf',content_type:'application/pdf',size_bytes:pdf().length,sha256:createHash('sha256').update(pdf()).digest('hex')};
  rpc.mockResolvedValue({data:null,error:{code:'42501'}});
  await expect(direct.startUpload(actor,P1,input,P2)).rejects.toMatchObject({status:403});
  expect(signedUpload).not.toHaveBeenCalled();
  const ticket=sealUploadTicket({version:1,user_id:STAFF,clinic_id:A,patient_id:P1,request_key:P2,expires_at:Date.now()+100000,path:`_staging/1/${P2}`,input:input as Parameters<typeof sealUploadTicket>[0]['input']},'synthetic-gate');
  await expect(direct.finishUpload(actor,P1,{ticket},P2,P2)).rejects.toMatchObject({status:403});
  expect(storageDownload).not.toHaveBeenCalled();
 });

 it('returns catalog and appointment options only after scope and schema validation',async()=>{
  rpc.mockResolvedValue({data:{clinic_id:A,patient_id:P1,categories:[{id:'administrative',label:'Admin',section:'administrative',types:[{id:'identity',label:'ID'}]},{id:'imaging',label:'Imaging',section:'clinical',types:[{id:'legacy_unspecified',label:'Type non précisé'}]}],appointments:[{id:P2,label:'2026-11-01 10:00'}]},error:null});
  const result=await service.options({...actor,roles:['reception']},P1);
  expect(result.categories.map(item=>item.id)).toEqual(['administrative']);
  expect(result.appointments).toEqual([{id:P2,label:'2026-11-01 10:00'}]);
  expect(rpc).toHaveBeenCalledWith('read_patient_document_library_options',{p_clinic_id:A,p_patient_id:P1,p_gate:'synthetic-gate'});
  rpc.mockResolvedValueOnce({data:{clinic_id:P2,patient_id:P1,categories:[],appointments:[]},error:null});
  await expect(service.options(actor,P1)).rejects.toMatchObject({status:503});
 });

 it('passes literal search/category/cursor and validates tenant-scoped items',async()=>{
  const list={clinic_id:A,patient_id:P1,items:[baseItem],next_cursor:null};rpc.mockResolvedValue({data:list,error:null});
  expect(await service.list(actor,P1,'%','imaging')).toEqual(list);
  expect(rpc).toHaveBeenCalledWith('list_patient_document_library',{p_clinic_id:A,p_patient_id:P1,p_category:'imaging',p_query:'%',p_cursor:null,p_gate:'synthetic-gate',p_section:null});
  await service.list(actor,P1,undefined,undefined,undefined,'clinical');
  expect(rpc).toHaveBeenLastCalledWith('list_patient_document_library',{p_clinic_id:A,p_patient_id:P1,p_category:null,p_query:null,p_cursor:null,p_gate:'synthetic-gate',p_section:'clinical'});
  await expect(service.list(actor,P1,undefined,'imaging',undefined,'administrative')).rejects.toMatchObject({status:400});
  await expect(service.list({...actor,roles:['reception']},P1,undefined,'imaging')).rejects.toMatchObject({status:400});
  rpc.mockResolvedValueOnce({data:{...list,patient_id:P2},error:null});
  await expect(service.list(actor,P1)).rejects.toMatchObject({status:503});
 });

 it('uploads each private file with catalog metadata atomically and a safe basename fallback',async()=>{
  rpc.mockResolvedValueOnce({data:receipt,error:null});
  const result=await service.upload(actor,P1,JSON.stringify({category:'imaging',type:'legacy_unspecified',title:'',document_date:null,notes:'',related_appointment_id:null}),{buffer:pdf(),size:pdf().length,mimetype:'application/pdf',originalname:'../../scan.pdf'},P2,P2);
  expect(result).toEqual(receipt);
  expect(storageUpload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${A}/${P1}/clinical/[0-9a-f-]+$`)),expect.any(Buffer),'application/pdf');
  expect(rpc).toHaveBeenCalledWith('register_patient_document_library_upload',expect.objectContaining({p_category:'imaging',p_type:'legacy_unspecified',p_title:'scan.pdf',p_document_date:null,p_notes:'',p_original_file_name:'scan.pdf',p_request_key:P2,p_storage_path:expect.stringMatching(new RegExp(`^${A}/${P1}/clinical/`))}));
  expect(JSON.stringify(result)).not.toContain('signedUrl');
  expect(storageRemove).not.toHaveBeenCalled();
 });

 it('rejects invalid signatures and unauthorized clinical uploads before Storage',async()=>{
  await expect(service.upload(actor,P1,{category:'imaging',type:'legacy_unspecified',title:'x',document_date:null,notes:'',related_appointment_id:null},{buffer:Buffer.from('not pdf'),size:7,mimetype:'application/pdf',originalname:'x.pdf'},P2,P2)).rejects.toMatchObject({status:400});
  await expect(service.upload({...actor,roles:['reception']},P1,{category:'imaging',type:'legacy_unspecified',title:'x',document_date:null,notes:'',related_appointment_id:null},{buffer:pdf(),size:pdf().length,mimetype:'application/pdf',originalname:'x.pdf'},P2,P2)).rejects.toMatchObject({status:403});
  expect(storageUpload).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 });

 it('cleans only on a definite registration rejection and preserves uncertain commit objects',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:'PT409'}});
  await expect(service.upload(actor,P1,{category:'imaging',type:'legacy_unspecified',title:'x',document_date:null,notes:'',related_appointment_id:null},{buffer:pdf(),size:pdf().length,mimetype:'application/pdf',originalname:'x.pdf'},P2,P2)).rejects.toMatchObject({status:409});
  expect(storageRemove).toHaveBeenCalledTimes(1);
  storageRemove.mockClear();rpc.mockRejectedValueOnce(new Error('network lost after possible commit'));
  await expect(service.upload(actor,P1,{category:'imaging',type:'legacy_unspecified',title:'x',document_date:null,notes:'',related_appointment_id:null},{buffer:pdf(),size:pdf().length,mimetype:'application/pdf',originalname:'x.pdf'},P2,P2)).rejects.toMatchObject({status:503});
  expect(storageRemove).not.toHaveBeenCalled();
 });

 it('removes a duplicate staged object on exact upload replay',async()=>{
  rpc.mockResolvedValueOnce({data:{item:baseItem,replayed:true},error:null});
  const result=await service.upload(actor,P1,{category:'imaging',type:'legacy_unspecified',title:'scan.pdf',document_date:null,notes:'',related_appointment_id:null},{buffer:pdf(),size:pdf().length,mimetype:'application/pdf',originalname:'scan.pdf'},P2,P2);
  expect(result.replayed).toBe(true);expect(storageRemove).toHaveBeenCalledTimes(1);
 });

 it('uses CAS and idempotency receipts for metadata edits and soft archives without deleting bytes',async()=>{
  rpc.mockResolvedValueOnce({data:{item:{...baseItem,version:2},replayed:false},error:null});
  const edited=await service.update(actor,P1,P2,{expected_version:1,metadata:{category:'reports',type:'legacy_unspecified',title:'',document_date:null,notes:'note',related_appointment_id:null}},P2,P2);
  expect(edited.item.version).toBe(2);
  expect(rpc).toHaveBeenCalledWith('update_patient_document_library_metadata',expect.objectContaining({p_expected_version:1,p_document_id:P2,p_category:'reports',p_type:'legacy_unspecified',p_request_key:P2}));
  rpc.mockResolvedValueOnce({data:{id:P2,clinic_id:A,patient_id:P1,deleted:true,replayed:false},error:null});
  expect(await service.archive(actor,P1,P2,{expected_version:2},'50000000-0000-4000-8000-000000000001',P2)).toMatchObject({deleted:true,replayed:false});
  expect(rpc).toHaveBeenLastCalledWith('archive_patient_document_library_item',expect.objectContaining({p_expected_version:2,p_document_id:P2}));
  expect(storageRemove).not.toHaveBeenCalled();
 });

 it('fails closed when a successful-looking command receipt escapes the requested patient',async()=>{
  rpc.mockResolvedValueOnce({data:{item:{...baseItem,patient_id:P2},replayed:false},error:null});
  await expect(service.update(actor,P1,P2,{expected_version:1,metadata:{category:'reports',type:'legacy_unspecified',title:'x',document_date:null,notes:'',related_appointment_id:null}},P2,P2)).rejects.toMatchObject({status:503});
 });
});
