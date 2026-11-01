import { describe, expect, it } from 'vitest';
import { DemoFakeInboxItemSchema, DemoFakeInboxListSchema } from '../../packages/contracts/src/fake-inbox';

const item = {
  id: '97000000-0000-4000-8000-000000000001',
  conversation_ref: 'DEMO-CHAT-001',
  message_ref: 'DEMO-MSG-901-001',
  sequence: 1,
  text: 'Bonjour, le cabinet est-il ouvert samedi ?',
  occurred_at: '2026-10-30T09:14:00+01:00',
  received_at: '2026-10-30T09:14:01+01:00',
};

describe('local synthetic fake inbox contract', () => {
  it('accepts only bounded synthetic message fields', () => {
    expect(DemoFakeInboxItemSchema.safeParse(item).success).toBe(true);
    expect(DemoFakeInboxItemSchema.safeParse({ ...item, phone: '+212600000000' }).success).toBe(false);
    expect(DemoFakeInboxItemSchema.safeParse({ ...item, text: 'J’ai mal à une dent' }).success).toBe(false);
    expect(DemoFakeInboxItemSchema.safeParse({ ...item, conversation_ref: '+212600000000' }).success).toBe(false);
  });

  it('accepts a bounded list and rejects extra response fields', () => {
    expect(DemoFakeInboxListSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(DemoFakeInboxListSchema.safeParse({ items: [item], clinic_id: '10000000-0000-4000-8000-000000000001' }).success).toBe(false);
  });
});
