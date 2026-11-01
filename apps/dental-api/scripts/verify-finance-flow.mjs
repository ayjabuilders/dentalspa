import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Transport adapter keeps the same acceptance scenario usable locally and hosted.
export async function verifyFinanceFlow({ request, patientId, otherPatientId, foreignClinicId, series, report }) {
  async function send(path, body, key = randomUUID(), status = 201, overrides) {
    const response = await request(`/finance/${path}`, 'POST', body, key, overrides);
    assert.equal(response.status, status, `POST ${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  async function read(path, status = 200, overrides) {
    const response = await request(`/finance/${path}`, 'GET', undefined, undefined, overrides);
    assert.equal(response.status, status, `GET ${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  const root = `patients/${patientId}`, invoices = `${root}/invoices`;
  await read(invoices, 401, { token: '' });
  await read(invoices, 403, { clinicId: foreignClinicId });
  const serviceBody = { service_id: null, expected_version: 0, code: `QA-${randomUUID().toUpperCase()}`, label: 'Consultation QA FICTIVE', category: 'Consultations', unit_amount_minor: 12550, archived: false };
  const serviceKey = randomUUID(), service = await send('services', serviceBody, serviceKey);
  assert.deepEqual(await send('services', serviceBody, serviceKey), { ...service, replayed: true });
  const quoteBody = { lines: [{ service_id: service.service_id, price_version: 1, quantity: 2 }] };
  const quoteKey = randomUUID(), quote = await send(`${root}/quotes`, quoteBody, quoteKey);
  assert.equal(quote.total_minor, 25100);
  assert.deepEqual(await send(`${root}/quotes`, quoteBody, quoteKey), { ...quote, replayed: true });
  await send('services', { ...serviceBody, service_id: service.service_id, expected_version: 1, unit_amount_minor: 15000 });
  await send(`${root}/quotes`, quoteBody, randomUUID(), 409);
  report('catalogue and quote persistence, exact replay and stale price rejection');

  const prepareBody = { quote_id: quote.quote_id, quote_version: 1 }, prepareKey = randomUUID();
  const draft = await send(invoices, prepareBody, prepareKey);
  assert.equal(draft.total_minor, 25100); assert.equal(draft.state, 'draft');
  assert.deepEqual(await send(invoices, prepareBody, prepareKey), { ...draft, replayed: true });
  const issuePath = `${invoices}/${draft.invoice_id}/issue`, issueKey = randomUUID();
  const issued = await send(issuePath, {}, issueKey);
  assert.equal(issued.number, `${series}-1`); assert.equal(issued.total_minor, 25100);
  assert.deepEqual(await send(issuePath, {}, issueKey), { ...issued, replayed: true });
  await send(issuePath, {}, randomUUID(), 409);
  await send(`patients/${otherPatientId}/invoices/${draft.invoice_id}/issue`, {}, randomUUID(), 404);
  const listed = (await read(invoices)).items.find(item => item.invoice_id === draft.invoice_id || item.id === draft.invoice_id);
  assert.ok(listed); assert.equal(listed.total_minor, 25100);
  report('invoice numbering, immutable quote price, replay and wrong-patient denial');

  const config = 'payment-configuration';
  const account = await send(`${config}/accounts`, { account_id: null, expected_version: 0, label: 'Banque QA FICTIVE', kind: 'bank', active: true });
  const method = await send(`${config}/methods`, { method_id: null, expected_version: 0, code: 'TRANSFER', label: 'Virement QA FICTIF', kind: 'bank_transfer', active: true, reference_required: true, settlement_behavior: 'separate_verification', receiving_account_id: account.account_id });
  const payments = `${root}/payments`, paymentKey = randomUUID();
  const paymentBody = { method_id: method.method_id, method_version: 1, amount_minor: 15000, currency_code: 'MAD', effective_at: new Date().toISOString(), reference: 'DEMO-HOSTED-TRANSFER' };
  const payment = await send(payments, paymentBody, paymentKey);
  assert.equal(payment.state, 'pending');
  assert.deepEqual(await send(payments, paymentBody, paymentKey), { ...payment, replayed: true });
  const target = `${payments}/${payment.payment_id}`;
  await send(`${target}/transitions`, { expected_version: 1, action: 'confirm', verified: true });
  await send(`${target}/allocations`, { invoice_id: draft.invoice_id, amount_minor: 10000 }, randomUUID(), 409);
  const receiptKey = randomUUID(), receipt = await send(`${target}/receipts`, {}, receiptKey);
  assert.deepEqual(await send(`${target}/receipts`, {}, receiptKey), { ...receipt, replayed: true });
  const historical = await read(`${target}/receipt`);
  assert.equal(historical.snapshot.settlement, 'pending');
  await read(`patients/${otherPatientId}/payments/${payment.payment_id}/receipt`, 404);
  await send(`${target}/transitions`, { expected_version: 2, action: 'settle', verified: true });
  const allocation = { invoice_id: draft.invoice_id, amount_minor: 10000 }, allocationKey = randomUUID();
  const allocated = await send(`${target}/allocations`, allocation, allocationKey);
  assert.equal(allocated.invoice_remaining_minor, 15100); assert.equal(allocated.payment_unapplied_minor, 5000);
  assert.deepEqual(await send(`${target}/allocations`, allocation, allocationKey), { ...allocated, replayed: true });
  await send(`${target}/allocations`, { ...allocation, amount_minor: 5001 }, randomUUID(), 409);
  const current = await read(payments);
  assert.equal(current.payments[0].available_minor, 5000); assert.equal(current.payments[0].allocated_minor, 10000);
  assert.deepEqual(await read(`${target}/receipt`), historical);
  report('payment confirmation, settlement, allocation limits, balances and immutable receipt');
  return { serviceId: service.service_id, quoteId: quote.quote_id, invoiceId: draft.invoice_id, paymentId: payment.payment_id };
}
