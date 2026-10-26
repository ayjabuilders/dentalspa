import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InquiryCreatedSchema, InquiryListSchema, type CreateInquiry } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';
import type { IntakeRepository } from '../domain/intake';

export function throwIntakeDatabaseError(error: { code?: string }): never {
  // Map SQLSTATE, not HTTP status or database messages that may contain inputs.
  if (error.code === '28000' || error.code === 'PGRST301' || error.code === 'PGRST302') throw new UnauthorizedException('Authentication required');
  if (error.code === '42501') throw new ForbiddenException('Intake scope denied');
  if (error.code === '22023' || error.code === '22P02' || error.code === '22007' || error.code === '22008') throw new BadRequestException('Invalid inquiry input');
  if (error.code === 'PT409') throw new ConflictException('Idempotency key conflicts with another inquiry');
  if (error.code === 'PT503') throw new ServiceUnavailableException({statusCode:503,code:'intake_disabled',message:'Intake commands are disabled'});
  throw new ServiceUnavailableException('Intake service unavailable');
}
@Injectable()
export class SupabaseIntake implements IntakeRepository {
  async list(actor: Actor) {
    const { data, error } = await this.call(actor,'list_inquiries',{p_clinic_id:actor.clinicId});
    if (error) throwIntakeDatabaseError(error);
    const result = InquiryListSchema.safeParse(data);
    if (!result.success) throw new ServiceUnavailableException('Inquiry list unavailable');
    return result.data;
  }
  async create(actor: Actor, input: CreateInquiry, key: string, correlationId: string) {
    const { data, error } = await this.call(actor,'create_inquiry',{p_clinic_id:actor.clinicId,p_request_key:key,p_payload:input,p_correlation_id:correlationId});
    if (error) throwIntakeDatabaseError(error);
    const result = InquiryCreatedSchema.safeParse(data);
    if (!result.success) throw new ServiceUnavailableException('Inquiry result unavailable');
    return result.data;
  }
  private async call(actor: Actor, procedure: string, params: Record<string,unknown>) {
    try { return await scopedClient(actor.token).rpc(procedure,params); }
    catch { throw new ServiceUnavailableException('Intake service unavailable'); }
  }
}
