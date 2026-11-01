import { financeActivationKey } from '../../identity/infrastructure/module-activation.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { QuoteCatalogSchema, QuoteDraftCommandSchema, QuoteDraftReceiptSchema, QuoteRevisionCommandSchema, QuoteRevisionReceiptSchema, FinanceCatalogSchema, FinanceCatalogCommandSchema, FinanceCatalogReceiptSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access.js';
import { scopedClient } from '../../identity/infrastructure/supabase.js';

@Injectable()
export class QuoteDraftsService {
  private gate(actor: Actor) {
    if (!actor.roles.includes('manager')) throw new ForbiddenException('Quote draft access denied');
    const key=financeActivationKey('quotes');
    if(!key)throw new ServiceUnavailableException('Finance module unavailable');
    return key;
  }
  private async call(actor: Actor, name: string, parameters: Record<string, unknown>) {
    const { data, error } = await scopedClient(actor.token).rpc(name, parameters)
      .then(result => result, () => { throw new ServiceUnavailableException('Quote service unavailable'); });
    if (error) {
      if (error.code === '28000') throw new UnauthorizedException('Session expired');
      if (error.code === '42501') throw new ForbiddenException('Quote draft access denied');
      if (error.code === 'PT404') throw new NotFoundException('Quote resource unavailable');
      if (['SH409', 'SH410'].includes(error.code)) throw new ConflictException('Quote command conflicts with current data');
      if (error.code === '22023') throw new BadRequestException('Invalid quote command');
      throw new ServiceUnavailableException('Quote service unavailable');
    }
    return data;
  }
  async catalog(actor: Actor) {
    const gate = this.gate(actor);
    const result = QuoteCatalogSchema.safeParse(await this.call(actor, 'read_local_quote_catalog', { p_clinic_id: actor.clinicId, p_gate: gate }));
    if (!result.success) throw new ServiceUnavailableException('Quote catalogue unavailable');
    return result.data;
  }
  async create(actor: Actor, patientId: string, body: unknown, key: unknown) {
    const gate = this.gate(actor);
    const command = QuoteDraftCommandSchema.safeParse(body);
    if (!command.success || !z.uuid().safeParse(key).success || !z.uuid().safeParse(patientId).success) throw new BadRequestException('Invalid quote command');
    const result = QuoteDraftReceiptSchema.safeParse(await this.call(actor, 'create_local_quote_draft', {
      p_clinic_id: actor.clinicId, p_patient_id: patientId, p_payload: command.data, p_request_key: key, p_gate: gate,
    }));
    if (!result.success || result.data.patient_id !== patientId) throw new ServiceUnavailableException('Quote receipt unavailable');
    return result.data;
  }
  async revise(actor: Actor, patientId: string, quoteId: string, body: unknown, key: unknown) {
    const gate = this.gate(actor);
    const command = QuoteRevisionCommandSchema.safeParse(body);
    if (!command.success || !z.uuid().safeParse(key).success || !z.uuid().safeParse(patientId).success || !z.uuid().safeParse(quoteId).success) throw new BadRequestException('Invalid quote revision');
    const result = QuoteRevisionReceiptSchema.safeParse(await this.call(actor, 'revise_local_quote_draft', {
      p_clinic_id: actor.clinicId, p_patient_id: patientId, p_quote_id: quoteId, p_expected_version: command.data.expected_version,
      p_payload: { lines: command.data.lines }, p_request_key: key, p_gate: gate,
    }));
    if (!result.success || result.data.patient_id !== patientId || result.data.quote_id !== quoteId || result.data.version !== command.data.expected_version + 1) throw new ServiceUnavailableException('Quote revision receipt unavailable');
    return result.data;
  }
  async services(actor:Actor){
    const gate=this.gate(actor);
    const result=FinanceCatalogSchema.safeParse(await this.call(actor,'read_local_finance_catalog',{p_clinic_id:actor.clinicId,p_gate:gate}));
    if(!result.success)throw new ServiceUnavailableException('Finance catalogue unavailable');
    return result.data;
  }
  async saveService(actor:Actor,body:unknown,key:unknown){
    const gate=this.gate(actor),command=FinanceCatalogCommandSchema.safeParse(body);
    if(!command.success||!z.uuid().safeParse(key).success)throw new BadRequestException('Invalid catalogue command');
    const result=FinanceCatalogReceiptSchema.safeParse(await this.call(actor,'save_local_finance_service',{p_clinic_id:actor.clinicId,p_payload:command.data,p_request_key:key,p_gate:gate}));
    if(!result.success)throw new ServiceUnavailableException('Catalogue receipt unavailable');
    const input=command.data,receipt=result.data;
    if((input.service_id&&input.service_id.toLowerCase()!==receipt.service_id.toLowerCase())||receipt.price_version!==input.expected_version+1||receipt.code!==input.code||receipt.label!==input.label||receipt.category!==(input.category||null)||receipt.archived!==input.archived||receipt.unit_amount_minor!==input.unit_amount_minor)throw new ServiceUnavailableException('Catalogue receipt unavailable');
    return receipt;
  }
}
