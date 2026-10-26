import type { Inquiry,InquiryOwnerWorklist } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const OWNER_WORKLIST_REPOSITORY=Symbol('OWNER_WORKLIST_REPOSITORY');
export interface OwnerWorklistRepository {
  list(actor:Actor):Promise<InquiryOwnerWorklist>;
  find(actor:Actor,id:string):Promise<Inquiry>;
}
