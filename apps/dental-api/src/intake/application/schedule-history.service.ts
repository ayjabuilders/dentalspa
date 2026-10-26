import { BadRequestException,ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquiryScheduleHistorySchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { SCHEDULE_HISTORY_REPOSITORY,type ScheduleHistoryRepository } from '../domain/schedule-history';
@Injectable()
export class ScheduleHistoryService {
 constructor(@Inject(SCHEDULE_HISTORY_REPOSITORY) private readonly repository:ScheduleHistoryRepository){}
 async list(actor:Actor,id:unknown){
  if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException();
  const parsedId=z.uuid().safeParse(id);if(!parsedId.success)throw new BadRequestException();
  let raw:unknown;try{raw=await this.repository.list(actor,parsedId.data.toLowerCase());}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException();}
  const result=InquiryScheduleHistorySchema.safeParse(raw);
  if(!result.success||result.data.inquiry_id.toLowerCase()!==parsedId.data.toLowerCase())throw new ServiceUnavailableException();
  return result.data;
 }
}
