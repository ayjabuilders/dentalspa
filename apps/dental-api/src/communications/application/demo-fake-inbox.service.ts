import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { DemoFakeInboundAcknowledgementSchema, DemoFakeInboxListSchema, DemoFakeWebhookEventSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';
import { scopedClient } from '../../identity/infrastructure/supabase.js';
import { FakeProviderWebhookAdapter } from './fake-provider-webhook.adapter.js';

function localPersistenceConfigured() {
  if (process.env.ENABLE_DEMO_FAKE_INBOX !== 'true'
    || process.env.ENABLE_LAN_DEMO_API === 'true'
    || process.env.VERCEL === '1'
    || (process.env.DEMO_FAKE_INBOX_HMAC_SECRET?.length ?? 0) < 32
    || !process.env.DEMO_FAKE_INBOX_DATABASE_GATE_KEY) return false;
  try {
    const url = new URL(process.env.SUPABASE_URL ?? '');
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  } catch { return false; }
}

@Injectable()
export class DemoFakeInboxService {
  constructor(private readonly adapter: FakeProviderWebhookAdapter) {}

  async receive(rawBody: Buffer, signature: string | undefined) {
    if (!localPersistenceConfigured()) throw new ServiceUnavailableException('Local synthetic inbox is disabled');
    const parsed = this.adapter.verify(rawBody, signature, process.env.DEMO_FAKE_INBOX_HMAC_SECRET);
    if (!parsed.ok) {
      if (parsed.reason === 'signature') throw new UnauthorizedException('Synthetic webhook signature rejected');
      if (parsed.reason === 'disabled') throw new ServiceUnavailableException('Local synthetic inbox is disabled');
      throw new BadRequestException('Invalid synthetic webhook event');
    }
    const inbound = DemoFakeWebhookEventSchema.safeParse(parsed.event);
    if (!inbound.success) {
      throw new BadRequestException('Only allowlisted synthetic inbound events are accepted');
    }
    try {
      const event = inbound.data;
      const { data, error } = await scopedClient().rpc('accept_demo_fake_inbound_message', {
        p_gate_key: process.env.DEMO_FAKE_INBOX_DATABASE_GATE_KEY,
        p_provider_event_id: event.provider_event_id,
        p_conversation_ref: event.conversation_ref,
        p_message_ref: event.message_ref,
        p_sequence: event.sequence,
        p_occurred_at: event.occurred_at,
        p_text: event.text,
      });
      if (error) {
        if (error.code === '42501') throw new ForbiddenException('Synthetic event scope denied');
        if (error.code === 'PT409') throw new BadRequestException('Synthetic event identifier conflict');
        if (['22023', '22007', '22008', '22P02'].includes(error.code ?? '')) throw new BadRequestException('Invalid synthetic webhook event');
        throw new Error('database');
      }
      const result = DemoFakeInboundAcknowledgementSchema.safeParse(data);
      if (!result.success) throw new Error('response');
      return result.data;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Synthetic inbox unavailable');
    }
  }

  async list(actor: Actor) {
    if (!actor.roles.some(role => role === 'reception' || role === 'manager')) throw new ForbiddenException('Reception or manager access required');
    try {
      const { data, error } = await scopedClient(actor.token).rpc('list_demo_fake_inbound_messages', { p_clinic_id: actor.clinicId });
      if (error) throw new Error('database');
      const result = DemoFakeInboxListSchema.safeParse({ items: data ?? [] });
      if (!result.success) throw new Error('response');
      return result.data;
    } catch {
      throw new ServiceUnavailableException('Synthetic inbox unavailable');
    }
  }
}
