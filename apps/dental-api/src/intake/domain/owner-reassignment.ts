import type { Actor } from '../../identity/domain/access';
import type { InquiryOwnerAssignmentResult, SetInquiryOwner } from '@dental/contracts';

export const INQUIRY_OWNER_REASSIGNMENT_REPOSITORY = Symbol('INQUIRY_OWNER_REASSIGNMENT_REPOSITORY');
export interface InquiryOwnerReassignmentRepository {
  assign(actor: Actor, inquiryId: string, input: SetInquiryOwner, key: string, correlationId: string): Promise<InquiryOwnerAssignmentResult>;
}
