import { financeActivationKey } from '../../identity/infrastructure/module-activation';
import {PostLocalInvoiceCreditSchema,LocalInvoiceCreditReceiptSchema,LocalInvoiceCreditContextSchema,LocalInvoiceCreditDocumentSchema} from '@dental/contracts';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PrepareLocalInvoiceSchema, IssueLocalInvoiceSchema, LocalInvoiceDraftReceiptSchema, LocalInvoiceIssuedReceiptSchema, LocalInvoiceListSchema } from '@dental/contracts';
import { z } from 'zod';
import type { Actor } from '../../identity/domain/access';
import { scopedClient } from '../../identity/infrastructure/supabase';

@Injectable()
export class LocalInvoicesService {
  private creditIds(patient:string,invoice:string,credit?:string){if(![patient,invoice,...(credit?[credit]:[])].every(id=>z.uuid().safeParse(id).success))throw new BadRequestException('Invalid credit resource');}
  async creditContext(actor:Actor,patient:string,invoice:string){const gate=this.gate(actor);this.creditIds(patient,invoice);const result=LocalInvoiceCreditContextSchema.safeParse(await this.call(actor,'read_local_invoice_credit_context',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_invoice_id:invoice,p_gate:gate}));if(!result.success||result.data.clinic_id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.patient_id.toLowerCase()!==patient.toLowerCase()||result.data.invoice_id.toLowerCase()!==invoice.toLowerCase())throw new ServiceUnavailableException('Credit context unavailable');return result.data;}
  async creditDocument(actor:Actor,patient:string,invoice:string,credit:string){const gate=this.gate(actor);this.creditIds(patient,invoice,credit);const result=LocalInvoiceCreditDocumentSchema.safeParse(await this.call(actor,'read_local_invoice_credit_document',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_invoice_id:invoice,p_credit_id:credit,p_gate:gate}));if(!result.success||result.data.snapshot.invoice_snapshot.clinic.id.toLowerCase()!==actor.clinicId.toLowerCase()||result.data.patient_id.toLowerCase()!==patient.toLowerCase()||result.data.invoice_id.toLowerCase()!==invoice.toLowerCase()||result.data.credit_id.toLowerCase()!==credit.toLowerCase())throw new ServiceUnavailableException('Credit document unavailable');return result.data;}
  async postCredit(actor:Actor,patient:string,invoice:string,body:unknown,key:unknown){const gate=this.gate(actor);this.creditIds(patient,invoice);const command=PostLocalInvoiceCreditSchema.safeParse(body);if(!command.success||!z.uuid().safeParse(key).success)throw new BadRequestException('Invalid credit');const result=LocalInvoiceCreditReceiptSchema.safeParse(await this.call(actor,'post_local_invoice_credit',{p_clinic_id:actor.clinicId,p_patient_id:patient,p_invoice_id:invoice,p_amount_minor:command.data.amount_minor,p_reason:command.data.reason,p_request_key:key,p_gate:gate}));if(!result.success||result.data.patient_id.toLowerCase()!==patient.toLowerCase()||result.data.invoice_id.toLowerCase()!==invoice.toLowerCase()||result.data.amount_minor!==command.data.amount_minor)throw new ServiceUnavailableException('Credit acknowledgement unavailable');return result.data;}
  async list(actor: Actor, patientId: string) {
    const gate=this.gate(actor);
    if(!z.uuid().safeParse(patientId).success)throw new BadRequestException('Invalid patient');
    const result=LocalInvoiceListSchema.safeParse(await this.call(actor,'read_local_invoices',{p_clinic_id:actor.clinicId,p_patient_id:patientId,p_gate:gate}));
    if(!result.success||result.data.items.some(item=>item.patient_id.toLowerCase()!==patientId.toLowerCase()||item.snapshot.clinic.id.toLowerCase()!==actor.clinicId.toLowerCase()))throw new ServiceUnavailableException('Invoice data unavailable');
    return result.data;
  }
  private gate(actor: Actor) {
    if (!actor.roles.includes('manager')) throw new ForbiddenException('Invoice access denied');
    const key=financeActivationKey('invoices');
    if(!key)throw new ServiceUnavailableException('Finance module unavailable');
    return key;
  }
  private async call(actor: Actor, name: string, parameters: Record<string, unknown>) {
    const { data, error } = await scopedClient(actor.token).rpc(name, parameters)
      .then(result => result, () => { throw new ServiceUnavailableException('Invoice service unavailable'); });
    if (error) {
      if (error.code === '28000') throw new UnauthorizedException('Session expired');
      if (error.code === '42501') throw new ForbiddenException('Invoice access denied');
      if (error.code === 'PT404') throw new NotFoundException('Invoice resource unavailable');
      if (['SH409', 'SH410'].includes(error.code)) throw new ConflictException('Invoice command conflicts with current data');
      if (error.code === '22023') throw new BadRequestException('Invalid invoice command');
      throw new ServiceUnavailableException('Invoice service unavailable');
    }
    return data;
  }
  async prepare(actor: Actor, patientId: string, body: unknown, key: unknown) {
    const gate = this.gate(actor), command = PrepareLocalInvoiceSchema.safeParse(body);
    if (!command.success || !z.uuid().safeParse(patientId).success || !z.uuid().safeParse(key).success) throw new BadRequestException('Invalid invoice preparation');
    const result = LocalInvoiceDraftReceiptSchema.safeParse(await this.call(actor, 'prepare_local_invoice', {
      p_clinic_id: actor.clinicId, p_patient_id: patientId, p_quote_id: command.data.quote_id,
      p_quote_version: command.data.quote_version, p_request_key: key, p_gate: gate,
    }));
    if (!result.success || result.data.patient_id.toLowerCase() !== patientId.toLowerCase() || result.data.quote_id.toLowerCase() !== command.data.quote_id.toLowerCase() || result.data.quote_version !== command.data.quote_version) throw new ServiceUnavailableException('Invoice receipt unavailable');
    return result.data;
  }
  async issue(actor: Actor, patientId: string, invoiceId: string, body: unknown, key: unknown) {
    const gate = this.gate(actor);
    if (!IssueLocalInvoiceSchema.safeParse(body).success || !z.uuid().safeParse(patientId).success || !z.uuid().safeParse(invoiceId).success || !z.uuid().safeParse(key).success) throw new BadRequestException('Invalid invoice issuance');
    const result = LocalInvoiceIssuedReceiptSchema.safeParse(await this.call(actor, 'issue_local_invoice', {
      p_clinic_id: actor.clinicId, p_patient_id: patientId, p_invoice_id: invoiceId, p_request_key: key, p_gate: gate,
    }));
    if (!result.success || result.data.patient_id.toLowerCase() !== patientId.toLowerCase() || result.data.invoice_id.toLowerCase() !== invoiceId.toLowerCase()) throw new ServiceUnavailableException('Invoice receipt unavailable');
    return result.data;
  }
}
