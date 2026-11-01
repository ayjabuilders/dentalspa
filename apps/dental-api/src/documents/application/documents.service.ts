import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import {
  CreatePatientDocumentDraftSchema, PatientDocumentContentSchema, PatientDocumentDraftListSchema,
  PatientDocumentDraftReceiptSchema, PatientDocumentDraftSchema, PatientDocumentDraftVersionsSchema,
  PatientDocumentListSchema, PatientDocumentTemplatesSchema, PatientDocumentUploadReceiptSchema,
  UpdatePatientDocumentDraftSchema, ValidatePatientDocumentDraftSchema,
} from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access.js';
import { scopedClient } from '../../identity/infrastructure/supabase.js';
import { documentsActivationKey } from '../../identity/infrastructure/module-activation.js';
import { PRIVATE_DOCUMENT_STORAGE, type PrivateDocumentStorage } from '../domain/private-document-storage.js';

const ID = z.uuid();
const titleDecode = (value: string) => {
  const match = /^UTF-8''(.+)$/i.exec(value);
  if (!match?.[1]) throw new BadRequestException('Invalid document title');
  try { return decodeURIComponent(match[1]).normalize('NFC').trim(); } catch { throw new BadRequestException('Invalid document title'); }
};
const CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX_BYTES = 20 * 1024 * 1024;
type Section = 'administrative' | 'clinical';
type DocType = 'report' | 'prescription';
type UploadFile = { buffer: Buffer; size: number; mimetype: string };

