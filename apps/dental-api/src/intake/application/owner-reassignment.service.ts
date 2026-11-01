import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InquiryOwnerAssignmentResultSchema, SetInquiryOwnerSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access.js';
import { safeCorrelation } from '../../audit/redaction.js';
import { INQUIRY_OWNER_REASSIGNMENT_REPOSITORY, type InquiryOwnerReassignmentRepository } from '../domain/owner-reassignment.js';

@Injectable()
export class InquiryOwnerReassignmentService {
  constructor(@Inject(INQUIRY_OWNER_REASSIGNMENT_REPOSITORY) private readonly repository: InquiryOwnerReassignmentRepository) {}

  async assign(actor: Actor, inquiryId: unknown, body: unknown, key: unknown, correlationId?: string) {
    if (!actor.roles.includes('manager')) throw new ForbiddenException('Owner reassignment scope denied');
    if (process.env.ENABLE_INTAKE_COMMANDS !== 'true') throw new ServiceUnavailableException({ statusCode: 503, code: 'intake_disabled', message: 'Intake commands are disabled' });
    const id = z.uuid().safeParse(inquiryId), requestKey = z.uuid().safeParse(key), input = SetInquiryOwnerSchema.safeParse(body);
    if (!id.success || !requestKey.success || !input.success) throw new BadRequestException('Invalid owner reassignment request');
    let raw: unknown;
    try { raw = await this.repository.assign(actor, id.data.toLowerCase(), input.data, requestKey.data.toLowerCase(), safeCorrelation(correlationId)); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Owner reassignment unavailable');
    }
    const result = InquiryOwnerAssignmentResultSchema.safeParse(raw);
    if (!result.success) throw new ServiceUnavailableException('Owner reassignment result unavailable');
    const receipt = result.data.receipt;
    if (receipt.inquiry_id.toLowerCase() !== id.data.toLowerCase() || receipt.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || receipt.previous_owner_user_id.toLowerCase() !== input.data.expected_owner_user_id.toLowerCase() || receipt.owner_user_id.toLowerCase() !== input.data.owner_user_id.toLowerCase() || receipt.changed !== (receipt.previous_owner_user_id.toLowerCase() !== receipt.owner_user_id.toLowerCase())) {
      throw new ServiceUnavailableException('Owner reassignment result unavailable');
    }
    return result.data;
  }
}
