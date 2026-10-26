import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CreateSchedulingHoldSchema, SchedulingAvailabilityRequestSchema, SchedulingAvailabilityResponseSchema, SchedulingResourceListResponseSchema, SchedulingHoldCreatedResponseSchema, SchedulingHoldReleasedResponseSchema, SchedulingHoldResponseSchema } from '@dental/contracts';
import type { Actor } from '../identity/domain/access';
import { safeCorrelation } from '../audit/redaction';
import { SCHEDULING_REPOSITORY, type SchedulingRepository } from './scheduling.repository';
import { SchedulingError } from './errors';
@Injectable()
export class SchedulingService {
  constructor(@Inject(SCHEDULING_REPOSITORY) private readonly repository:SchedulingRepository) {}
  private authorize(actor:Actor) {
    if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role))) throw new SchedulingError('forbidden');
    if(process.env.ENABLE_SCHEDULING_HOLDS!=='true') throw new SchedulingError('scheduling_disabled');
  }
  private input<T>(schema:z.ZodType<T>,value:unknown):T {
    const parsed=schema.safeParse(value);if(!parsed.success) throw new SchedulingError('invalid_request');return parsed.data;
  }
  private async result<T>(actor:Actor,procedure:string,args:Record<string,unknown>,schema:z.ZodType<T>):Promise<T> {
    let raw:unknown;
    try { raw=await this.repository.call(actor,procedure,args); } catch(error) { if(error instanceof SchedulingError) throw error;throw new SchedulingError('internal_error'); }
    const result=schema.safeParse(raw);if(!result.success) throw new SchedulingError('internal_error');return result.data;
  }
  async resources(actor:Actor) { this.authorize(actor);return this.result(actor,'scheduling_resources',{},SchedulingResourceListResponseSchema); }
  async availability(actor:Actor,body:unknown) {
    this.authorize(actor);const input=this.input(SchedulingAvailabilityRequestSchema,body);
    const result=await this.result(actor,'scheduling_availability',{p_request:input},SchedulingAvailabilityResponseSchema);
    if(result.provider_resource_id.toLowerCase()!==input.provider_resource_id.toLowerCase()||result.chair_resource_id.toLowerCase()!==input.chair_resource_id.toLowerCase()||Date.parse(result.window_starts_at)!==Date.parse(input.window_starts_at)||Date.parse(result.window_ends_at)!==Date.parse(input.window_ends_at)||result.display_timezone!==input.display_timezone) throw new SchedulingError('internal_error');
    return result;
  }
  async create(actor:Actor,body:unknown,key:unknown,correlation?:string) {
    this.authorize(actor);const input=this.input(CreateSchedulingHoldSchema,body),requestKey=this.input(z.uuid(),key);
    const result=await this.result(actor,'scheduling_create_hold',{p_request:input,p_request_key:requestKey,p_correlation_id:safeCorrelation(correlation)},SchedulingHoldCreatedResponseSchema);
    if(result.item.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.item.provider_resource_id.toLowerCase()!==input.provider_resource_id.toLowerCase()||result.item.chair_resource_id.toLowerCase()!==input.chair_resource_id.toLowerCase()||Date.parse(result.item.starts_at)!==Date.parse(input.starts_at)||Date.parse(result.item.ends_at)!==Date.parse(input.ends_at)||result.item.display_timezone!==input.display_timezone) throw new SchedulingError('internal_error');
    return result;
  }
  async get(actor:Actor,id:unknown) {
    this.authorize(actor);const holdId=this.input(z.uuid(),id);
    const result=await this.result(actor,'scheduling_get_hold',{p_hold_id:holdId},SchedulingHoldResponseSchema);
    if(result.item.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.item.id.toLowerCase()!==holdId.toLowerCase()) throw new SchedulingError('internal_error');return result;
  }
  async release(actor:Actor,id:unknown,body:unknown,key:unknown,correlation?:string) {
    this.authorize(actor);this.input(z.strictObject({}),body===undefined?{}:body);const holdId=this.input(z.uuid(),id),requestKey=this.input(z.uuid(),key);
    const result=await this.result(actor,'scheduling_release_hold',{p_hold_id:holdId,p_request_key:requestKey,p_correlation_id:safeCorrelation(correlation)},SchedulingHoldReleasedResponseSchema);
    if(result.item.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.item.id.toLowerCase()!==holdId.toLowerCase()||result.item.status!=='released') throw new SchedulingError('internal_error');return result;
  }
}
