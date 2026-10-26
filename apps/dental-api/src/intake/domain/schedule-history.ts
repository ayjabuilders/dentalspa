import type { InquiryScheduleHistory } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const SCHEDULE_HISTORY_REPOSITORY=Symbol('SCHEDULE_HISTORY_REPOSITORY');
export interface ScheduleHistoryRepository {list(actor:Actor,id:string):Promise<InquiryScheduleHistory>}
