import { BadRequestException,ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquiryPlannedActionHistorySchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { PLANNED_ACTION_HISTORY_REPOSITORY,type PlannedActionHistoryRepository } from '../domain/planned-action-history';
@Injectable()
export class PlannedActionHistoryService {
 constructor(@Inject(PLANNED_ACTION_HISTORY_REPOSITORY) private readonly repository:PlannedActionHistoryRepository){}
 async list(actor:Actor,id:unknown){
  if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException();
  const parsedId=z.uuid().safeParse(id);if(!parsedId.success)throw new BadRequestException();
  let raw:unknown;try{raw=await this.repository.list(actor,parsedId.data.toLowerCase());}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException();}
  const result=InquiryPlannedActionHistorySchema.safeParse(raw);
  if(!result.success||result.data.inquiry_id.toLowerCase()!==parsedId.data.toLowerCase())throw new ServiceUnavailableException();
  return result.data;
 }
}
