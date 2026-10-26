import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { canReadPatient, type Actor } from '../../identity/domain/access';
import { PATIENT_REPOSITORY, type PatientRepository } from '../domain/patient';
@Injectable()
export class PatientsService {
  constructor(@Inject(PATIENT_REPOSITORY) private readonly repository: PatientRepository) {}
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
