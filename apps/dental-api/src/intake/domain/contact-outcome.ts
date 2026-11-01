import type { InquiryContactOutcomeList, InquiryContactOutcomeRecorded, RecordInquiryContactOutcome } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';

export const INQUIRY_CONTACT_OUTCOME_REPOSITORY = Symbol('INQUIRY_CONTACT_OUTCOME_REPOSITORY');

export interface InquiryContactOutcomeRepository {
  list(actor: Actor, inquiryId: string): Promise<InquiryContactOutcomeList>;
  record(actor: Actor, inquiryId: string, input: RecordInquiryContactOutcome, key: string, correlationId: string): Promise<InquiryContactOutcomeRecorded>;
}
