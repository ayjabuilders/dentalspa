import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { LibraryDeleteReceiptSchema, LibraryDeleteSchema, LibraryListSchema, LibraryMetadataSchema, LibraryOptionsSchema, LibraryReceiptSchema, LibraryUpdateSchema, type LibraryMetadata } from '@dental/contracts';
import { PATIENT_DOCUMENT_CATALOG, patientDocumentDefinition } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import { documentsActivationKey } from '../../identity/infrastructure/module-activation';
import { PRIVATE_DOCUMENT_STORAGE, type PrivateDocumentStorage } from '../domain/private-document-storage';
import { validateDocumentBytes } from './documents.service';
import { LibraryUploadStartSchema, LibraryUploadFinishSchema } from '@dental/contracts';
import { sealUploadTicket, openUploadTicket } from './document-upload-ticket';

type UploadFile = { buffer: Buffer; size: number; mimetype: string; originalname?: string };
const UUID = z.uuid();
const CONTENT_TYPES = ['application/pdf','image/jpeg','image/png'] as const;
const MAX_BYTES = 20 * 1024 * 1024;
const roleForSection = (actor: Actor, section: 'administrative'|'clinical') => section === 'administrative'
  ? actor.roles.some(role => ['manager','dentist','assistant','reception'].includes(role))
  : actor.roles.some(role => ['manager','dentist','assistant'].includes(role));

