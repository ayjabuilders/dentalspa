import { z } from 'zod';

const DemoConversationRef = z.string().regex(/^DEMO-CHAT-[0-9]{3}$/);
const DemoMessageRef = z.string().regex(/^DEMO-MSG-[0-9]{3}-[0-9]{3}$/);
const BaseEvent = z.object({
  provider_event_id: z.uuid(),
  conversation_ref: DemoConversationRef,
  sequence: z.number().int().min(1).max(1_000_000),
  occurred_at: z.iso.datetime({ offset: true }),
});

export const FakeInboundMessageEventSchema = BaseEvent.extend({
  kind: z.literal('message.inbound'),
  message_ref: DemoMessageRef,
  text: z.string().trim().min(1).max(1000),
}).strict();

export const FakeDeliveryStatusEventSchema = BaseEvent.extend({
  kind: z.literal('message.status'),
  message_ref: DemoMessageRef,
  status: z.enum(['accepted', 'sent', 'delivered', 'read', 'failed', 'unknown']),
}).strict();

export const FakeProviderEventSchema = z.discriminatedUnion('kind', [
  FakeInboundMessageEventSchema,
  FakeDeliveryStatusEventSchema,
]);

export type FakeInboundMessageEvent = z.infer<typeof FakeInboundMessageEventSchema>;
export type FakeDeliveryStatusEvent = z.infer<typeof FakeDeliveryStatusEventSchema>;
export type FakeProviderEvent = z.infer<typeof FakeProviderEventSchema>;
export type DeliveryState = 'queued' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';

export const MAX_FAKE_WEBHOOK_BYTES = 16 * 1024;

export type SignedEventResult =
  | { ok: true; event: FakeProviderEvent }
  | { ok: false; reason: 'disabled' | 'signature' | 'payload' };

export type FakeEventResult =
  | { disposition: 'recorded-inbound'; message: FakeInboundMessageEvent }
  | { disposition: 'duplicate-event' | 'duplicate-message' }
  | { disposition: 'status-updated'; status: DeliveryState; sequence: number; automatic_retry: false }
  | { disposition: 'stale-status'; status: DeliveryState; sequence: number; automatic_retry: false }
  | { disposition: 'uncertain'; status: DeliveryState; sequence: number; automatic_retry: false }
  | { disposition: 'reconciliation-required'; status: DeliveryState; sequence: number; automatic_retry: false }
  | { disposition: 'unmatched-status'; automatic_retry: false };
