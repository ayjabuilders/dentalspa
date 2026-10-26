import type { FollowUpList, FollowUpRecorded, RecordFollowUp } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const FOLLOW_UP_REPOSITORY=Symbol('FOLLOW_UP_REPOSITORY');
export interface FollowUpRepository {
  list(actor:Actor,inquiryId:string):Promise<FollowUpList>;
  record(actor:Actor,inquiryId:string,input:RecordFollowUp,key:string,correlationId:string):Promise<FollowUpRecorded>;
}
