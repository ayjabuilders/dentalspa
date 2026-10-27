import type { InquiryOwnerOverduePageRequest,InquiryOwnerOverduePageResult } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const OWNER_OVERDUE_PAGE_REPOSITORY=Symbol('OWNER_OVERDUE_PAGE_REPOSITORY');
export interface OwnerOverduePageRepository {page(actor:Actor,input:InquiryOwnerOverduePageRequest):Promise<InquiryOwnerOverduePageResult>}
