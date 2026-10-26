import type { InquiryOwnerSearchRequest,InquiryOwnerSearchResult } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const OWNER_SEARCH_REPOSITORY=Symbol('OWNER_SEARCH_REPOSITORY');
export interface OwnerSearchRepository {search(actor:Actor,input:InquiryOwnerSearchRequest):Promise<InquiryOwnerSearchResult>}
