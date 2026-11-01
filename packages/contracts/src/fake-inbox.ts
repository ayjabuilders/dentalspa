import { z } from 'zod';

export const DemoFakeWebhookEventSchema = z.object({
  provider_event_id: z.uuid(),
  conversation_ref: z.string().regex(/^DEMO-CHAT-[0-9]{3}$/),
  sequence: z.number().int().min(1).max(1_000_000),
  occurred_at: z.iso.datetime({ offset: true }),
  kind: z.literal('message.inbound'),
  message_ref: z.string().regex(/^DEMO-MSG-[0-9]{3}-[0-9]{3}$/),
  text: z.enum([
    'Bonjour, le cabinet est-il ouvert samedi ?',
    'Bonjour, puis-je déplacer mon rendez-vous ?',
    'Bonjour, je souhaite connaître les horaires.',
  ]),
}).strict();

export type DemoFakeWebhookEvent = z.infer<typeof DemoFakeWebhookEventSchema>;

export const DemoFakeInboundAcknowledgementSchema = z.object({
  accepted: z.literal(true),
  disposition: z.enum(['recorded-inbound', 'duplicate-event', 'duplicate-message']),
}).strict();

export const DemoFakeInboxItemSchema = z.object({
  id: z.uuid(),
  conversation_ref: z.string().regex(/^DEMO-CHAT-[0-9]{3}$/),
  message_ref: z.string().regex(/^DEMO-MSG-[0-9]{3}-[0-9]{3}$/),
  sequence: z.number().int().min(1).max(1_000_000),
  text: z.enum([
    'Bonjour, le cabinet est-il ouvert samedi ?',
    'Bonjour, puis-je déplacer mon rendez-vous ?',
    'Bonjour, je souhaite connaître les horaires.',
  ]),
  occurred_at: z.iso.datetime({ offset: true }),
  received_at: z.iso.datetime({ offset: true }),
}).strict();

export const DemoFakeInboxListSchema = z.object({ items: z.array(DemoFakeInboxItemSchema).max(100) }).strict();
export type DemoFakeInboxItem = z.infer<typeof DemoFakeInboxItemSchema>;
