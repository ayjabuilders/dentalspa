import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PatientLookupRequestSchema, PatientLookupResponseSchema } from '@dental/contracts';
import { canReadPatient, type Actor } from '../../identity/domain/access';
import { PATIENT_REPOSITORY, type PatientRepository } from '../domain/patient';
@Injectable()
export class PatientsService {
  constructor(@Inject(PATIENT_REPOSITORY) private readonly repository: PatientRepository) {}
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
}
