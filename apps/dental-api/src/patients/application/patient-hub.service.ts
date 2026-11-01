import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PatientHubSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';
import { scopedClient } from '../../identity/infrastructure/supabase.js';
@Injectable()
export class PatientHubService {
  async read(actor: Actor, patientId: string) {
    if (!actor.roles.some(role => ['reception','manager','dentist'].includes(role))) throw new ForbiddenException('Patient hub scope denied');
    const { data, error } = await scopedClient(actor.token).rpc('read_patient_hub', { p_clinic_id: actor.clinicId, p_patient_id: patientId })
      .then(result => result, () => { throw new ServiceUnavailableException('Patient hub unavailable'); });
    if (error?.code === '42501') throw new ForbiddenException('Patient hub scope denied');
    if (error?.code === 'PT404') throw new NotFoundException('Patient hub unavailable');
    if (error) throw new ServiceUnavailableException('Patient hub unavailable');
    const parsed = PatientHubSchema.safeParse(data);
    if (!parsed.success || parsed.data.patient.id !== patientId || parsed.data.patient.clinic_id !== actor.clinicId) throw new ServiceUnavailableException('Patient hub unavailable');
    return parsed.data;
  }
}
