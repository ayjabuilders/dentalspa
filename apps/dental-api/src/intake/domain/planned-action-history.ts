import type { InquiryPlannedActionHistory } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const PLANNED_ACTION_HISTORY_REPOSITORY=Symbol('PLANNED_ACTION_HISTORY_REPOSITORY');
export interface PlannedActionHistoryRepository {list(actor:Actor,id:string):Promise<InquiryPlannedActionHistory>}
