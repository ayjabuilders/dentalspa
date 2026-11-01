import { financeActivationKey } from '../../identity/infrastructure/module-activation';
import {LocalPaymentRefundContextSchema,RecordLocalPaymentRefundSchema,LocalPaymentRefundReceiptSchema} from '@dental/contracts';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { RecordLocalPaymentSchema, TransitionLocalPaymentSchema, AllocateLocalPaymentSchema, IssueLocalPaymentReceiptSchema, LocalPaymentStateReceiptSchema, LocalAllocationReceiptSchema, LocalPaymentDocumentReceiptSchema, LocalPatientPaymentsSchema, LocalPaymentDocumentSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
@Injectable()
export class LocalPaymentsService {
  private gate(actor:Actor,patientId:string,key:unknown,paymentId?:string,read=false){
    if(!actor.roles.includes('manager'))throw new ForbiddenException('Payment access denied');
    const gate=financeActivationKey('payments');
  if(!gate)throw new ServiceUnavailableException('Finance module unavailable');
    if(!z.uuid().safeParse(patientId).success||(!read&&!z.uuid().safeParse(key).success)||(paymentId!==undefined&&!z.uuid().safeParse(paymentId).success))throw new BadRequestException('Invalid payment command');
    return gate;
  }
  private async call(actor:Actor,name:string,parameters:Record<string,unknown>){
    const {data,error}=await scopedClient(actor.token).rpc(name,parameters).then(result=>result,()=>{throw new ServiceUnavailableException('Payment service unavailable');});
    if(error){
      if(error.code==='28000')throw new UnauthorizedException('Session expired');
      if(error.code==='42501')throw new ForbiddenException('Payment access denied');
      if(error.code==='PT404')throw new NotFoundException('Payment resource unavailable');
      if(['SH409','SH410'].includes(error.code))throw new ConflictException('Payment command conflicts with current data');
      if(error.code==='22023')throw new BadRequestException('Invalid payment command');
      throw new ServiceUnavailableException('Payment service unavailable');
    }
    return data;
  }
  async list(actor:Actor,patientId:string){
    const gate=this.gate(actor,patientId,undefined,undefined,true);
    const result=LocalPatientPaymentsSchema.safeParse(await this.call(actor,'read_local_patient_payments',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_gate:gate}));
    if(!result.success||!same(result.data.patient_id,patientId)||!same(result.data.clinic_id,actor.clinicId))throw new ServiceUnavailableException('Payment data unavailable');
    return result.data;
  }
  async document(actor:Actor,patientId:string,paymentId:string){
    const gate=this.gate(actor,patientId,undefined,paymentId,true);
    const result=LocalPaymentDocumentSchema.safeParse(await this.call(actor,'read_local_payment_receipt',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_payment_id:paymentId,p_gate:gate}));
    if(!result.success||!same(result.data.patient_id,patientId)||!same(result.data.payment_id,paymentId)||!same(result.data.snapshot.clinic.id,actor.clinicId))throw new ServiceUnavailableException('Payment document unavailable');
    return result.data;
  }
  async record(actor:Actor,patientId:string,body:unknown,key:unknown){
    const gate=this.gate(actor,patientId,key),command=RecordLocalPaymentSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid payment');
    const result=LocalPaymentStateReceiptSchema.safeParse(await this.call(actor,'record_local_payment',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_payload:command.data,p_request_key:key,p_gate:gate}));
    if(!result.success||!same(result.data.patient_id,patientId)||result.data.version!==1||result.data.state!=='pending'||result.data.settlement!=='pending'||result.data.amount_minor!==command.data.amount_minor)throw new ServiceUnavailableException('Payment acknowledgement unavailable');
    return result.data;
  }
  async transition(actor:Actor,patientId:string,paymentId:string,body:unknown,key:unknown){
    const gate=this.gate(actor,patientId,key,paymentId),command=TransitionLocalPaymentSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid payment transition');
    const result=LocalPaymentStateReceiptSchema.safeParse(await this.call(actor,'transition_local_payment',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_payment_id:paymentId,p_expected_version:command.data.expected_version,p_action:command.data.action,p_verified:command.data.verified,p_request_key:key,p_gate:gate}));
    if(!result.success||!same(result.data.patient_id,patientId)||!same(result.data.payment_id,paymentId)||result.data.version!==command.data.expected_version+1)throw new ServiceUnavailableException('Payment acknowledgement unavailable');
    const value=result.data,action=command.data.action;
    if((action==='fail'&&(value.state!=='failed'||value.settlement!=='pending'))||(action==='confirm'&&(value.state!=='confirmed'||value.settlement==='failed'))||(action==='settle'&&(value.state!=='confirmed'||value.settlement!=='settled'))||(action==='settlement_failed'&&(value.state!=='confirmed'||value.settlement!=='failed')))throw new ServiceUnavailableException('Payment acknowledgement unavailable');
    return value;
  }
  async allocate(actor:Actor,patientId:string,paymentId:string,body:unknown,key:unknown){
    const gate=this.gate(actor,patientId,key,paymentId),command=AllocateLocalPaymentSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid allocation');
    const result=LocalAllocationReceiptSchema.safeParse(await this.call(actor,'allocate_local_payment',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_payment_id:paymentId,p_invoice_id:command.data.invoice_id,p_amount_minor:command.data.amount_minor,p_request_key:key,p_gate:gate}));
    if(!result.success||!same(result.data.patient_id,patientId)||!same(result.data.payment_id,paymentId)||!same(result.data.invoice_id,command.data.invoice_id)||result.data.amount_minor!==command.data.amount_minor)throw new ServiceUnavailableException('Allocation acknowledgement unavailable');
    return result.data;
  }
  async refundContext(actor:Actor,patientId:string,paymentId:string){
    const gate=this.gate(actor,patientId,undefined,paymentId,true);
    const result=LocalPaymentRefundContextSchema.safeParse(await this.call(actor,'read_local_payment_refund_context',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_payment_id:paymentId,p_gate:gate}));
    if(!result.success||!same(result.data.clinic_id,actor.clinicId)||!same(result.data.patient_id,patientId)||!same(result.data.payment_id,paymentId))throw new ServiceUnavailableException('Refund context unavailable');return result.data;
  }
  async refund(actor:Actor,patientId:string,paymentId:string,body:unknown,key:unknown){
    const gate=this.gate(actor,patientId,key,paymentId),command=RecordLocalPaymentRefundSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid refund');
    const result=LocalPaymentRefundReceiptSchema.safeParse(await this.call(actor,'record_local_payment_refund',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_payment_id:paymentId,p_payload:command.data,p_request_key:key,p_gate:gate}));
    if(!result.success||!same(result.data.patient_id,patientId)||!same(result.data.payment_id,paymentId)||result.data.amount_minor!==command.data.amount_minor||result.data.kind!==command.data.kind||BigInt(result.data.released_minor)!==command.data.releases.reduce((n,r)=>n+BigInt(r.amount_minor),0n))throw new ServiceUnavailableException('Refund acknowledgement unavailable');return result.data;
  }
  async receipt(actor:Actor,patientId:string,paymentId:string,body:unknown,key:unknown){
    const gate=this.gate(actor,patientId,key,paymentId);if(!IssueLocalPaymentReceiptSchema.safeParse(body).success)throw new BadRequestException('Invalid receipt command');
    const result=LocalPaymentDocumentReceiptSchema.safeParse(await this.call(actor,'issue_local_payment_receipt',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_payment_id:paymentId,p_request_key:key,p_gate:gate}));
    if(!result.success||!same(result.data.patient_id,patientId)||!same(result.data.payment_id,paymentId))throw new ServiceUnavailableException('Payment receipt unavailable');
    return result.data;
  }
}
