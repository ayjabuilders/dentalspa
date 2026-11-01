import { describe, expect, it } from 'vitest';
import { FakeProviderWebhookAdapter } from '../../apps/dental-api/src/communications/application/fake-provider-webhook.adapter';
import { LocalFakeProviderLedger } from '../../apps/dental-api/src/communications/infrastructure/fake-provider-ledger';
import { signFakeProviderPayload } from '../../apps/dental-api/src/communications/infrastructure/fake-provider-signature';

const secret = 'local-synthetic-fake-provider-secret-32';
const convo = 'DEMO-CHAT-001';
const outbound = 'DEMO-MSG-001-001';
const inbound = (overrides: Record<string, unknown> = {}) => ({
  provider_event_id: '00000000-0000-4000-8000-000000000001',
  conversation_ref: convo,
  sequence: 1,
  occurred_at: '2026-10-30T09:14:00+01:00',
  kind: 'message.inbound',
  message_ref: 'DEMO-MSG-001-002',
  text: 'Bonjour, le cabinet est-il ouvert samedi ?',
  ...overrides,
});
const status = (provider_event_id: string, sequence: number, state: string, overrides: Record<string, unknown> = {}) => ({
  provider_event_id,
  conversation_ref: convo,
  sequence,
  occurred_at: '2026-10-30T09:15:00+01:00',
  kind: 'message.status',
  message_ref: outbound,
  status: state,
  ...overrides,
});
const signed = (adapter: FakeProviderWebhookAdapter, value: unknown) => {
  const raw = Buffer.from(JSON.stringify(value), 'utf8');
  return adapter.accept(raw, signFakeProviderPayload(raw, secret), secret);
};

describe('local fake-provider webhook adapter', () => {
  it('verifies the signature over exact bytes before parsing the strict event', () => {
    const adapter = new FakeProviderWebhookAdapter(new LocalFakeProviderLedger());
    const raw = Buffer.from(JSON.stringify(inbound()), 'utf8');
    const signature = signFakeProviderPayload(raw, secret);
    expect(adapter.accept(raw, signature, secret).accepted).toBe(true);
    expect(adapter.accept(Buffer.from(`${raw.toString()} `), signature, secret)).toEqual({ accepted: false, reason: 'signature' });
    expect(adapter.accept(raw, signature, undefined)).toEqual({ accepted: false, reason: 'disabled' });
    expect(() => signFakeProviderPayload(raw, 'short')).toThrow('Fake provider secret is too short');
  });

  it('rejects malformed, oversized, non-demo and extra-field payloads without echoing content', () => {
    const adapter = new FakeProviderWebhookAdapter(new LocalFakeProviderLedger());
    const malformed = Buffer.from('{"private":"synthetic only"}', 'utf8');
    expect(adapter.accept(malformed, signFakeProviderPayload(malformed, secret), secret)).toEqual({ accepted: false, reason: 'payload' });
    const oversized = Buffer.alloc(16 * 1024 + 1, 65);
    expect(adapter.accept(oversized, signFakeProviderPayload(oversized, secret), secret)).toEqual({ accepted: false, reason: 'payload' });
    expect(signed(adapter, inbound({ conversation_ref: 'real-phone-212600000000' }))).toEqual({ accepted: false, reason: 'payload' });
    expect(signed(adapter, inbound({ contact_phone: '+212600000000' }))).toEqual({ accepted: false, reason: 'payload' });
  });

  it('records only synthetic inbound text and deduplicates event and message identifiers', () => {
    const ledger = new LocalFakeProviderLedger();
    const adapter = new FakeProviderWebhookAdapter(ledger);
    const event = inbound();
    expect(signed(adapter, event)).toMatchObject({ accepted: true, result: { disposition: 'recorded-inbound' } });
    expect(signed(adapter, event)).toMatchObject({ accepted: true, result: { disposition: 'duplicate-event' } });
    expect(signed(adapter, inbound({ provider_event_id: '00000000-0000-4000-8000-000000000002' }))).toMatchObject({ accepted: true, result: { disposition: 'duplicate-message' } });
    expect(ledger.messages(convo)).toHaveLength(1);
    expect(ledger.messages('DEMO-CHAT-002')).toEqual([]);
  });

  it('rejects unmatched status events and ignores replayed or out-of-order delivery states', () => {
    const ledger = new LocalFakeProviderLedger();
    const adapter = new FakeProviderWebhookAdapter(ledger);
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000010', 1, 'sent'))).toMatchObject({ accepted: true, result: { disposition: 'unmatched-status', automatic_retry: false } });
    expect(ledger.registerQueuedDemoMessage(outbound, convo)).toBe(true);
    expect(ledger.registerQueuedDemoMessage(outbound, convo)).toBe(false);
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000011', 3, 'delivered'))).toMatchObject({ accepted: true, result: { disposition: 'status-updated', status: 'delivered', automatic_retry: false } });
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000012', 2, 'sent'))).toMatchObject({ accepted: true, result: { disposition: 'stale-status', status: 'delivered', automatic_retry: false } });
  });

  it('keeps unknown provider outcomes uncertain and never retries automatically', () => {
    const ledger = new LocalFakeProviderLedger();
    const adapter = new FakeProviderWebhookAdapter(ledger);
    ledger.registerQueuedDemoMessage(outbound, convo);
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000020', 1, 'unknown'))).toMatchObject({ accepted: true, result: { disposition: 'uncertain', status: 'queued', automatic_retry: false } });
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000021', 2, 'delivered'))).toMatchObject({ accepted: true, result: { disposition: 'reconciliation-required', status: 'queued', automatic_retry: false } });
  });

  it('treats failed delivery as terminal for automatic retry and requires reconciliation for conflict', () => {
    const ledger = new LocalFakeProviderLedger();
    const adapter = new FakeProviderWebhookAdapter(ledger);
    ledger.registerQueuedDemoMessage(outbound, convo);
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000030', 1, 'failed'))).toMatchObject({ accepted: true, result: { disposition: 'status-updated', status: 'failed', automatic_retry: false } });
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000031', 2, 'sent'))).toMatchObject({ accepted: true, result: { disposition: 'reconciliation-required', status: 'failed', automatic_retry: false } });
  });

  it('does not regress a delivered message to failed or unknown without reconciliation', () => {
    const ledger = new LocalFakeProviderLedger();
    const adapter = new FakeProviderWebhookAdapter(ledger);
    ledger.registerQueuedDemoMessage(outbound, convo);
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000040', 1, 'delivered'))).toMatchObject({ accepted: true, result: { disposition: 'status-updated', status: 'delivered' } });
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000041', 2, 'failed'))).toMatchObject({ accepted: true, result: { disposition: 'reconciliation-required', status: 'delivered', automatic_retry: false } });
    expect(signed(adapter, status('00000000-0000-4000-8000-000000000042', 3, 'unknown'))).toMatchObject({ accepted: true, result: { disposition: 'reconciliation-required', status: 'delivered', automatic_retry: false } });
  });
});
