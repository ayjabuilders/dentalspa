import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfiguredAppointmentReceiptSchema, ConfiguredAppointmentCommandSchema, PatientAppointmentCommandSchema, PatientAppointmentReceiptSchema, PatientAppointmentListSchema, PatientAppointmentQuerySchema } from '@dental/contracts';
import type { Actor } from '../identity/domain/access';
import { scopedClient } from '../identity/infrastructure/supabase';
import { configuredBookingActivationKey } from '../identity/infrastructure/module-activation';
import {z} from 'zod';
import {AgendaSettingsSchema,ConfiguredAppointmentAvailabilitySchema} from '@dental/contracts';
import {calculatePublicAgendaSlots} from '../booking-requests/agenda-availability';
import { AppointmentPatientAssociationSchema, AppointmentPatientAssociationReceiptSchema } from '@dental/contracts';
@Injectable()
export class PatientAppointmentsService {
  async associatePatient(actor: Actor, id: string, input: unknown, key: string) {
    this.configuredAccess(actor);
    const parsed = AppointmentPatientAssociationSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid patient association');
    const { data, error } = await scopedClient(actor.token).rpc('associate_local_configured_appointment_patient', {
      p_clinic_id: actor.clinicId, p_appointment_id: id, p_patient_id: parsed.data.patient_id,
      p_expected_version: parsed.data.expected_version, p_request_key: key, p_gate_key: configuredBookingActivationKey(),
    }).then(value => value, () => { throw new ServiceUnavailableException('Association result unavailable; retry the same command'); });
    if (['42501', '28000'].includes(error?.code ?? '')) throw new ForbiddenException('Appointment scope denied');
    if (error?.code === 'SH404') throw new NotFoundException('Appointment or patient unavailable');
    if (['SH409', 'SH410'].includes(error?.code ?? '')) throw new ConflictException('Appointment changed; refresh before editing');
    if (['22023', '22P02'].includes(error?.code ?? '')) throw new BadRequestException('Invalid patient association');
    if (error) throw new ServiceUnavailableException('Association result unavailable; retry the same command');
    const receipt = AppointmentPatientAssociationReceiptSchema.safeParse(data);
    if (!receipt.success || receipt.data.appointment_id !== id || receipt.data.patient_id !== parsed.data.patient_id
      || receipt.data.version !== parsed.data.expected_version + 1) throw new ServiceUnavailableException('Association receipt unavailable');
    return receipt.data;
  }
  private configuredAccess(actor:Actor){
    if(!actor.roles.some(role=>['reception','manager'].includes(role)))throw new ForbiddenException('Appointment scope denied');
    if(!configuredBookingActivationKey())throw new ServiceUnavailableException('Appointment commands are not enabled for this environment');
  }
  async configuredAvailability(actor:Actor,id:string,input:unknown){
    this.configuredAccess(actor);
    const query=z.object({date:z.iso.date()}).strict().safeParse(input);
    if(!query.success)throw new BadRequestException('Valid date required');
    const {data,error}=await scopedClient(actor.token).rpc('read_local_configured_rescheduling',{p_clinic_id:actor.clinicId,p_appointment_id:id,p_date:query.data.date,p_gate_key:configuredBookingActivationKey()}).then(value=>value,()=>{throw new ServiceUnavailableException('Availability unavailable');});
    if(error?.code==='42501')throw new ForbiddenException('Appointment scope denied');
    if(error?.code==='SH404')throw new NotFoundException('Appointment not found');
    if(error?.code==='SH409')throw new ConflictException('Appointment changed');
    if(error)throw new ServiceUnavailableException('Availability unavailable');
    try{
      const context=z.object({appointment_id:z.literal(id),version:z.number().int().positive(),visit_type_id:z.uuid(),current_starts_at:z.iso.datetime(),current_ends_at:z.iso.datetime(),snapshot:z.object({clinic_id:z.literal(actor.clinicId),now:z.iso.datetime(),settings:AgendaSettingsSchema,resources:z.array(z.unknown()),occupancy:z.array(z.unknown())}).strict()}).strict().parse(data);
      const visit=context.snapshot.settings.visit_types.find(v=>v.id===context.visit_type_id);
      if(!visit)throw Error('visit');
      const slots=calculatePublicAgendaSlots({...context.snapshot,date:query.data.date,visit_type_id:context.visit_type_id}).filter(slot=>slot.starts_at!==context.current_starts_at||slot.ends_at!==context.current_ends_at).map(({starts_at,ends_at})=>({starts_at,ends_at}));
      return ConfiguredAppointmentAvailabilitySchema.parse({appointment_id:id,version:context.version,revision:context.snapshot.settings.revision,date:query.data.date,visit_name:visit.name,slots});
    }catch{throw new ServiceUnavailableException('Availability unavailable');}
  }
  async configuredCommand(actor:Actor,id:string,input:unknown,key:string){
    this.configuredAccess(actor);
    const command=ConfiguredAppointmentCommandSchema.safeParse(input);
    if(!command.success)throw new BadRequestException('Invalid configured appointment command');
    if(!configuredBookingActivationKey())throw new ServiceUnavailableException('Appointment commands are not enabled for this environment');
    const value=command.data;
    const {data,error}=await scopedClient(actor.token).rpc(value.action==='cancel'?'cancel_local_configured_appointment':'reschedule_local_configured_appointment',{
      p_clinic_id:actor.clinicId,p_appointment_id:id,p_expected_version:value.expected_version,p_request_key:key,p_gate_key:configuredBookingActivationKey(),
      ...(value.action==='reschedule'?{p_expected_revision:value.expected_revision,p_starts_at:value.starts_at,p_ends_at:value.ends_at}:{}),
    }).then(value=>value,()=>{throw new ServiceUnavailableException('Appointment result unavailable; retry the same command');});
    if(error?.code==='42501')throw new ForbiddenException('Appointment scope denied');
    if(error?.code==='SH404')throw new NotFoundException('Appointment not found');
    if(['SH409','SH410'].includes(error?.code??''))throw new ConflictException('Appointment changed; refresh before editing');
    if(['22023','22P02'].includes(error?.code??''))throw new BadRequestException('Invalid appointment command');
    if(error)throw new ServiceUnavailableException('Appointment result unavailable; retry the same command');
    const receipt=ConfiguredAppointmentReceiptSchema.safeParse(data);
    if(!receipt.success||receipt.data.appointment_id!==id||receipt.data.status!==(value.action==='cancel'?'cancelled':'confirmed')||receipt.data.version!==value.expected_version+1)throw new ServiceUnavailableException('Appointment receipt unavailable');
    if(value.action==='reschedule'&&(Date.parse(receipt.data.starts_at)!==Date.parse(value.starts_at)||Date.parse(receipt.data.ends_at)!==Date.parse(value.ends_at)))throw new ServiceUnavailableException('Appointment receipt unavailable');
    return receipt.data;
  }
  async command(actor:Actor,id:string,input:unknown,key:string) {
    if(!actor.roles.some(role=>['reception','manager'].includes(role)))throw new ForbiddenException('Appointment scope denied');
    const payload=PatientAppointmentCommandSchema.safeParse(input);
    if(!payload.success)throw new BadRequestException('Invalid appointment command');
    let local=false;
    try { const url=new URL(process.env.SUPABASE_URL??'');local=url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname); } catch { /* Disabled for invalid configuration. */ }
    if(!local||process.env.ENABLE_DEMO_BOOKING_CONFIRMATIONS!=='true'||!process.env.DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY)throw new ServiceUnavailableException('Local appointment changes disabled');
    const command=payload.data;
    const {data,error}=await scopedClient(actor.token).rpc('manage_local_demo_appointment',{
      p_clinic_id:actor.clinicId,p_appointment_id:id,p_action:command.action,
      p_date:command.action==='reschedule'?command.date:null,p_time:command.action==='reschedule'?command.time:null,
      p_expected_version:command.expected_version,p_request_key:key,p_gate_key:process.env.DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY,
    }).then(value=>value,()=>{throw new ServiceUnavailableException('Appointment change unavailable');});
    if(error?.code==='42501')throw new ForbiddenException('Appointment scope denied');
    if(error?.code==='SH404')throw new NotFoundException('Appointment not found');
    if(['SH409','SH410','23P01'].includes(error?.code??''))throw new ConflictException('Appointment changed or resources unavailable');
    if(['22023','22007','22008','22P02'].includes(error?.code??''))throw new BadRequestException('Invalid sample appointment slot');
    if(error)throw new ServiceUnavailableException('Appointment change unavailable');
    const receipt=PatientAppointmentReceiptSchema.safeParse(data);
    if(!receipt.success||receipt.data.appointment_id!==id||receipt.data.version!==command.expected_version+1
      ||receipt.data.status!==(command.action==='cancel'?'cancelled':'confirmed'))throw new ServiceUnavailableException('Appointment receipt unavailable');
    if(command.action==='reschedule'){
      const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(receipt.data.starts_at));
      const part=(type:string)=>parts.find(value=>value.type===type)?.value;
      if(`${part('year')}-${part('month')}-${part('day')}`!==command.date||`${part('hour')}:${part('minute')}`!==command.time)throw new ServiceUnavailableException('Appointment receipt unavailable');
    }
    return receipt.data;
  }
  async list(actor:Actor,input:unknown) {
    if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException('Appointment scope denied');
    const query=PatientAppointmentQuerySchema.safeParse(input);
    if(!query.success)throw new BadRequestException('Valid date range of at most 31 days required');
    const {data,error}=await scopedClient(actor.token).rpc('list_local_patient_appointments',{p_clinic_id:actor.clinicId,p_from:query.data.from,p_until:query.data.until}).then(value=>value,()=>{throw new ServiceUnavailableException('Appointments unavailable');});
    if(error?.code==='42501')throw new ForbiddenException('Appointment scope denied');
    if(error)throw new ServiceUnavailableException('Appointments unavailable');
    const result=PatientAppointmentListSchema.safeParse(data);
    if(!result.success)throw new ServiceUnavailableException('Appointments unavailable');
    return result.data;
  }
}