export function validateDocumentBytes(bytes: Buffer, contentType: string): boolean {
  if (!bytes.length || bytes.length > MAX_BYTES) return false;
  if (contentType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.subarray(Math.max(0,bytes.length-1024)).includes(Buffer.from('%%EOF'));
  if (contentType === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length-2]===0xff && bytes[bytes.length-1]===0xd9;
  if (contentType === 'image/png') return bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.subarray(12,16).toString('ascii')==='IHDR' && bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0 && bytes.subarray(bytes.length-8,bytes.length-4).toString('ascii')==='IEND';
  return false;
}

@Injectable()
export class DocumentsService {
  constructor(@Inject(PRIVATE_DOCUMENT_STORAGE) private readonly storage:PrivateDocumentStorage) {}
  private gateKey() {
    const key = documentsActivationKey();
    if (!key) throw new ServiceUnavailableException({statusCode:503,code:'patient_documents_disabled',message:'Patient documents are not enabled for this environment'});
    return key;
  }
  private caps(actor: Actor) {
    const admin = actor.roles.length > 0;
    const clinical = actor.roles.some(role => role === 'dentist' || role === 'assistant' || role === 'manager');
    const clinicalAuthor = actor.roles.some(role => role === 'dentist' || role === 'assistant');
    const dentist = actor.roles.includes('dentist');
    const categories=[...(admin?['identity','insurance','cnss','cnops','other']:[]),...(clinical?['report','prescription','clinical_record','radiograph','clinical_photo','lab_result','care_consent','other']:[])];
    return { can_read_administrative:admin, can_read_clinical:clinical, can_read:admin||clinical, can_upload:admin||clinical,
      can_upload_administrative:admin, can_upload_clinical:clinical, can_create_report:clinicalAuthor, can_create_prescription:dentist, can_edit_draft:clinicalAuthor,
      can_edit_report:clinicalAuthor, can_edit_prescription:dentist,
      can_validate:dentist, categories:[...new Set(categories)] };
  }
  private permit(actor: Actor, section: Section) {
    if (section === 'administrative' && !actor.roles.length) throw new ForbiddenException('Administrative document access denied');
    if (section === 'clinical' && !actor.roles.some(role=>role==='dentist'||role==='assistant'||role==='manager')) throw new ForbiddenException('Clinical document access denied');
  }
  private permitClinicalAuthoring(actor:Actor) {
    if(!actor.roles.some(role=>role==='dentist'||role==='assistant')) throw new ForbiddenException('Clinical authoring access denied');
  }
  private async rpc(actor: Actor, functionName: string, parameters: Record<string, unknown>) {
    let result: {data:unknown;error:{code?:string}|null};
    try { result = await scopedClient(actor.token).rpc(functionName,parameters); }
    catch { throw new ServiceUnavailableException('Patient documents unavailable'); }
    if (result.error) {
      const code = result.error.code ?? '';
      const reject=(error:Error):never=>{Object.assign(error,{metadataCommitRejected:true});throw error;};
      if (['28000','PGRST301','PGRST302'].includes(code)) return reject(new UnauthorizedException('Authentication required'));
      if (code==='42501') return reject(new ForbiddenException('Patient document scope denied'));
      if (code==='PT404') return reject(new NotFoundException('Patient document unavailable'));
      if (code==='PT409') return reject(new ConflictException('Document changed; refresh before saving'));
      if (['22023','22P02','22P05'].includes(code)) return reject(new BadRequestException('Invalid patient document request'));
      if (code==='PT503') return reject(new ServiceUnavailableException({statusCode:503,code:'patient_documents_disabled',message:'Patient documents are not enabled for this environment'}));
      // Unknown PostgREST/transport errors do not prove that the transaction rolled back.
      throw new ServiceUnavailableException('Patient documents unavailable');
    }
    return result.data;
  }
  private ids(actor: Actor, patientId: string, correlationId?: string) {
    this.gateKey();
    if (!ID.safeParse(patientId).success) throw new BadRequestException('Invalid patient');
    if (correlationId && !ID.safeParse(correlationId).success) throw new BadRequestException('Invalid correlation');
  }
  private capabilities(actor: Actor) { return this.caps(actor); }

  async list(actor: Actor, patientId: string, section: Section, query?: string, cursor?: string) {
    this.ids(actor,patientId); this.permit(actor,section);
    if (query !== undefined && (query.length > 100 || query.trim() !== query)) throw new BadRequestException('Invalid document search');
    const raw=await this.rpc(actor,'list_patient_documents',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_section:section,p_query:query??null,p_cursor:cursor??null,p_limit:10,p_gate:this.gateKey()});
    const parsed=PatientDocumentListSchema.safeParse(raw && typeof raw==='object'?{...raw as object,capabilities:this.capabilities(actor)}:raw);
    if (!parsed.success || parsed.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase() || parsed.data.patient_id.toLowerCase()!==patientId.toLowerCase()) throw new ServiceUnavailableException('Patient documents unavailable');
    return {...parsed.data,capabilities:this.capabilities(actor)};
  }
  async templates(actor: Actor, patientId: string, type: DocType) {
    this.ids(actor,patientId); this.permitClinicalAuthoring(actor);
    const parsed=PatientDocumentTemplatesSchema.safeParse(await this.rpc(actor,'read_patient_document_templates',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_type:type,p_gate:this.gateKey()}));
    if (!parsed.success || parsed.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase() || parsed.data.patient_id.toLowerCase()!==patientId.toLowerCase()) throw new ServiceUnavailableException('Document templates unavailable');
    return parsed.data;
  }
  async upload(actor: Actor, patientId: string, section: Section, category: string, titleHeader: string, documentDate: string, file: UploadFile|undefined, requestKey: string, correlationId: string) {
    this.ids(actor,patientId,correlationId); this.permit(actor,section);
    if (!file || !ID.safeParse(requestKey).success || file.size!==file.buffer.byteLength || !CONTENT_TYPES.includes(file.mimetype as typeof CONTENT_TYPES[number]) || !validateDocumentBytes(file.buffer,file.mimetype)) throw new BadRequestException('Unsupported or invalid document file');
    const title=titleDecode(titleHeader);
    if (!title || title.length>160 || !z.iso.date().safeParse(documentDate).success) throw new BadRequestException('Invalid document metadata');
    const expectedCategories=section==='administrative'?['identity','insurance','cnss','cnops','other']:['report','prescription','clinical_record','radiograph','clinical_photo','lab_result','care_consent','other'];
    if (!expectedCategories.includes(category)) throw new BadRequestException('Invalid document category');
    // Confirm patient scope through the user JWT before any privileged Storage call.
    const {data:patient,error}=await scopedClient(actor.token).from('patients').select('id').eq('clinic_id',actor.clinicId).eq('id',patientId).maybeSingle();
    if (error) throw new ServiceUnavailableException('Patient record unavailable');
    if (!patient) throw new NotFoundException('Patient document unavailable');
    const id=randomUUID(), path=`${actor.clinicId}/${patientId}/${section}/${id}`;
    const sha256=createHash('sha256').update(file.buffer).digest('hex');
    if(!await this.storage.upload(path,file.buffer,file.mimetype)) throw new ServiceUnavailableException('Private document upload failed');
    try {
      const data=await this.rpc(actor,'register_patient_document_upload',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_id:id,p_section:section,p_category:category,p_title:title,p_document_date:documentDate,p_content_type:file.mimetype,p_size_bytes:file.size,p_sha256:sha256,p_storage_path:path,p_request_key:requestKey,p_correlation_id:correlationId,p_gate:this.gateKey()});
      const parsed=PatientDocumentUploadReceiptSchema.safeParse(data);
      if (!parsed.success || parsed.data.item.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase() || parsed.data.item.patient_id.toLowerCase()!==patientId.toLowerCase()) throw new ServiceUnavailableException('Document receipt unavailable');
      if (parsed.data.replayed && parsed.data.item.id!==id) await this.storage.remove(path).catch(()=>undefined);
      return parsed.data;
    } catch (error) {
      // Network loss or malformed acknowledgement can happen after PostgreSQL
      // committed. Keep the object unless the RPC returned a definite SQL rejection.
      if(error&&typeof error==='object'&&'metadataCommitRejected' in error&&(error as {metadataCommitRejected?:unknown}).metadataCommitRejected===true) await this.storage.remove(path).catch(()=>undefined);
      throw error;
    }
  }
  async content(actor:Actor,patientId:string,documentId:string) {
    this.ids(actor,patientId);
    if (!ID.safeParse(documentId).success) throw new BadRequestException('Invalid document');
    const value=await this.rpc(actor,'read_patient_document_content',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_document_id:documentId,p_gate:this.gateKey()});
    if (!value || typeof value!=='object' || !('kind' in value)) throw new ServiceUnavailableException('Document content unavailable');
    if (value.kind==='generated') {
      const parsed=PatientDocumentContentSchema.safeParse(value);
      if (!parsed.success || parsed.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase() || parsed.data.patient_id.toLowerCase()!==patientId.toLowerCase()) throw new ServiceUnavailableException('Document content unavailable');
      return {type:'generated' as const, body:parsed.data};
    }
    const meta=z.object({kind:z.literal('upload'),clinic_id:ID,patient_id:ID,document_id:ID,content_type:z.enum(CONTENT_TYPES),size_bytes:z.number().int().min(1).max(MAX_BYTES),sha256:z.string().regex(/^[0-9a-f]{64}$/),storage_path:z.string().min(1).max(200),title:z.string().min(1).max(160)}).safeParse(value);
    if (!meta.success || meta.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase() || meta.data.patient_id.toLowerCase()!==patientId.toLowerCase() || !['administrative','clinical'].includes(sectionFrom(meta.data.storage_path)) || meta.data.storage_path!==`${actor.clinicId}/${patientId}/${sectionFrom(meta.data.storage_path)}/${documentId}`) throw new ServiceUnavailableException('Document content unavailable');
    const bytes=await this.storage.download(meta.data.storage_path);
    if (!bytes) throw new ServiceUnavailableException('Document content unavailable');
    if (bytes.length!==meta.data.size_bytes || createHash('sha256').update(bytes).digest('hex')!==meta.data.sha256 || !validateDocumentBytes(bytes,meta.data.content_type)) throw new ServiceUnavailableException('Document content unavailable');
    return {type:'upload' as const,body:bytes,contentType:meta.data.content_type,title:meta.data.title,storagePath:meta.data.storage_path,sha256:meta.data.sha256};
  }
  async downloadLink(actor:Actor,patientId:string,documentId:string) {
    // Reuse current membership/patient/archive checks and integrity verification.
    // The large object stays off the Function response; only a 30-second capability leaves it.
    const value=await this.content(actor,patientId,documentId);
    if(value.type!=='upload') throw new BadRequestException('Only uploaded files support direct downloads');
    if(!this.storage.signedDownload) throw new ServiceUnavailableException('Private download unavailable');
    const url=await this.storage.signedDownload(value.storagePath,30);
    if(!url) throw new ServiceUnavailableException('Private download unavailable');
    return {schema_version:1 as const,clinic_id:actor.clinicId,patient_id:patientId,document_id:documentId,
      url,expires_in:30 as const,content_type:value.contentType,size_bytes:value.body.length,sha256:value.sha256};
  }
  async createDraft(actor:Actor,patientId:string,body:unknown,requestKey:string,correlationId:string) {
    this.ids(actor,patientId,correlationId); const payload=CreatePatientDocumentDraftSchema.safeParse(body);
    if (!payload.success || !ID.safeParse(requestKey).success) throw new BadRequestException('Invalid clinical document draft');
    this.permitClinicalAuthoring(actor); if(payload.data.type==='prescription'&&!actor.roles.includes('dentist')) throw new ForbiddenException('Only a dentist may edit prescription content');
    const parsed=PatientDocumentDraftReceiptSchema.safeParse(await this.rpc(actor,'create_patient_document_draft',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_payload:payload.data,p_request_key:requestKey,p_correlation_id:correlationId,p_gate:this.gateKey()}));
    if(!parsed.success||parsed.data.draft.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||parsed.data.draft.patient_id.toLowerCase()!==patientId.toLowerCase()) throw new ServiceUnavailableException('Draft receipt unavailable'); return parsed.data;
  }
  async draft(actor:Actor,patientId:string,draftId:string) {
    this.ids(actor,patientId); if(!ID.safeParse(draftId).success) throw new BadRequestException('Invalid draft'); this.permitClinicalAuthoring(actor);
    const parsed=PatientDocumentDraftSchema.safeParse(await this.rpc(actor,'read_patient_document_draft',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_draft_id:draftId,p_gate:this.gateKey()}));
    if(!parsed.success||parsed.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||parsed.data.patient_id.toLowerCase()!==patientId.toLowerCase()) throw new ServiceUnavailableException('Draft unavailable'); return parsed.data;
  }
  async draftVersions(actor:Actor,patientId:string,draftId:string) {
    this.ids(actor,patientId); if(!ID.safeParse(draftId).success) throw new BadRequestException('Invalid draft'); this.permitClinicalAuthoring(actor);
    const parsed=PatientDocumentDraftVersionsSchema.safeParse(await this.rpc(actor,'list_patient_document_draft_versions',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_draft_id:draftId,p_gate:this.gateKey()}));
    if(!parsed.success||parsed.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||parsed.data.patient_id.toLowerCase()!==patientId.toLowerCase()||parsed.data.draft_id.toLowerCase()!==draftId.toLowerCase()) throw new ServiceUnavailableException('Draft history unavailable'); return parsed.data;
  }
  async listDrafts(actor:Actor,patientId:string,type:DocType|undefined,query:string|undefined,cursor:string|undefined) {
    this.ids(actor,patientId); this.permitClinicalAuthoring(actor); if(query&&query.length>100) throw new BadRequestException('Invalid draft search');
    const raw=await this.rpc(actor,'list_patient_document_drafts',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_type:type??null,p_query:query??null,p_cursor:cursor??null,p_gate:this.gateKey()});
    const parsed=PatientDocumentDraftListSchema.safeParse(raw && typeof raw==='object'?{...raw as object,capabilities:this.capabilities(actor)}:raw);
    if(!parsed.success||parsed.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||parsed.data.patient_id.toLowerCase()!==patientId.toLowerCase()) throw new ServiceUnavailableException('Drafts unavailable'); return {...parsed.data,capabilities:this.capabilities(actor)};
  }
  async updateDraft(actor:Actor,patientId:string,draftId:string,body:unknown,requestKey:string,correlationId:string) {
    this.ids(actor,patientId,correlationId); if(!ID.safeParse(draftId).success||!ID.safeParse(requestKey).success) throw new BadRequestException('Invalid draft'); const payload=UpdatePatientDocumentDraftSchema.safeParse(body); if(!payload.success) throw new BadRequestException('Invalid draft update');
    this.permitClinicalAuthoring(actor);
    const parsed=PatientDocumentDraftReceiptSchema.safeParse(await this.rpc(actor,'update_patient_document_draft',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_draft_id:draftId,p_payload:payload.data,p_request_key:requestKey,p_correlation_id:correlationId,p_gate:this.gateKey()})); if(!parsed.success) throw new ServiceUnavailableException('Draft receipt unavailable'); return parsed.data;
  }
  async validateDraft(actor:Actor,patientId:string,draftId:string,body:unknown,requestKey:string,correlationId:string) {
    this.ids(actor,patientId,correlationId); if(!actor.roles.includes('dentist')) throw new ForbiddenException('Only a dentist may validate clinical documents'); if(!ID.safeParse(draftId).success||!ID.safeParse(requestKey).success) throw new BadRequestException('Invalid draft'); const payload=ValidatePatientDocumentDraftSchema.safeParse(body); if(!payload.success) throw new BadRequestException('Invalid validation request');
    const value=await this.rpc(actor,'validate_patient_document_draft',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_draft_id:draftId,p_expected_version:payload.data.expected_version,p_request_key:requestKey,p_correlation_id:correlationId,p_gate:this.gateKey()});
    const parsed=PatientDocumentUploadReceiptSchema.safeParse(value); if(!parsed.success) throw new ServiceUnavailableException('Document validation receipt unavailable'); return parsed.data;
  }
}
function sectionFrom(path:string):string { return path.split('/')[2] ?? ''; }
