import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AgendaSettingsSchema, UpdateAgendaSettingsSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../identity/domain/access';
import { scopedClient } from '../identity/infrastructure/supabase';
import { agendaSettingsActivationKey } from '../identity/infrastructure/module-activation';
import { calculatePublicAgendaSlots } from './agenda-availability';

@Injectable()
export class AgendaSettingsService {
  async availability(actor: Actor, query: unknown) {
    this.authorize(actor);
    const parsed = z.object({ date: z.iso.date(), visit_type_id: z.uuid() }).strict().safeParse(query);
    if (!parsed.success) throw new BadRequestException('Valid date and visit type required');
    const data = await this.call(actor, 'read_local_agenda_availability_snapshot', { p_date: parsed.data.date });
    try {
      const snapshot = z.object({ clinic_id: z.literal(actor.clinicId), now: z.iso.datetime({ offset: true }), settings: AgendaSettingsSchema, resources: z.array(z.unknown()), occupancy: z.array(z.unknown()) }).strict().parse(data);
      const slots = calculatePublicAgendaSlots({ ...snapshot, ...parsed.data });
      // Staff-only preview. No hold or confirmation is created; the public
      // booking lane must use its own projection and transactional revalidation.
      return { date: parsed.data.date, visit_type_id: parsed.data.visit_type_id, revision: snapshot.settings.revision, time_zone: snapshot.settings.time_zone, slots };
    } catch {
      throw new ServiceUnavailableException('Agenda availability unavailable');
    }
  }

  private authorize(actor: Actor) {
    if (!actor.roles.includes('manager')) throw new ForbiddenException('Manager access required');
    if (!agendaSettingsActivationKey()) throw new ServiceUnavailableException('Agenda settings are not enabled for this environment');
  }

  private async call(actor: Actor, name: string, args: Record<string, unknown>) {
    const { data, error } = await scopedClient(actor.token).rpc(name, {
      ...args, p_clinic_id: actor.clinicId, p_gate_key: agendaSettingsActivationKey(),
    }).then(result => result, () => { throw new ServiceUnavailableException('Agenda settings unavailable'); });
    if (error?.code === '42501') throw new ForbiddenException('Agenda configuration scope denied');
    if (['SH409', 'SH410'].includes(error?.code ?? '')) throw new ConflictException('Agenda configuration changed; reload before editing');
    if (['22023', '22P02'].includes(error?.code ?? '')) throw new BadRequestException('Invalid agenda configuration');
    if (error) throw new ServiceUnavailableException('Agenda settings unavailable');
    return data;
  }

  async read(actor: Actor) {
    this.authorize(actor);
    const data = await this.call(actor, 'read_local_agenda_configuration', {});
    const result = z.object({ settings: AgendaSettingsSchema.nullable() }).strict().safeParse(data);
    if (!result.success) throw new ServiceUnavailableException('Agenda settings unavailable');
    return result.data;
  }

  async save(actor: Actor, input: unknown, key: unknown) {
    this.authorize(actor);
    const payload = UpdateAgendaSettingsSchema.safeParse(input);
    if (!payload.success || !z.uuid().safeParse(key).success) throw new BadRequestException('Valid configuration and idempotency key required');
    const data = await this.call(actor, 'save_local_agenda_configuration', {
      p_expected_revision: payload.data.expected_revision, p_configuration: payload.data.settings, p_request_key: key,
    });
    const result = z.object({ settings: AgendaSettingsSchema, replayed: z.boolean() }).strict().safeParse(data);
    if (!result.success || JSON.stringify(result.data.settings) !== JSON.stringify(payload.data.settings)) throw new ServiceUnavailableException('Agenda settings unavailable');
    return result.data;
  }
}