@Injectable()
export class PatientDocumentLibraryService {
  constructor(@Inject(PRIVATE_DOCUMENT_STORAGE) private readonly storage: PrivateDocumentStorage) {}
  private gateKey() {
    const key = documentsActivationKey();
    if (!key) throw new ServiceUnavailableException({statusCode:503,code:'patient_documents_disabled',message:'Patient documents are not enabled for this environment'});
    return key;
  }
  private ids(actor: Actor, patientId: string, correlationId?: string) {
    const gate = this.gateKey();
    if (!UUID.safeParse(actor.clinicId).success || !UUID.safeParse(patientId).success || correlationId && !UUID.safeParse(correlationId).success) throw new BadRequestException('Invalid patient document request');
    return gate;
  }
  private async rpc(actor: Actor, name: string, parameters: Record<string, unknown>) {
    let result: { data: unknown; error: { code?: string } | null };
    try { result = await scopedClient(actor.token).rpc(name, parameters); } catch { throw new ServiceUnavailableException('Patient document library unavailable'); }
    if (result.error) {
      const code = result.error.code ?? '';
      const reject = (error: Error): never => { Object.assign(error, { metadataCommitRejected: true }); throw error; };
      if (['28000','PGRST301','PGRST302'].includes(code)) return reject(new UnauthorizedException('Authentication required'));
      if (code === '42501') return reject(new ForbiddenException('Patient document scope denied'));
      if (code === 'PT404' || code === 'P0002') return reject(new NotFoundException('Patient document unavailable'));
      if (code === 'PT409' || code === '40001') return reject(new ConflictException('Document changed; refresh before saving'));
      if (['22023','22P02','22P05'].includes(code)) return reject(new BadRequestException('Invalid patient document request'));
      if (code === 'PT503') return reject(new ServiceUnavailableException({ statusCode: 503, code: 'patient_documents_disabled', message: 'Patient documents are not enabled for this environment' }));
      throw new ServiceUnavailableException('Patient document library unavailable');
    }
    return result.data;
  }
  async options(actor: Actor, patientId: string) {
    const gate = this.ids(actor,patientId);
    if (!actor.roles.some(role => ['manager','dentist','assistant','reception'].includes(role))) throw new ForbiddenException('Patient document access denied');
    const raw = await this.rpc(actor,'read_patient_document_library_options',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_gate:gate});
    const parsed = LibraryOptionsSchema.safeParse(raw);
    if (!parsed.success || parsed.data.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || parsed.data.patient_id.toLowerCase() !== patientId.toLowerCase()) throw new ServiceUnavailableException('Document library options unavailable');
    const categories = parsed.data.categories.filter(category => roleForSection(actor,category.section));
    return { ...parsed.data, categories };
  }
  async list(actor: Actor, patientId: string, query?: string, category?: string, cursor?: string, section?: 'administrative'|'clinical') {
    const gate = this.ids(actor,patientId);
    if (!actor.roles.some(role => ['manager','dentist','assistant','reception'].includes(role))) throw new ForbiddenException('Patient document access denied');
    if (query !== undefined && (typeof query !== 'string' || query.trim() !== query || query.length > 100)) throw new BadRequestException('Invalid document search');
    if (section !== undefined && section !== 'administrative' && section !== 'clinical') throw new BadRequestException('Invalid document section');
    if (category !== undefined && (!PATIENT_DOCUMENT_CATALOG.some(item => item.id === category) || !PATIENT_DOCUMENT_CATALOG.some(item => item.id === category && roleForSection(actor,item.section)))) throw new BadRequestException('Invalid document category');
    if (category !== undefined && section !== undefined && PATIENT_DOCUMENT_CATALOG.find(item => item.id === category)?.section !== section) throw new BadRequestException('Document category does not match section');
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 300)) throw new BadRequestException('Invalid document cursor');
    const raw = await this.rpc(actor,'list_patient_document_library',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_category:category??null,p_query:query??null,p_cursor:cursor??null,p_gate:gate,p_section:section??null});
    const parsed = LibraryListSchema.safeParse(raw);
    if (!parsed.success || parsed.data.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || parsed.data.patient_id.toLowerCase() !== patientId.toLowerCase() || parsed.data.items.some(item => !patientDocumentDefinition(item.category,item.type))) throw new ServiceUnavailableException('Document library unavailable');
    return parsed.data;
  }
  private filename(value: string | undefined) {
    const basename = (value ?? '').replace(/\\/g,'/').split('/').at(-1) ?? '';
    const clean = [...basename].filter(character => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && (code < 0x7f || code > 0x9f);
    }).join('').trim().normalize('NFC').slice(0,255);
    return clean || 'Document importé';
  }
  private async assertPatient(actor: Actor, patientId: string) {
    let result;
    try { result = await scopedClient(actor.token).from('patients').select('id').eq('clinic_id',actor.clinicId).eq('id',patientId).maybeSingle(); }
    catch { throw new ServiceUnavailableException('Patient record unavailable'); }
    if (result.error) throw new ServiceUnavailableException('Patient record unavailable');
    if (!result.data) throw new NotFoundException('Patient document unavailable');
  }
  async startUpload(actor:Actor,patientId:string,body:unknown,requestKey:string) {
    const gate=this.ids(actor,patientId),parsed=LibraryUploadStartSchema.safeParse(body);
    if(!UUID.safeParse(requestKey).success||!parsed.success)throw new BadRequestException('Invalid upload request');
    const input=parsed.data,definition=patientDocumentDefinition(input.metadata.category,input.metadata.type);
    if(!definition||!roleForSection(actor,definition.section))throw new ForbiddenException('Document upload scope denied');
    // SQL verifies the current membership, patient and database activation before signing.
    await this.options(actor,patientId);
    if(!this.storage.signedUpload)throw new ServiceUnavailableException('Direct uploads unavailable');
    const expires=Date.now()+1800000,path=`_staging/${expires}/${randomUUID()}`;
    const url=await this.storage.signedUpload(path);
    if(!url)throw new ServiceUnavailableException('Direct upload unavailable');
    const ticket=sealUploadTicket({version:1,user_id:actor.userId,clinic_id:actor.clinicId,patient_id:patientId,request_key:requestKey,expires_at:expires,path,input},gate);
    return {schema_version:1 as const,clinic_id:actor.clinicId,patient_id:patientId,request_key:requestKey,upload_url:url,ticket,expires_in:1800 as const};
  }
  async finishUpload(actor:Actor,patientId:string,body:unknown,requestKey:string,correlationId:string) {
    const gate=this.ids(actor,patientId,correlationId),parsed=LibraryUploadFinishSchema.safeParse(body);
    if(!parsed.success||!UUID.safeParse(requestKey).success)throw new BadRequestException('Invalid upload completion');
    const ticket=openUploadTicket(parsed.data.ticket,gate);
    if(!ticket||ticket.user_id!==actor.userId||ticket.clinic_id!==actor.clinicId||ticket.patient_id!==patientId||ticket.request_key!==requestKey)throw new ForbiddenException('Upload capability unavailable');
    await this.options(actor,patientId);
    const definition=patientDocumentDefinition(ticket.input.metadata.category,ticket.input.metadata.type);
    if(!definition||!roleForSection(actor,definition.section))throw new ForbiddenException('Document upload scope denied');
    const bytes=await this.storage.download(ticket.path);
    if(!bytes)throw new ConflictException('Upload missing; retry the original file');
    if(bytes.length!==ticket.input.size_bytes||createHash('sha256').update(bytes).digest('hex')!==ticket.input.sha256||!validateDocumentBytes(bytes,ticket.input.content_type))throw new BadRequestException('Uploaded content differs from the selected file');
    // Copy verified bytes to a new immutable final path. A staging write capability
    // must never be able to modify a finalized document, even during concurrent retries.
    const receipt=await this.upload(actor,patientId,ticket.input.metadata,{buffer:bytes,size:bytes.length,mimetype:ticket.input.content_type,originalname:ticket.input.original_name},requestKey,correlationId);
    // Keep the private staging bytes for the ticket's existing retry window.
    // A lost HTTP receipt must be recoverable through the same idempotency key.
    // Expired staging is removed by the configured cleanup worker; final bytes
    // remain immutable and are never writable through the staging capability.
    return receipt;
  }
  async upload(actor: Actor, patientId: string, metadataRaw: unknown, file: UploadFile | undefined, requestKey: string, correlationId: string) {
    const gate = this.ids(actor,patientId,correlationId);
    if (!UUID.safeParse(requestKey).success) throw new BadRequestException('Invalid idempotency key');
    let metadataInput = metadataRaw;
    if (typeof metadataRaw === 'string') { try { metadataInput = JSON.parse(metadataRaw); } catch { throw new BadRequestException('Invalid document metadata'); } }
    const parsedMetadata = LibraryMetadataSchema.safeParse(metadataInput);
    if (!parsedMetadata.success) throw new BadRequestException('Invalid document metadata');
    const metadata: LibraryMetadata = parsedMetadata.data;
    const definition = patientDocumentDefinition(metadata.category,metadata.type);
    if (!definition || !roleForSection(actor,definition.section)) throw new ForbiddenException('Document upload scope denied');
    if (!file || file.size !== file.buffer.byteLength || file.size > MAX_BYTES || !CONTENT_TYPES.includes(file.mimetype as typeof CONTENT_TYPES[number]) || !validateDocumentBytes(file.buffer,file.mimetype)) throw new BadRequestException('Unsupported or invalid document file');
    const originalFileName = this.filename(file.originalname);
    const title = metadata.title || originalFileName.slice(0,160);
    if (!title || title.length > 160) throw new BadRequestException('Invalid document title');
    await this.assertPatient(actor,patientId);
    const id = randomUUID(), storagePath = `${actor.clinicId}/${patientId}/${definition.section}/${id}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    if (!await this.storage.upload(storagePath,file.buffer,file.mimetype)) throw new ServiceUnavailableException('Private document upload failed');
    try {
      const raw = await this.rpc(actor,'register_patient_document_library_upload',{
        p_clinic_id:actor.clinicId,p_patient_id:patientId,p_id:id,p_category:metadata.category,p_type:metadata.type,p_title:title,
        p_document_date:metadata.document_date,p_notes:metadata.notes,p_related_appointment_id:metadata.related_appointment_id,
        p_original_file_name:originalFileName,p_content_type:file.mimetype,p_size_bytes:file.size,p_sha256:sha256,p_storage_path:storagePath,
        p_request_key:requestKey,p_correlation_id:correlationId,p_gate:gate,
      });
      const parsed = LibraryReceiptSchema.safeParse(raw);
      if (!parsed.success || parsed.data.item.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || parsed.data.item.patient_id.toLowerCase() !== patientId.toLowerCase()) throw new ServiceUnavailableException('Document upload receipt unavailable');
      if (parsed.data.replayed && parsed.data.item.id.toLowerCase() !== id.toLowerCase()) await this.storage.remove(storagePath).catch(()=>undefined);
      return parsed.data;
    } catch (error) {
      if (error && typeof error === 'object' && 'metadataCommitRejected' in error && (error as {metadataCommitRejected?:unknown}).metadataCommitRejected === true) await this.storage.remove(storagePath).catch(()=>undefined);
      throw error;
    }
  }
  async update(actor: Actor, patientId: string, documentId: string, body: unknown, requestKey: string, correlationId: string) {
    const gate = this.ids(actor,patientId,correlationId);
    if (!UUID.safeParse(documentId).success || !UUID.safeParse(requestKey).success) throw new BadRequestException('Invalid document update');
    const parsed = LibraryUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid document update');
    const metadata = parsed.data.metadata, definition = patientDocumentDefinition(metadata.category,metadata.type);
    if (!definition || !roleForSection(actor,definition.section)) throw new ForbiddenException('Document update scope denied');
    const raw = await this.rpc(actor,'update_patient_document_library_metadata',{
      p_clinic_id:actor.clinicId,p_patient_id:patientId,p_document_id:documentId,p_expected_version:parsed.data.expected_version,
      p_category:metadata.category,p_type:metadata.type,p_title:metadata.title,p_document_date:metadata.document_date,p_notes:metadata.notes,
      p_related_appointment_id:metadata.related_appointment_id,p_request_key:requestKey,p_correlation_id:correlationId,p_gate:gate,
    });
    const receipt = LibraryReceiptSchema.safeParse(raw);
    if (!receipt.success || receipt.data.item.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || receipt.data.item.patient_id.toLowerCase() !== patientId.toLowerCase() || receipt.data.item.id.toLowerCase() !== documentId.toLowerCase()) throw new ServiceUnavailableException('Document update receipt unavailable');
    return receipt.data;
  }
  async archive(actor: Actor, patientId: string, documentId: string, body: unknown, requestKey: string, correlationId: string) {
    const gate = this.ids(actor,patientId,correlationId);
    if (!UUID.safeParse(documentId).success || !UUID.safeParse(requestKey).success) throw new BadRequestException('Invalid document archive');
    const parsed = LibraryDeleteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid document archive');
    const raw = await this.rpc(actor,'archive_patient_document_library_item',{
      p_clinic_id:actor.clinicId,p_patient_id:patientId,p_document_id:documentId,p_expected_version:parsed.data.expected_version,
      p_request_key:requestKey,p_correlation_id:correlationId,p_gate:gate,
    });
    const receipt = LibraryDeleteReceiptSchema.safeParse(raw);
    if (!receipt.success || receipt.data.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || receipt.data.patient_id.toLowerCase() !== patientId.toLowerCase() || receipt.data.id.toLowerCase() !== documentId.toLowerCase()) throw new ServiceUnavailableException('Document archive receipt unavailable');
    return receipt.data;
  }
}
