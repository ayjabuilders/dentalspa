import { createHmac, timingSafeEqual } from 'node:crypto';
import { FakeProviderEventSchema, MAX_FAKE_WEBHOOK_BYTES, type SignedEventResult } from '../domain/fake-provider';

const SECRET_MIN_BYTES = 32;
const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/;

export function signFakeProviderPayload(rawBody: Buffer, secret: string): string {
  if (Buffer.byteLength(secret, 'utf8') < SECRET_MIN_BYTES) throw new Error('Fake provider secret is too short');
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function parseSignedFakeProviderEvent(rawBody: Buffer, signature: string | undefined, secret: string | undefined): SignedEventResult {
  if (!secret || Buffer.byteLength(secret, 'utf8') < SECRET_MIN_BYTES) return { ok: false, reason: 'disabled' };
  if (rawBody.length < 1 || rawBody.length > MAX_FAKE_WEBHOOK_BYTES) return { ok: false, reason: 'payload' };
  const match = SIGNATURE_PATTERN.exec(signature ?? '');
  if (!match) return { ok: false, reason: 'signature' };

  const expected = Buffer.from(signFakeProviderPayload(rawBody, secret).slice('sha256='.length), 'hex');
  const supplied = Buffer.from(match[1]!, 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { ok: false, reason: 'signature' };

  let decoded: unknown;
  try { decoded = JSON.parse(rawBody.toString('utf8')); } catch { return { ok: false, reason: 'payload' }; }
  const parsed = FakeProviderEventSchema.safeParse(decoded);
  return parsed.success ? { ok: true, event: parsed.data } : { ok: false, reason: 'payload' };
}
