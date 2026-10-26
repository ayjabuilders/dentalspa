import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CreateInquirySchema, InquiryCreatedSchema, InquiryListSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { safeCorrelation } from '../../audit/redaction';
import { INTAKE_REPOSITORY, type IntakeRepository } from '../domain/intake';

@Injectable()
export class IntakeService {
  constructor(@Inject(INTAKE_REPOSITORY) private readonly repository: IntakeRepository) {}
  private authorize(actor: Actor) {
    if (!actor.roles.some(role => ['reception','manager','dentist'].includes(role))) throw new ForbiddenException('Intake scope denied');
  }
  async list(actor: Actor) {
    this.authorize(actor);
    const parsed = InquiryListSchema.safeParse(await this.repository.list(actor));
    if (!parsed.success || parsed.data.items.some(item => item.clinic_id !== actor.clinicId)) throw new ServiceUnavailableException('Inquiry list unavailable');
    return parsed.data;
  }
  async create(actor: Actor, body: unknown, key: unknown, correlationId?: string) {
    this.authorize(actor);
    if (process.env.ENABLE_INTAKE_COMMANDS !== 'true') throw new ServiceUnavailableException({statusCode:503,code:'intake_disabled',message:'Intake commands are disabled'});
    const input = CreateInquirySchema.safeParse(body);
    const requestKey = z.uuid().safeParse(key);
    if (!input.success || !requestKey.success) throw new BadRequestException('Invalid inquiry input or idempotency key');
    const result = InquiryCreatedSchema.safeParse(await this.repository.create(actor,input.data,requestKey.data,safeCorrelation(correlationId)));
    if (!result.success || result.data.item.clinic_id !== actor.clinicId || result.data.item.owner_user_id !== actor.userId) throw new ServiceUnavailableException('Inquiry result unavailable');
    return result.data;
  }
}
