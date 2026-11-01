import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InquiryContactOutcomeListSchema, InquiryContactOutcomeRecordedSchema, type RecordInquiryContactOutcome } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';
import { scopedClient } from '../../identity/infrastructure/supabase.js';
import type { InquiryContactOutcomeRepository } from '../domain/contact-outcome.js';

export class SupabaseInquiryContactOutcome implements InquiryContactOutcomeRepository {
  async list(actor: Actor, inquiryId: string) {
    const data = await this.call(actor, 'list_inquiry_contact_outcomes', { p_inquiry_id: inquiryId });
    const parsed = InquiryContactOutcomeListSchema.safeParse(data);
    if (!parsed.success) throw new ServiceUnavailableException('Contact outcome history unavailable');
    return parsed.data;
  }

  async record(actor: Actor, inquiryId: string, input: RecordInquiryContactOutcome, key: string, correlationId: string) {
    const data = await this.call(actor, 'record_inquiry_contact_outcome', {
      p_inquiry_id: inquiryId,
      p_payload: input,
      p_request_key: key,
      p_correlation_id: correlationId,
    });
    const parsed = InquiryContactOutcomeRecordedSchema.safeParse(data);
    if (!parsed.success) throw new ServiceUnavailableException('Contact outcome result unavailable');
    return parsed.data;
  }

  private async call(actor: Actor, procedure: string, args: Record<string, unknown>) {
    let result;
    try {
      result = await scopedClient(actor.token).rpc(procedure, { ...args, p_clinic_id: actor.clinicId }, { get: false, head: false });
    } catch {
      throw new ServiceUnavailableException('Contact outcome history unavailable');
    }
    const code = result.error?.code;
    if (!code) return result.data as unknown;
    if (code === '28000' || code === 'PGRST301' || code === 'PGRST302') throw new UnauthorizedException('Authentication required');
    if (code === '42501') throw new ForbiddenException('Contact outcome scope denied');
    if (code === 'PT404') throw new NotFoundException('Inquiry not found');
    if (code === 'PT409') throw new ConflictException('Contact outcome idempotency conflict');
    if (code === '22023' || code === '22P02') throw new BadRequestException('Invalid contact outcome request');
    if (code === 'PT503') throw new ServiceUnavailableException({ statusCode: 503, code: 'contact_outcomes_disabled', message: 'Contact outcome history is disabled pending privacy review' });
    throw new ServiceUnavailableException('Contact outcome history unavailable');
  }
}
