import { BadRequestException,ForbiddenException,HttpException,Inject,Injectable,ServiceUnavailableException } from '@nestjs/common';
import { InquirySchema,InquiryOwnerWorklistSchema,type InquiryWorklistItem } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { OWNER_WORKLIST_REPOSITORY,type OwnerWorklistRepository } from '../domain/owner-worklist';
// Preserve PostgreSQL sub-millisecond ordering instead of rounding through Date alone.
export function compareInquiryInstants(a:string,b:string):number {
  const seconds=Math.floor(Date.parse(a)/1000)-Math.floor(Date.parse(b)/1000);
  if(seconds) return Math.sign(seconds);
  const fraction=(value:string)=>value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1]??'';
  const af=fraction(a),bf=fraction(b),length=Math.max(af.length,bf.length);
  const left=af.padEnd(length,'0'),right=bf.padEnd(length,'0');return left<right?-1:left>right?1:0;
}
const compareIds=(a:string,b:string)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0;
@Injectable()
export class OwnerWorklistService {
  constructor(@Inject(OWNER_WORKLIST_REPOSITORY) private readonly repository:OwnerWorklistRepository) {}
  private authorize(actor:Actor) {if(!actor.roles.some(role=>['reception','manager','dentist'].includes(role))) throw new ForbiddenException('Inquiry scope denied');}
  private owned(actor:Actor,item:{clinic_id:string;owner_user_id:string}) {return item.clinic_id.toLowerCase()===actor.clinicId.toLowerCase()&&item.owner_user_id.toLowerCase()===actor.userId.toLowerCase();}
  private async invoke<T>(operation:()=>Promise<T>) {try{return await operation();}catch(error){if(error instanceof HttpException) throw error;throw new ServiceUnavailableException('Inquiry unavailable');}}
  async list(actor:Actor) {
    this.authorize(actor);const parsed=InquiryOwnerWorklistSchema.safeParse(await this.invoke(()=>this.repository.list(actor)));
    if(!parsed.success) throw new ServiceUnavailableException('Inquiry worklist unavailable');
    const result=parsed.data,seen=new Set<string>();
    for(const name of ['overdue','upcoming','undated'] as const) {
      const bucket=result[name];let previous:InquiryWorklistItem|undefined;
      if(bucket.truncated&&bucket.items.length!==50) throw new ServiceUnavailableException('Inquiry worklist unavailable');
      for(const item of bucket.items) {
        const correctBucket=name==='undated'?item.follow_up_at===null:item.follow_up_at!==null&&(name==='overdue'?compareInquiryInstants(item.follow_up_at,result.observed_at)<=0:compareInquiryInstants(item.follow_up_at,result.observed_at)>0);
        if(!this.owned(actor,item)||!correctBucket||seen.has(item.id.toLowerCase())) throw new ServiceUnavailableException('Inquiry worklist unavailable');
        const order=previous?(name==='undated'?compareInquiryInstants(item.created_at,previous.created_at)||compareIds(item.id,previous.id):compareInquiryInstants(previous.follow_up_at!,item.follow_up_at!)||compareIds(previous.id,item.id)):0;
        if(order>0) throw new ServiceUnavailableException('Inquiry worklist unavailable');
        seen.add(item.id.toLowerCase());previous=item;
      }
    }
    return result;
  }
  async find(actor:Actor,id:unknown) {
    this.authorize(actor);const input=z.uuid().safeParse(id);if(!input.success) throw new BadRequestException('Invalid inquiry identifier');
    const result=InquirySchema.safeParse(await this.invoke(()=>this.repository.find(actor,input.data.toLowerCase())));
    if(!result.success||!this.owned(actor,result.data)||result.data.id.toLowerCase()!==input.data.toLowerCase()) throw new ServiceUnavailableException('Inquiry detail unavailable');return result.data;
  }
}
