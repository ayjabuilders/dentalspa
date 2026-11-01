import type { DeliveryState, FakeEventResult, FakeProviderEvent } from '../domain/fake-provider';

type OutboundReceipt = { conversation_ref: string; status: DeliveryState; sequence: number; uncertain: boolean; failed: boolean };

/** Process-local synthetic ledger. It deliberately offers no durable or live-message capability. */
export class LocalFakeProviderLedger {
  private readonly seenEvents = new Set<string>();
  private readonly inboundMessages = new Map<string, Map<string, Extract<FakeProviderEvent, { kind: 'message.inbound' }>>>();
  private readonly outboundReceipts = new Map<string, OutboundReceipt>();

  registerQueuedDemoMessage(messageRef: string, conversationRef: string): boolean {
    if (this.outboundReceipts.has(messageRef)) return false;
    this.outboundReceipts.set(messageRef, { conversation_ref: conversationRef, status: 'queued', sequence: 0, uncertain: false, failed: false });
    return true;
  }

  record(event: FakeProviderEvent): FakeEventResult {
    if (this.seenEvents.has(event.provider_event_id)) return { disposition: 'duplicate-event' };
    this.seenEvents.add(event.provider_event_id);

    if (event.kind === 'message.inbound') {
      const existing = this.inboundMessages.get(event.conversation_ref) ?? new Map();
      this.inboundMessages.set(event.conversation_ref, existing);
      if (existing.has(event.message_ref)) return { disposition: 'duplicate-message' };
      existing.set(event.message_ref, event);
      return { disposition: 'recorded-inbound', message: event };
    }

    const receipt = this.outboundReceipts.get(event.message_ref);
    if (!receipt || receipt.conversation_ref !== event.conversation_ref) return { disposition: 'unmatched-status', automatic_retry: false };
    if (event.sequence <= receipt.sequence) return this.statusResult('stale-status', receipt);
    if (receipt.uncertain || receipt.failed) return this.statusResult('reconciliation-required', receipt);
    const rank: Record<DeliveryState, number> = { queued: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: -1 };
    if (event.status === 'unknown') {
      if (rank[receipt.status] >= rank.delivered) return this.statusResult('reconciliation-required', receipt);
      receipt.uncertain = true;
      receipt.sequence = event.sequence;
      return this.statusResult('uncertain', receipt);
    }
    if (event.status === 'failed') {
      if (rank[receipt.status] >= rank.delivered) return this.statusResult('reconciliation-required', receipt);
      receipt.failed = true;
      receipt.status = 'failed';
      receipt.sequence = event.sequence;
      return this.statusResult('status-updated', receipt);
    }

    if (rank[event.status] <= rank[receipt.status]) return this.statusResult('stale-status', receipt);
    receipt.status = event.status;
    receipt.sequence = event.sequence;
    return this.statusResult('status-updated', receipt);
  }

  messages(conversationRef: string) {
    return [...(this.inboundMessages.get(conversationRef)?.values() ?? [])].map(message => ({ ...message }));
  }

  private statusResult(disposition: Extract<FakeEventResult, { status: DeliveryState }>['disposition'], receipt: OutboundReceipt): FakeEventResult {
    return { disposition, status: receipt.status, sequence: receipt.sequence, automatic_retry: false };
  }
}
