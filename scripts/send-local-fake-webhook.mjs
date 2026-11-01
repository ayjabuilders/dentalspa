import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const apiEnv = readFileSync('apps/dental-api/.env.local', 'utf8');
const get = name => apiEnv.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1).trim();
const apiUrl = new URL(get('SUPABASE_URL') ?? '');
const secret = get('DEMO_FAKE_INBOX_HMAC_SECRET');
if (apiUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(apiUrl.hostname)
  || get('ENABLE_DEMO_FAKE_INBOX') !== 'true' || !secret || Buffer.byteLength(secret) < 32
  || !get('DEMO_FAKE_INBOX_DATABASE_GATE_KEY') || process.env.ENABLE_LAN_DEMO_API === 'true' || process.env.VERCEL === '1') {
  throw new Error('The local synthetic webhook is disabled or not configured for loopback.');
}
const port = Number(get('API_PORT') ?? '4300');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Local API port configuration is invalid.');
const event = {
  provider_event_id: randomUUID(),
  conversation_ref: 'DEMO-CHAT-001',
  sequence: Date.now() % 1_000_000 || 1,
  occurred_at: new Date().toISOString(),
  kind: 'message.inbound',
  message_ref: `DEMO-MSG-${randomInt(100, 1000)}-${randomInt(100, 1000)}`,
  text: 'Bonjour, le cabinet est-il ouvert samedi ?',
};
const raw = Buffer.from(JSON.stringify(event), 'utf8');
const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
const response = await fetch(`http://127.0.0.1:${port}/api/v1/communications/demo-webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Demo-Signature': signature },
  body: raw,
});
if (!response.ok) throw new Error(`The local demo API rejected the fixture (HTTP ${response.status}).`);
const result = await response.json();
if (result.accepted !== true || !['recorded-inbound', 'duplicate-event', 'duplicate-message'].includes(result.disposition)) {
  throw new Error('The local demo API returned an invalid acknowledgement.');
}
console.log(`Synthetic inbound fixture stored locally (${result.disposition}); no external provider was contacted.`);
