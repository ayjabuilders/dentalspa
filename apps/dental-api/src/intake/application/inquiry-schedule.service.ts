import { BadRequestException,ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquiryScheduleResultSchema,SetInquiryScheduleSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { safeCorrelation } from '../../audit/redaction';
import { INQUIRY_SCHEDULE_REPOSITORY,type InquiryScheduleRepository } from '../domain/inquiry-schedule';
function instant(value:string|null) {
 if(value===null)return null;
 const fraction=value.match(/\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/)?.[1]??'';
 return BigInt(Date.parse(value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/,'')))*1000n+BigInt(fraction.padEnd(6,'0'));
}
@Injectable()
export class InquiryScheduleService {
 constructor(@Inject(INQUIRY_SCHEDULE_REPOSITORY) private readonly repository:InquiryScheduleRepository){}
 async set(actor:Actor,id:unknown,body:unknown,key:unknown,correlation?:string){
  if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException();
  if(process.env.ENABLE_INTAKE_COMMANDS!=='true')throw new ServiceUnavailableException({statusCode:503,code:'intake_disabled',message:'Intake commands are disabled'});
  const inquiry=z.uuid().safeParse(id),requestKey=z.uuid().safeParse(key),input=SetInquiryScheduleSchema.safeParse(body);
  if(!inquiry.success||!requestKey.success||!input.success)throw new BadRequestException('Invalid schedule request');
  let raw:unknown;try{raw=await this.repository.set(actor,inquiry.data.toLowerCase(),input.data,requestKey.data.toLowerCase(),safeCorrelation(correlation));}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException('Schedule unavailable');}
  const parsed=InquiryScheduleResultSchema.safeParse(raw);if(!parsed.success)throw new ServiceUnavailableException('Schedule unavailable');
  const receipt=parsed.data.receipt;
  if(receipt.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||receipt.owner_user_id.toLowerCase()!==actor.userId.toLowerCase()||receipt.inquiry_id.toLowerCase()!==inquiry.data.toLowerCase()||instant(receipt.previous_follow_up_at)!==instant(input.data.expected_follow_up_at)||instant(receipt.follow_up_at)!==instant(input.data.follow_up_at)||receipt.changed!==(instant(input.data.expected_follow_up_at)!==instant(input.data.follow_up_at)))throw new ServiceUnavailableException('Schedule unavailable');
  return parsed.data;
 }
}
