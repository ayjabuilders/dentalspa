import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InquiryOwnerAssignmentResultSchema, type SetInquiryOwner } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';
import { scopedClient } from '../../identity/infrastructure/supabase.js';
import type { InquiryOwnerReassignmentRepository } from '../domain/owner-reassignment.js';

export class SupabaseInquiryOwnerReassignment implements InquiryOwnerReassignmentRepository {
  async assign(actor: Actor, inquiryId: string, input: SetInquiryOwner, key: string, correlationId: string) {
    let result;
    try {
      result = await scopedClient(actor.token).rpc('reassign_inquiry_owner', {
        p_clinic_id: actor.clinicId,
        p_inquiry_id: inquiryId,
        p_expected_owner_user_id: input.expected_owner_user_id,
        p_owner_user_id: input.owner_user_id,
        p_request_key: key,
        p_correlation_id: correlationId,
      }, { get: false, head: false });
    } catch { throw new ServiceUnavailableException('Owner reassignment unavailable'); }
    const code = result.error?.code;
    if (code === '28000' || code === 'PGRST301' || code === 'PGRST302') throw new UnauthorizedException('Authentication required');
    if (code === '42501') throw new ForbiddenException('Owner reassignment scope denied');
    if (code === 'PT404') throw new NotFoundException('Inquiry not found');
    if (code === 'PT409') throw new ConflictException('Inquiry owner changed or idempotency key conflicts');
    if (code === 'PT503') throw new ServiceUnavailableException({ statusCode: 503, code: 'intake_disabled', message: 'Intake commands are disabled' });
    if (result.error) throw new ServiceUnavailableException('Owner reassignment unavailable');
    const parsed = InquiryOwnerAssignmentResultSchema.safeParse(result.data);
    if (!parsed.success) throw new ServiceUnavailableException('Owner reassignment result unavailable');
    return parsed.data;
  }
}
