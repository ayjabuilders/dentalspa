import { parseSignedFakeProviderEvent } from '../infrastructure/fake-provider-signature.js';
import { LocalFakeProviderLedger } from '../infrastructure/fake-provider-ledger.js';
import type { FakeEventResult, SignedEventResult } from '../domain/fake-provider.js';

export type FakeWebhookAcceptance =
  | { accepted: true; result: FakeEventResult }
  | { accepted: false; reason: 'disabled' | 'signature' | 'payload' };

export class FakeProviderWebhookAdapter {
  constructor(private readonly ledger: LocalFakeProviderLedger) {}

  verify(rawBody: Buffer, signature: string | undefined, secret: string | undefined): SignedEventResult {
    return parseSignedFakeProviderEvent(rawBody, signature, secret);
  }

  accept(rawBody: Buffer, signature: string | undefined, secret: string | undefined): FakeWebhookAcceptance {
    const parsed: SignedEventResult = this.verify(rawBody, signature, secret);
    if (!parsed.ok) return { accepted: false, reason: parsed.reason };
    return { accepted: true, result: this.ledger.record(parsed.event) };
  }
}
