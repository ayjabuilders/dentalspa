import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PatientAdminChecklistListSchema, PatientAdminChecklistResultSchema, PatientCommunicationPreferencesResultSchema, PatientCommunicationPreferencesStateSchema, PatientLookupRequestSchema, PatientLookupResponseSchema, SetPatientAdminChecklistSchema, SetPatientCommunicationPreferencesSchema } from '@dental/contracts';
import { canReadPatient, type Actor } from '../../identity/domain/access';
import { PATIENT_REPOSITORY, type PatientRepository } from '../domain/patient';
import { PATIENT_ADMIN_CHECKLIST_REPOSITORY, type PatientAdminChecklistRepository } from '../domain/patient-admin-checklist';
import { safeCorrelation } from '../../audit/redaction';
import { z } from 'zod';
@Injectable()
export class PatientsService {
  constructor(
    @Inject(PATIENT_REPOSITORY) private readonly repository: PatientRepository,
    @Inject(PATIENT_ADMIN_CHECKLIST_REPOSITORY) private readonly checklistRepository: PatientAdminChecklistRepository,
  ) {}
  async lookup(actor: Actor, body: unknown) {
    if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role))) throw new ForbiddenException('Patient lookup scope denied');
    const request=PatientLookupRequestSchema.safeParse(body);
    if(!request.success) throw new BadRequestException('Invalid patient lookup input');
    const result=PatientLookupResponseSchema.safeParse(await this.repository.lookup(actor,request.data));
    if(!result.success || result.data.items.some(item=>item.clinic_id!==actor.clinicId || item.match_basis!==request.data.mode ||
      (request.data.mode==='reference_exact' ? item.reference!==request.data.query : !item.display_name.startsWith(request.data.query)))) throw new ServiceUnavailableException('Patient lookup unavailable');
    return result.data;
  }
  async list(actor: Actor) {
    if (!actor.roles.length) throw new ForbiddenException();
    // Defense in depth: even a privileged/faulty adapter cannot return a foreign tenant.
    return (await this.repository.list(actor)).filter(patient => canReadPatient(actor, patient));
  }
  async find(actor: Actor, id: string) {
    const patient = await this.repository.find(actor, id);
    if (!patient || !canReadPatient(actor, patient)) throw new NotFoundException('Record unavailable');
    return patient;
  }
  async findOwnProfile(actor: Actor, correlationId: string) {
    if (!actor.patientId) throw new ForbiddenException('Patient profile unavailable');
    const patient=await this.repository.readOwnProfile(actor,correlationId);
    if (!patient || patient.id!==actor.patientId || patient.clinic_id!==actor.clinicId) throw new NotFoundException('Record unavailable');
    return patient;
  }
  async getOwnCommunicationPreferences(actor: Actor, correlationId: string) {
    if (!actor.patientId) throw new ForbiddenException('Patient preferences unavailable');
    const parsed=PatientCommunicationPreferencesStateSchema.safeParse(await this.repository.getOwnCommunicationPreferences(actor,safeCorrelation(correlationId)));
    if(!parsed.success || parsed.data.patient_id!==actor.patientId || parsed.data.clinic_id!==actor.clinicId) throw new ServiceUnavailableException('Patient preferences unavailable');
    return parsed.data;
  }
  async setOwnCommunicationPreferences(actor: Actor, body: unknown, key: unknown, correlationId: string) {
    if (!actor.patientId) throw new ForbiddenException('Patient preferences unavailable');
    if (process.env.ENABLE_PATIENT_COMMUNICATION_PREFERENCES !== 'true') throw new ServiceUnavailableException({statusCode:503,code:'patient_preferences_disabled',message:'Patient preferences are disabled'});
    const requestKey=z.uuid().safeParse(key);
    const input=SetPatientCommunicationPreferencesSchema.safeParse(body);
    if(!requestKey.success || !input.success) throw new BadRequestException('Invalid patient preferences request');
    const result=PatientCommunicationPreferencesResultSchema.safeParse(await this.repository.setOwnCommunicationPreferences(actor,input.data,requestKey.data.toLowerCase(),safeCorrelation(correlationId)));
    if(!result.success || result.data.receipt.patient_id!==actor.patientId || result.data.receipt.clinic_id!==actor.clinicId || result.data.receipt.previous_revision!==input.data.expected_revision || result.data.receipt.contact_preference!==input.data.contact_preference || result.data.receipt.language!==input.data.language || result.data.receipt.time_zone!==input.data.time_zone) throw new ServiceUnavailableException('Patient preferences unavailable');
    return result.data;
  }
  private authorizeAdminChecklist(actor: Actor) {
    if (!actor.roles.some(role => ['reception', 'manager', 'dentist'].includes(role))) throw new ForbiddenException('Administrative checklist scope denied');
  }
  private assertAdminChecklistEnabled() {
    if (process.env.ENABLE_PATIENT_ADMIN_DOCUMENT_CHECKLIST !== 'true') {
      throw new ServiceUnavailableException({ statusCode: 503, code: 'patient_admin_checklist_disabled', message: 'Checklist is disabled pending local database and privacy review' });
    }
  }
  async listAdminChecklist(actor: Actor, patientId: unknown, correlationId: string) {
    this.authorizeAdminChecklist(actor);
    this.assertAdminChecklistEnabled();
    const parsedId = z.uuid().safeParse(patientId);
    if (!parsedId.success) throw new BadRequestException('Invalid checklist patient identifier');
    let raw;
    try { raw = await this.checklistRepository.listChecklist(actor, parsedId.data.toLowerCase(), safeCorrelation(correlationId)); }
    catch (error) { if (error instanceof HttpException) throw error; throwAdminChecklistError(error); }
    const result = PatientAdminChecklistListSchema.safeParse(raw);
    if (!result.success || result.data.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || result.data.patient_id.toLowerCase() !== parsedId.data.toLowerCase() || result.data.items.some((item, index, items) => item.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || item.patient_id.toLowerCase() !== parsedId.data.toLowerCase() || items.findIndex(other => other.kind === item.kind) !== index)) {
      throw new ServiceUnavailableException('Checklist unavailable');
    }
    return result.data;
  }
  async setAdminChecklist(actor: Actor, patientId: unknown, body: unknown, key: unknown, correlationId: string) {
    this.authorizeAdminChecklist(actor);
    this.assertAdminChecklistEnabled();
    const parsedId = z.uuid().safeParse(patientId), requestKey = z.uuid().safeParse(key), input = SetPatientAdminChecklistSchema.safeParse(body);
    if (!parsedId.success || !requestKey.success || !input.success) throw new BadRequestException('Invalid checklist request');
    let raw;
    try { raw = await this.checklistRepository.setChecklist(actor, parsedId.data.toLowerCase(), input.data, requestKey.data.toLowerCase(), safeCorrelation(correlationId)); }
    catch (error) { if (error instanceof HttpException) throw error; throwAdminChecklistError(error); }
    const result = PatientAdminChecklistResultSchema.safeParse(raw);
    if (!result.success || result.data.item.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || result.data.item.patient_id.toLowerCase() !== parsedId.data.toLowerCase() || result.data.item.kind !== input.data.kind || result.data.item.status !== input.data.status) {
      throw new ServiceUnavailableException('Checklist result unavailable');
    }
    return result.data;
  }
}

export function throwAdminChecklistError(error: unknown): never {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  if (['28000', 'PGRST301', 'PGRST302'].includes(code)) throw new ForbiddenException('Authentication required');
  if (code === '42501') throw new ForbiddenException('Administrative checklist scope denied');
  if (code === 'PT404') throw new NotFoundException('Patient record unavailable');
  if (code === 'PT409') throw new ConflictException('Checklist changed; refresh before saving');
  if (code === 'PT503') throw new ServiceUnavailableException({ statusCode: 503, code: 'patient_admin_checklist_disabled', message: 'Checklist is disabled pending local database and privacy review' });
  if (['22023', '22P02', '22P05'].includes(code)) throw new BadRequestException('Invalid checklist request');
  throw new ServiceUnavailableException('Checklist unavailable');
}
