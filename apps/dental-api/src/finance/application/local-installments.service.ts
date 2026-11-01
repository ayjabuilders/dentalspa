import { financeActivationKey } from '../../identity/infrastructure/module-activation';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { LocalInstallmentReminderQuerySchema, LocalInstallmentReminderQueueSchema, AllocateLocalInstallmentSchema, LocalInstallmentAllocationReceiptSchema, LocalInstallmentBalancesSchema, SaveLocalInstallmentSchema, TransitionLocalInstallmentSchema, LocalInstallmentDraftReceiptSchema, LocalInstallmentTransitionReceiptSchema, LocalInstallmentListSchema, LocalInstallmentVersionSchema } from '@dental/contracts';
import {z} from 'zod';
import type {Actor} from '../../identity/domain/access';
import {scopedClient} from '../../identity/infrastructure/supabase';
@Injectable()
export class LocalInstallmentsService {
  private ids(...ids:string[]){if(!ids.every(id=>z.uuid().safeParse(id).success))throw new BadRequestException('Invalid agreement resource');}
  async list(actor:Actor,patient:string){const gate=this.gate(actor);this.ids(patient);const result=LocalInstallmentListSchema.safeParse(await this.call(actor,'read_local_installment_plans',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_gate:gate}));if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.patient_id.toLowerCase()!==patient.toLowerCase())throw new ServiceUnavailableException('Agreement list unavailable');return result.data;}
  async detail(actor:Actor,patient:string,plan:string,version:number){const gate=this.gate(actor);this.ids(patient,plan);if(!Number.isInteger(version)||version<1||version>99999999)throw new BadRequestException('Invalid agreement version');const result=LocalInstallmentVersionSchema.safeParse(await this.call(actor,'read_local_installment_version',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_plan_id:plan,p_version:version,p_gate:gate}));if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.patient_id.toLowerCase()!==patient.toLowerCase()||result.data.plan_id.toLowerCase()!==plan.toLowerCase()||result.data.version!==version)throw new ServiceUnavailableException('Agreement version unavailable');return result.data;}
  async save(actor:Actor,patient:string,body:unknown,key:string){const gate=this.gate(actor);this.ids(patient,key);const command=SaveLocalInstallmentSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid agreement');const result=LocalInstallmentDraftReceiptSchema.safeParse(await this.call(actor,'save_local_installment_draft',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_payload:command.data,p_request_key:key,p_gate:gate}));if(!result.success||result.data.patient_id.toLowerCase()!==patient.toLowerCase()||result.data.version!==command.data.expected_version+1||(command.data.plan_id&&result.data.plan_id.toLowerCase()!==command.data.plan_id.toLowerCase())||BigInt(result.data.agreed_minor)!==command.data.lines.reduce((n,l)=>n+BigInt(l.amount_minor),0n))throw new ServiceUnavailableException('Agreement acknowledgement unavailable');return result.data;}
  async transition(actor:Actor,patient:string,plan:string,body:unknown,key:string){const gate=this.gate(actor);this.ids(patient,plan,key);const command=TransitionLocalInstallmentSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid agreement transition');const result=LocalInstallmentTransitionReceiptSchema.safeParse(await this.call(actor,'transition_local_installment_agreement',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_plan_id:plan,p_version:command.data.version,p_action:command.data.action,p_reference:command.data.reference,p_request_key:key,p_gate:gate}));if(!result.success||result.data.patient_id.toLowerCase()!==patient.toLowerCase()||result.data.plan_id.toLowerCase()!==plan.toLowerCase()||result.data.version!==command.data.version||result.data.status!==command.data.action)throw new ServiceUnavailableException('Agreement acknowledgement unavailable');return result.data;}
  async balances(actor:Actor,patient:string,plan:string,version:number){
    const gate=this.gate(actor);this.ids(patient,plan);
    if(!Number.isInteger(version)||version<1||version>99999999)throw new BadRequestException('Invalid agreement version');
    const result=LocalInstallmentBalancesSchema.safeParse(await this.call(actor,'read_local_installment_balances',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_plan_id:plan,p_version:version,p_gate:gate}));
    if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.patient_id.toLowerCase()!==patient.toLowerCase()||result.data.plan_id.toLowerCase()!==plan.toLowerCase()||result.data.version!==version)throw new ServiceUnavailableException('Agreement balances unavailable');
    return result.data;
  }
  async allocate(actor:Actor,patient:string,plan:string,body:unknown,key:string){
    const gate=this.gate(actor);this.ids(patient,plan,key);
    if(!financeActivationKey('payments'))throw new ServiceUnavailableException('Local payments unavailable');
    const command=AllocateLocalInstallmentSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid installment allocation');
    const c=command.data;
    const result=LocalInstallmentAllocationReceiptSchema.safeParse(await this.call(actor,'allocate_local_installment_payment',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_plan_id:plan,p_version:c.version,p_line_id:c.line_id,p_payment_id:c.payment_id,p_amount_minor:c.amount_minor,p_request_key:key,p_gate:gate}));
    if(!result.success||result.data.patient_id.toLowerCase()!==patient.toLowerCase()||result.data.plan_id.toLowerCase()!==plan.toLowerCase()||result.data.version!==c.version||result.data.line_id.toLowerCase()!==c.line_id.toLowerCase()||result.data.payment_id.toLowerCase()!==c.payment_id.toLowerCase()||result.data.amount_minor!==c.amount_minor)throw new ServiceUnavailableException('Installment allocation acknowledgement unavailable');
    return result.data;
  }
  async reminderQueue(actor:Actor,query:unknown){
    const gate=this.gate(actor),parsed=LocalInstallmentReminderQuerySchema.safeParse(query);if(!parsed.success)throw new BadRequestException('Invalid reminder query');
    const result=LocalInstallmentReminderQueueSchema.safeParse(await this.call(actor,'read_local_installment_reminder_queue_search',{p_clinic_id:actor.clinicId,p_after_due:parsed.data.after_due??null,p_after_id:parsed.data.after_id??null,p_query:parsed.data.q??null,p_gate:gate}));
    if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase())throw new ServiceUnavailableException('Reminder queue unavailable');return result.data;
  }
  private gate(actor: Actor) {
    if (!actor.roles.includes('manager')) throw new ForbiddenException('Installment access denied');
    const key=financeActivationKey('installments');
    if(!key)throw new ServiceUnavailableException('Finance module unavailable');
    return key;
  }
  private async call(actor: Actor, name: string, parameters: Record<string, unknown>) {
    const { data, error } = await scopedClient(actor.token).rpc(name, parameters)
      .then(result => result, () => { throw new ServiceUnavailableException('Installment service unavailable'); });
    if (error) {
      if (error.code === '28000') throw new UnauthorizedException('Session expired');
      if (error.code === '42501') throw new ForbiddenException('Installment access denied');
      if (error.code === 'PT404') throw new NotFoundException('Installment resource unavailable');
      if (['SH409', 'SH410'].includes(error.code)) throw new ConflictException('Installment command conflicts with current data');
      if (error.code === '22023') throw new BadRequestException('Invalid installment command');
      throw new ServiceUnavailableException('Installment service unavailable');
    }
    return data;
  }
}
