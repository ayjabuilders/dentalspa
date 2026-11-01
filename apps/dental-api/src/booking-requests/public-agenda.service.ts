import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AgendaSettingsSchema, ConfiguredBookingRequestSchema, ConfiguredBookingReceiptSchema, PublicAgendaQuerySchema, PublicAgendaAvailabilitySchema } from '@dental/contracts';
import { z } from 'zod';
import { scopedClient } from '../identity/infrastructure/supabase';
import { publicAgendaActivation } from '../identity/infrastructure/module-activation';
import { calculatePublicAgendaSlots } from './agenda-availability';

@Injectable()
export class PublicAgendaService {
  private configuration() {
    const activation=publicAgendaActivation();
    const clinic=z.uuid().safeParse(activation?.clinicId);
    if(!activation||!clinic.success)throw new ServiceUnavailableException('Public agenda is not enabled for this environment');
    return {...activation,clinicId:clinic.data};
  }

  async createRequest(input:unknown,key:unknown) {
    const config=this.configuration();
    if(!config.requestsEnabled)throw new ServiceUnavailableException('Local configured requests are disabled');
    const parsed=ConfiguredBookingRequestSchema.safeParse(input);
    if(!parsed.success||!z.uuid().safeParse(key).success)throw new BadRequestException('Valid synthetic contact, consent and slot required');
    const payload=parsed.data;
    const client=scopedClient();
    const write=(snapshot:unknown)=>client.rpc('create_local_configured_booking_request',{
      p_clinic_id:config.clinicId,p_request_key:key,p_payload:payload,p_validated_snapshot:snapshot,p_gate_key:config.gateKey,
    });
    const receipt=(data:unknown)=>{
      const result=ConfiguredBookingReceiptSchema.safeParse(data);
      if(!result.success)throw new ServiceUnavailableException('Local booking receipt unavailable');
      if(result.data.status==='confirmed'&&(Date.parse(result.data.starts_at)!==Date.parse(payload.starts_at)||Date.parse(result.data.ends_at)!==Date.parse(payload.ends_at)))throw new ServiceUnavailableException('Local booking receipt unavailable');
      return result.data;
    };
    const fail=(code:string|undefined):never=>{
      if(['SH409','SH410'].includes(code??''))throw new ConflictException('The selected slot or request changed; refresh availability');
      if(['22023','22007','22008','22P02'].includes(code??''))throw new BadRequestException('Invalid public visit or synthetic contact');
      throw new ServiceUnavailableException('Local configured request unavailable');
    };
    try{
      // Check immutable receipt before checking today's availability. A committed
      // request must remain recoverable after another user occupies the slot.
      const prior=await write(null);
      if(!prior.error){const result=receipt(prior.data);if(!result.replayed)throw new ServiceUnavailableException('Invalid replay receipt');return result;}
      if(prior.error.code!=='SH409')return fail(prior.error.code);
      const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(payload.starts_at));
      const read=await client.rpc('read_local_public_agenda_snapshot',{p_clinic_id:config.clinicId,p_date:date,p_gate_key:config.gateKey});
      if(read.error)throw new ServiceUnavailableException('Local availability unavailable');
      const snapshot=z.object({clinic_id:z.literal(config.clinicId),now:z.iso.datetime({offset:true}),settings:AgendaSettingsSchema,resources:z.array(z.unknown()),occupancy:z.array(z.unknown())}).strict().parse(read.data);
      if(snapshot.settings.revision!==payload.configuration_revision)throw new ConflictException('Configuration changed; refresh availability');
      if(snapshot.settings.confirmation_mode==='automatic'&&!config.confirmationsEnabled)throw new ServiceUnavailableException('Automatic configured confirmation is not enabled');
      const slots=calculatePublicAgendaSlots({...snapshot,date,visit_type_id:payload.visit_type_id});
      if(!slots.some(slot=>Date.parse(slot.starts_at)===Date.parse(payload.starts_at)&&Date.parse(slot.ends_at)===Date.parse(payload.ends_at)))throw new ConflictException('Selected slot unavailable');
      const saved=await write(snapshot);
      if(saved.error)return fail(saved.error.code);
      const result=receipt(saved.data);
      if(result.status!==(snapshot.settings.confirmation_mode==='automatic'?'confirmed':'request_received'))throw new ServiceUnavailableException('Local booking receipt unavailable');
      return result;
    }catch(error){
      if(error instanceof BadRequestException||error instanceof ConflictException||error instanceof ServiceUnavailableException)throw error;
      throw new ServiceUnavailableException('Local configured request unavailable');
    }
  }

  async availability(input: unknown) {
    const config=this.configuration();
    const query = PublicAgendaQuerySchema.safeParse(input);
    if (!query.success) throw new BadRequestException('Valid date and optional visit type required');
    try {
      const { data, error } = await scopedClient().rpc('read_local_public_agenda_snapshot', {
        p_clinic_id: config.clinicId, p_date: query.data.date, p_gate_key: config.gateKey,
      });
      if (error) throw new Error('snapshot_unavailable');
      const snapshot = z.object({ clinic_id: z.literal(config.clinicId), now: z.iso.datetime({ offset: true }), settings: AgendaSettingsSchema, resources: z.array(z.unknown()), occupancy: z.array(z.unknown()) }).strict().parse(data);
      const visits = snapshot.settings.visit_types.filter(visit => visit.active && visit.public_bookable);
      const selected = visits.find(visit => visit.id === query.data.visit_type_id);
      // Validate the entire snapshot even for catalog-only and unknown/private
      // type requests. No availability fallback on malformed storage responses.
      const slots = calculatePublicAgendaSlots({ ...snapshot, date: query.data.date, visit_type_id: selected?.id ?? '00000000-0000-4000-8000-000000000000' });
      const unique = new Map(slots.map(slot => [`${slot.starts_at}/${slot.ends_at}`, { starts_at: slot.starts_at, ends_at: slot.ends_at }]));
      return PublicAgendaAvailabilitySchema.parse({
        date: query.data.date, time_zone: snapshot.settings.time_zone, revision: snapshot.settings.revision, informational: true,
        selected_visit_type_id: selected?.id ?? null,
        confirmation_mode:snapshot.settings.confirmation_mode,
        ...(config.requestsEnabled&&(snapshot.settings.confirmation_mode==='staff_review'||config.confirmationsEnabled)?{request_enabled:true}:{}),
        visit_types: visits.map(visit => ({ id: visit.id, name: visit.name, duration_minutes: visit.duration_minutes })),
        slots: [...unique.values()],
      });
    } catch {
      throw new ServiceUnavailableException('Local public agenda unavailable');
    }
  }
}
