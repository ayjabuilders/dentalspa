import type { InquiryScheduleResult,SetInquirySchedule } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const INQUIRY_SCHEDULE_REPOSITORY=Symbol('INQUIRY_SCHEDULE_REPOSITORY');
export interface InquiryScheduleRepository {set(actor:Actor,id:string,input:SetInquirySchedule,key:string,correlationId:string):Promise<InquiryScheduleResult>}
