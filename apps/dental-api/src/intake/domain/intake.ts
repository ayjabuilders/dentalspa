import type { CreateInquiry, InquiryCreated, InquiryList } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';
export const INTAKE_REPOSITORY = Symbol('INTAKE_REPOSITORY');
export interface IntakeRepository {
  list(actor: Actor): Promise<InquiryList>;
  create(actor: Actor, input: CreateInquiry, key: string, correlationId: string): Promise<InquiryCreated>;
}
