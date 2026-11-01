import { financeActivationKey } from '../../identity/infrastructure/module-activation.js';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {LocalPaymentConfigurationSchema,SaveLocalReceivingAccountSchema,LocalReceivingAccountReceiptSchema,SaveLocalPaymentMethodSchema,LocalPaymentMethodReceiptSchema} from '@dental/contracts';
import {z} from 'zod';
import type {Actor} from '../../identity/domain/access.js';
import {scopedClient} from '../../identity/infrastructure/supabase.js';
@Injectable()
export class LocalPaymentConfigurationService {
 private gate(actor:Actor,key?:unknown,write=false){
  if(!actor.roles.includes('manager'))throw new ForbiddenException('Configuration access denied');
  const gate=financeActivationKey('payments');
  if(!gate)throw new ServiceUnavailableException('Finance module unavailable');
  if(write&&!z.uuid().safeParse(key).success)throw new BadRequestException('Invalid command key');return gate;
 }
 private async call(actor:Actor,name:string,parameters:Record<string,unknown>){
  const {data,error}=await scopedClient(actor.token).rpc(name,parameters).then(r=>r,()=>{throw new ServiceUnavailableException('Configuration unavailable');});
  if(error){if(error.code==='28000')throw new UnauthorizedException('Session expired');if(error.code==='42501')throw new ForbiddenException('Configuration access denied');if(error.code==='PT404')throw new NotFoundException('Configuration resource unavailable');if(['SH409','SH410'].includes(error.code))throw new ConflictException('Configuration changed');if(error.code==='22023')throw new BadRequestException('Invalid configuration');throw new ServiceUnavailableException('Configuration unavailable');}return data;
 }
 async read(actor:Actor){const gate=this.gate(actor);const result=LocalPaymentConfigurationSchema.safeParse(await this.call(actor,'read_local_payment_configuration',{p_clinic_id:actor.clinicId,p_gate:gate}));if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase())throw new ServiceUnavailableException('Configuration unavailable');return result.data;}
 async account(actor:Actor,body:unknown,key:unknown){
  const gate=this.gate(actor,key,true),command=SaveLocalReceivingAccountSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid receiving account');
  const result=LocalReceivingAccountReceiptSchema.safeParse(await this.call(actor,'save_local_receiving_account',{p_clinic_id:actor.clinicId,p_payload:command.data,p_request_key:key,p_gate:gate}));
  if(!result.success)throw new ServiceUnavailableException('Configuration acknowledgement unavailable');const r=result.data,c=command.data;
  if((c.account_id!==null&&r.account_id.toLowerCase()!==c.account_id.toLowerCase())||r.version!==c.expected_version+1||r.label!==c.label||r.kind!==c.kind||r.active!==c.active)throw new ServiceUnavailableException('Configuration acknowledgement unavailable');return r;
 }
 async method(actor:Actor,body:unknown,key:unknown){
  const gate=this.gate(actor,key,true),command=SaveLocalPaymentMethodSchema.safeParse(body);if(!command.success)throw new BadRequestException('Invalid payment method');
  const result=LocalPaymentMethodReceiptSchema.safeParse(await this.call(actor,'save_local_payment_method',{p_clinic_id:actor.clinicId,p_payload:command.data,p_request_key:key,p_gate:gate}));
  if(!result.success)throw new ServiceUnavailableException('Configuration acknowledgement unavailable');const r=result.data,c=command.data;
  if((c.method_id!==null&&r.method_id.toLowerCase()!==c.method_id.toLowerCase())||r.version!==c.expected_version+1||r.code!==c.code||r.label!==c.label.trim()||r.kind!==c.kind||r.active!==c.active||r.reference_required!==c.reference_required||r.settlement_behavior!==c.settlement_behavior||r.receiving_account.id.toLowerCase()!==c.receiving_account_id.toLowerCase())throw new ServiceUnavailableException('Configuration acknowledgement unavailable');return r;
 }
}
