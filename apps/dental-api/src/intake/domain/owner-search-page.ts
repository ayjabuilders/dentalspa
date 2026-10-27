import type { InquiryOwnerSearchPageRequest,InquiryOwnerSearchPageResult } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const OWNER_SEARCH_PAGE_REPOSITORY=Symbol('OWNER_SEARCH_PAGE_REPOSITORY');
export interface OwnerSearchPageRepository {search(actor:Actor,input:InquiryOwnerSearchPageRequest):Promise<InquiryOwnerSearchPageResult>}
