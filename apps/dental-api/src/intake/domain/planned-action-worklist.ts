import type { InquiryPlannedActionWorklist } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';
export const PLANNED_ACTION_WORKLIST_REPOSITORY=Symbol('PLANNED_ACTION_WORKLIST_REPOSITORY');
export interface PlannedActionWorklistRepository { list(actor:Actor):Promise<InquiryPlannedActionWorklist>; }
