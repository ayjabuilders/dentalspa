import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { FollowUpListSchema, FollowUpRecordedSchema, RecordFollowUpSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { safeCorrelation } from '../../audit/redaction';
import { FOLLOW_UP_REPOSITORY, type FollowUpRepository } from '../domain/follow-up';
@Injectable()
export class FollowUpService {
  constructor(@Inject(FOLLOW_UP_REPOSITORY) private readonly repository:FollowUpRepository) {}
  private authorize(actor:Actor) {if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role))) throw new ForbiddenException('Follow-up scope denied');}
  private id(value:unknown) {const parsed=z.uuid().safeParse(value);if(!parsed.success) throw new BadRequestException('Invalid follow-up identifier or key');return parsed.data.toLowerCase();}
  private async invoke<T>(operation:()=>Promise<T>):Promise<T> {
    try {return await operation();}catch(error) {if(error instanceof HttpException) throw error;throw new ServiceUnavailableException('Follow-up unavailable');}
  }
  async list(actor:Actor,id:unknown) {
    this.authorize(actor);const inquiryId=this.id(id);
    const result=FollowUpListSchema.safeParse(await this.invoke(()=>this.repository.list(actor,inquiryId)));
    if(!result.success||result.data.items.some(item=>item.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||item.inquiry_id.toLowerCase()!==inquiryId)) throw new ServiceUnavailableException('Follow-up history unavailable');
    return result.data;
  }
  async record(actor:Actor,id:unknown,body:unknown,key:unknown,correlation?:string) {
    this.authorize(actor);
    if(process.env.ENABLE_INTAKE_COMMANDS!=='true') throw new ServiceUnavailableException({statusCode:503,code:'intake_disabled',message:'Intake commands are disabled'});
    const inquiryId=this.id(id),requestKey=this.id(key),input=RecordFollowUpSchema.safeParse(body);
    if(!input.success) throw new BadRequestException('Invalid follow-up request');
    const result=FollowUpRecordedSchema.safeParse(await this.invoke(()=>this.repository.record(actor,inquiryId,input.data,requestKey,safeCorrelation(correlation))));
    if(!result.success||result.data.item.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.item.inquiry_id.toLowerCase()!==inquiryId||result.data.item.actor_user_id.toLowerCase()!==actor.userId.toLowerCase()||result.data.item.kind!==input.data.kind||result.data.item.channel!==input.data.channel) throw new ServiceUnavailableException('Follow-up result unavailable');
    return result.data;
  }
}
