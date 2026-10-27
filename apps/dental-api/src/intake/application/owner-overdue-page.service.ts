import { BadRequestException,ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquiryOwnerOverduePageRequestSchema,InquiryOwnerOverduePageResultSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { OWNER_OVERDUE_PAGE_REPOSITORY,type OwnerOverduePageRepository } from '../domain/owner-overdue-page';
@Injectable()
export class OwnerOverduePageService {
 constructor(@Inject(OWNER_OVERDUE_PAGE_REPOSITORY) private readonly repository:OwnerOverduePageRepository){}
 async page(actor:Actor,body:unknown){
  if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException();
  const input=InquiryOwnerOverduePageRequestSchema.safeParse(body);if(!input.success)throw new BadRequestException();
  let raw:unknown;try{raw=await this.repository.page(actor,input.data);}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException();}
  const result=InquiryOwnerOverduePageResultSchema.safeParse(raw);
  if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.owner_user_id.toLowerCase()!==actor.userId.toLowerCase()||JSON.stringify(result.data.after)!==JSON.stringify(input.data.after))throw new ServiceUnavailableException();
  return result.data;
 }
}
