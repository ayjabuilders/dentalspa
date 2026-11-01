import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PatientAdminChecklistListSchema, PatientAdminChecklistResultSchema, PatientCommunicationPreferencesResultSchema, PatientCommunicationPreferencesStateSchema, PatientLookupResponseSchema, PatientSelfSchema, type PatientLookupRequest, type SetPatientAdminChecklist, type SetPatientCommunicationPreferences } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { Patient, PatientRepository } from '../domain/patient';
import type { PatientAdminChecklistRepository } from '../domain/patient-admin-checklist';
@Injectable()
export class SupabasePatients implements PatientRepository, PatientAdminChecklistRepository {
  async lookup(actor: Actor, request: PatientLookupRequest) {
    let result;
    try {
      // Explicit POST; filters/query parameters would expose identifiers in URLs.
      result=await scopedClient(actor.token).rpc('lookup_patients',{p_clinic_id:actor.clinicId,p_request:request},{get:false,head:false});
    } catch { throw new ServiceUnavailableException('Patient lookup unavailable'); }
    if(result.error) throwPatientLookupError(result.error);
    const parsed=PatientLookupResponseSchema.safeParse(result.data);
    if(!parsed.success) throw new ServiceUnavailableException('Patient lookup unavailable');
    return parsed.data;
  }
  async list(actor: Actor): Promise<Patient[]> {
    const { data, error } = await scopedClient(actor.token).from('patients').select('id,clinic_id,display_name,reference').eq('clinic_id', actor.clinicId).order('reference').limit(100);
    if (error) throw new ServiceUnavailableException('Patient records unavailable');
    return data ?? [];
  }
  async find(actor: Actor, id: string): Promise<Patient | null> {
    const { data, error } = await scopedClient(actor.token).from('patients').select('id,clinic_id,display_name,reference').eq('clinic_id', actor.clinicId).eq('id', id).maybeSingle();
    if (error) throw new ServiceUnavailableException('Patient record unavailable');
    return data;
  }
  async readOwnProfile(actor: Actor, correlationId: string): Promise<Patient | null> {
    let result;
    try {
      result=await scopedClient(actor.token).rpc('read_my_patient_profile',{
        p_clinic_id:actor.clinicId,
        p_correlation_id:correlationId,
      },{get:false,head:false});
    } catch { throw new ServiceUnavailableException('Patient profile unavailable'); }
    if(result.error) throwPatientProfileReadError(result.error);
    if(!Array.isArray(result.data)) throw new ServiceUnavailableException('Patient profile unavailable');
    if(result.data.length===0) return null;
    if(result.data.length!==1) throw new ServiceUnavailableException('Patient profile unavailable');
    const parsed=PatientSelfSchema.safeParse(result.data[0]);
    if(!parsed.success) throw new ServiceUnavailableException('Patient profile unavailable');
    return parsed.data;
  }
  async getOwnCommunicationPreferences(actor: Actor, correlationId: string) {
    let result;
    try { result=await scopedClient(actor.token).rpc('get_my_patient_communication_preferences',{p_clinic_id:actor.clinicId,p_correlation_id:correlationId},{get:false,head:false}); }
    catch { throw new ServiceUnavailableException('Patient preferences unavailable'); }
    if(result.error) throwPatientPreferencesError(result.error);
    const parsed=PatientCommunicationPreferencesStateSchema.safeParse(result.data);
    if(!parsed.success) throw new ServiceUnavailableException('Patient preferences unavailable');
    return parsed.data;
  }
  async setOwnCommunicationPreferences(actor: Actor,input:SetPatientCommunicationPreferences,requestKey:string,correlationId:string) {
    let result;
    try { result=await scopedClient(actor.token).rpc('set_my_patient_communication_preferences',{p_clinic_id:actor.clinicId,p_payload:input,p_request_key:requestKey,p_correlation_id:correlationId},{get:false,head:false}); }
    catch { throw new ServiceUnavailableException('Patient preferences unavailable'); }
    if(result.error) throwPatientPreferencesError(result.error);
    const parsed=PatientCommunicationPreferencesResultSchema.safeParse(result.data);
    if(!parsed.success) throw new ServiceUnavailableException('Patient preferences unavailable');
    return parsed.data;
  }
  async listChecklist(actor: Actor, patientId: string, correlationId: string) {
    let result;
    try { result = await scopedClient(actor.token).rpc('list_patient_admin_document_checklist', { p_clinic_id: actor.clinicId, p_patient_id: patientId, p_correlation_id: correlationId }, { get: false, head: false }); }
    catch { throw new ServiceUnavailableException('Checklist unavailable'); }
    if (result.error) throwPatientAdminChecklistError(result.error);
    const parsed = PatientAdminChecklistListSchema.safeParse(result.data);
    if (!parsed.success) throw new ServiceUnavailableException('Checklist unavailable');
    return parsed.data;
  }
  async setChecklist(actor: Actor, patientId: string, input: SetPatientAdminChecklist, requestKey: string, correlationId: string) {
    let result;
    try { result = await scopedClient(actor.token).rpc('set_patient_admin_document_checklist', { p_clinic_id: actor.clinicId, p_patient_id: patientId, p_payload: input, p_request_key: requestKey, p_correlation_id: correlationId }, { get: false, head: false }); }
    catch { throw new ServiceUnavailableException('Checklist unavailable'); }
    if (result.error) throwPatientAdminChecklistError(result.error);
    const parsed = PatientAdminChecklistResultSchema.safeParse(result.data);
    if (!parsed.success) throw new ServiceUnavailableException('Checklist unavailable');
    return parsed.data;
  }
}
export function throwPatientLookupError(error: {code?:string; message?:string}):never {
  if(['28000','PGRST301','PGRST302'].includes(error.code ?? '')) throw new UnauthorizedException('Authentication required');
  if(error.code==='42501') throw new ForbiddenException('Patient lookup scope denied');
  if(['22023','22P02','22P05'].includes(error.code ?? '')) throw new BadRequestException('Invalid patient lookup input');
  throw new ServiceUnavailableException('Patient lookup unavailable');
}
export function throwPatientProfileReadError(error: {code?:string; message?:string}):never {
  if(['28000','PGRST301','PGRST302'].includes(error.code ?? '')) throw new UnauthorizedException('Authentication required');
  if(error.code==='42501') throw new ForbiddenException('Patient profile unavailable');
  if(['22023','22P02','22P05'].includes(error.code ?? '')) throw new BadRequestException('Invalid profile request');
  throw new ServiceUnavailableException('Patient profile unavailable');
}
export function throwPatientPreferencesError(error:{code?:string;message?:string}):never {
  if(['28000','PGRST301','PGRST302'].includes(error.code??'')) throw new UnauthorizedException('Authentication required');
  if(error.code==='42501') throw new ForbiddenException('Patient preferences unavailable');
  if(error.code==='PT409') throw new ConflictException('Patient preferences changed');
  if(['22023','22P02','22P05'].includes(error.code??'')) throw new BadRequestException('Invalid patient preferences request');
  if(error.code==='PT503') throw new ServiceUnavailableException({statusCode:503,code:'patient_preferences_disabled',message:'Patient preferences are disabled'});
  throw new ServiceUnavailableException('Patient preferences unavailable');
}
export function throwPatientAdminChecklistError(error: { code?: string; message?: string }): never {
  if (['28000', 'PGRST301', 'PGRST302'].includes(error.code ?? '')) throw new UnauthorizedException('Authentication required');
  if (error.code === '42501') throw new ForbiddenException('Administrative checklist scope denied');
  if (error.code === 'PT404') throw new NotFoundException('Patient record unavailable');
  if (error.code === 'PT409') throw new ConflictException('Checklist changed; refresh before saving');
  if (error.code === 'PT503') throw new ServiceUnavailableException({ statusCode: 503, code: 'patient_admin_checklist_disabled', message: 'Checklist is disabled pending local database and privacy review' });
  if (['22023', '22P02', '22P05'].includes(error.code ?? '')) throw new BadRequestException('Invalid checklist request');
  throw new ServiceUnavailableException('Checklist unavailable');
}
