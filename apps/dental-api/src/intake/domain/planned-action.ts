import type { InquiryPlannedActionState,InquiryPlannedActionResult,SetInquiryPlannedAction } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const PLANNED_ACTION_REPOSITORY=Symbol('PLANNED_ACTION_REPOSITORY');
export interface PlannedActionRepository {
 get(actor:Actor,id:string):Promise<InquiryPlannedActionState>;
 set(actor:Actor,id:string,input:SetInquiryPlannedAction,key:string,correlationId:string):Promise<InquiryPlannedActionResult>;
}
