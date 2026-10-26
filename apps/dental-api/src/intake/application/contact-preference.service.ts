import { BadRequestException,ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquiryContactPreferenceStateSchema,InquiryContactPreferenceResultSchema,SetInquiryContactPreferenceSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { safeCorrelation } from '../../audit/redaction';
import { CONTACT_PREFERENCE_REPOSITORY,type ContactPreferenceRepository } from '../domain/contact-preference';
@Injectable()
export class ContactPreferenceService {
 constructor(@Inject(CONTACT_PREFERENCE_REPOSITORY) private readonly repository:ContactPreferenceRepository){}
 private authorize(actor:Actor){if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role)))throw new ForbiddenException();}
 private id(value:unknown){const id=z.uuid().safeParse(value);if(!id.success)throw new BadRequestException();return id.data.toLowerCase();}
 private async invoke<T>(fn:()=>Promise<T>){try{return await fn();}catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException('Contact preference unavailable');}}
 private scope(item:{inquiry_id:string;clinic_id:string;owner_user_id:string},actor:Actor,id:string){return item.inquiry_id.toLowerCase()===id&&item.clinic_id.toLowerCase()===actor.clinicId.toLowerCase()&&item.owner_user_id.toLowerCase()===actor.userId.toLowerCase();}
 async get(actor:Actor,id:unknown){this.authorize(actor);const inquiry=this.id(id);const parsed=InquiryContactPreferenceStateSchema.safeParse(await this.invoke(()=>this.repository.get(actor,inquiry)));if(!parsed.success||!this.scope(parsed.data,actor,inquiry))throw new ServiceUnavailableException();return parsed.data;}
 async set(actor:Actor,id:unknown,body:unknown,key:unknown,correlation?:string){
  this.authorize(actor);if(process.env.ENABLE_INTAKE_COMMANDS!=='true')throw new ServiceUnavailableException({statusCode:503,code:'intake_disabled',message:'Intake commands are disabled'});
  const inquiry=this.id(id),requestKey=this.id(key),input=SetInquiryContactPreferenceSchema.safeParse(body);if(!input.success)throw new BadRequestException();
  const parsed=InquiryContactPreferenceResultSchema.safeParse(await this.invoke(()=>this.repository.set(actor,inquiry,input.data,requestKey,safeCorrelation(correlation))));
  if(!parsed.success||!this.scope(parsed.data.receipt,actor,inquiry)||parsed.data.receipt.previous_revision!==input.data.expected_revision||parsed.data.receipt.preference!==input.data.preference)throw new ServiceUnavailableException();return parsed.data;
 }
}
