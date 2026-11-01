import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InquiryContactOutcomeListSchema, InquiryContactOutcomeRecordedSchema, RecordInquiryContactOutcomeSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access.js';
import { safeCorrelation } from '../../audit/redaction.js';
import { INQUIRY_CONTACT_OUTCOME_REPOSITORY, type InquiryContactOutcomeRepository } from '../domain/contact-outcome.js';

@Injectable()
export class InquiryContactOutcomeService {
  constructor(@Inject(INQUIRY_CONTACT_OUTCOME_REPOSITORY) private readonly repository: InquiryContactOutcomeRepository) {}

  private authorize(actor: Actor) {
    if (!actor.roles.some(role => ['reception', 'manager', 'dentist'].includes(role))) throw new ForbiddenException('Contact outcome scope denied');
  }

  private id(value: unknown) {
    const parsed = z.uuid().safeParse(value);
    if (!parsed.success) throw new BadRequestException('Invalid contact outcome identifier or key');
    return parsed.data.toLowerCase();
  }

  private assertEnabled() {
    if (process.env.ENABLE_INQUIRY_CONTACT_OUTCOMES !== 'true') {
      throw new ServiceUnavailableException({ statusCode: 503, code: 'contact_outcomes_disabled', message: 'Contact outcome history is disabled pending privacy review' });
    }
  }

  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Contact outcome history unavailable');
    }
  }

  async list(actor: Actor, id: unknown) {
    this.authorize(actor);
    this.assertEnabled();
    const inquiryId = this.id(id);
    const result = InquiryContactOutcomeListSchema.safeParse(await this.invoke(() => this.repository.list(actor, inquiryId)));
    if (!result.success || result.data.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || result.data.inquiry_id.toLowerCase() !== inquiryId || result.data.items.some(item => item.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || item.inquiry_id.toLowerCase() !== inquiryId)) {
      throw new ServiceUnavailableException('Contact outcome history unavailable');
    }
    return result.data;
  }

  async record(actor: Actor, id: unknown, body: unknown, key: unknown, correlation?: string) {
    this.authorize(actor);
    this.assertEnabled();
    const inquiryId = this.id(id), requestKey = this.id(key), input = RecordInquiryContactOutcomeSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('Invalid contact outcome request');
    const result = InquiryContactOutcomeRecordedSchema.safeParse(await this.invoke(() => this.repository.record(actor, inquiryId, input.data, requestKey, safeCorrelation(correlation))));
    if (!result.success || result.data.item.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || result.data.item.inquiry_id.toLowerCase() !== inquiryId || result.data.item.outcome !== input.data.outcome) {
      throw new ServiceUnavailableException('Contact outcome result unavailable');
    }
    return result.data;
  }
}
