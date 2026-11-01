import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyAgendaFlow({ request, providerId, chairId, visitId, privateVisitId, report }) {
  async function call(path, method = 'GET', body, key, status = method === 'POST' ? 201 : 200, overrides) {
    const response = await request(path, method, body, key, overrides);
    assert.equal(response.status, status, `${method} ${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  const windows = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, start: '09:00', end: '17:00' }));
  const visit = { id: visitId, name: 'Première visite QA FICTIVE', active: true, public_bookable: true, duration_minutes: 30,
    buffer_before_minutes: 0, buffer_after_minutes: 15, resource_pairs: [{ provider_id: providerId, chair_id: chairId }], weekly_windows: windows };
  const settings = { schema_version: 1, revision: 1, time_zone: 'Africa/Casablanca', slot_step_minutes: 15,
    minimum_notice_minutes: 60, booking_horizon_days: 30, confirmation_mode: 'staff_review',
    patient_cancellation_enabled: false, patient_reschedule_enabled: false, cancellation_notice_minutes: 0, reschedule_notice_minutes: 0,
    weekly_windows: windows, closures: [], visit_types: [visit, { ...visit, id: privateVisitId, name: 'Contrôle QA FICTIF', public_bookable: false }] };
  const saveKey = randomUUID(), saveBody = { expected_revision: 0, settings };
  const saved = await call('/agenda-settings', 'POST', saveBody, saveKey);
  assert.deepEqual(await call('/agenda-settings', 'POST', saveBody, saveKey), { ...saved, replayed: true });
  await call('/agenda-settings', 'POST', saveBody, randomUUID(), 409);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const availabilityPath = `/booking-requests/configured-availability?date=${date}&visit_type_id=${visitId}`;
  const publicOptions = { token: '' };
  const available = () => call(availabilityPath, 'GET', undefined, undefined, 200, publicOptions);
  const initial = await available();
  assert.equal(initial.request_enabled, true); assert.equal(initial.confirmation_mode, 'staff_review'); assert.ok(initial.slots.length >= 4);
  assert.deepEqual(initial.visit_types.map(v => v.id), [visitId]);
  const hidden = await call(`/booking-requests/configured-availability?date=${date}&visit_type_id=${privateVisitId}`, 'GET', undefined, undefined, 200, publicOptions);
  assert.equal(hidden.slots.length, 0);
  report('settings persistence/replay, stale revision and public/private visit filtering');
  const slot = initial.slots[0];
  const body = { visit_type_id: visitId, configuration_revision: 1, ...slot, contact_name: 'Salma Alaoui — QA FICTIF', contact_email: `agenda-${randomUUID()}@example.test`, administrative_consent_version: 'local-demo-v1' };
  const key = randomUUID(), requests = '/booking-requests/configured';
  const first = await call(requests, 'POST', body, key, 201, publicOptions);
  assert.equal(first.status, 'request_received');
  assert.deepEqual(await call(requests, 'POST', body, key, 201, publicOptions), { ...first, replayed: true });
  const second = await call(requests, 'POST', { ...body, contact_email: `agenda-${randomUUID()}@example.test` }, randomUUID(), 201, publicOptions);
  assert.ok((await available()).slots.some(s => s.starts_at === slot.starts_at));
  const confirmBody = { expected_revision: 1 }, confirmKeys = [randomUUID(), randomUUID()];
  await call(`${requests}/${first.request_id}/confirm`, 'POST', confirmBody, randomUUID(), 401, publicOptions);
  // Competing HTTP requests use separate database transactions for one resource pair.
  const race = await Promise.all([
    request(`${requests}/${first.request_id}/confirm`, 'POST', confirmBody, confirmKeys[0]),
    request(`${requests}/${second.request_id}/confirm`, 'POST', confirmBody, confirmKeys[1]),
  ]);
  assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
  const index = race.findIndex(r => r.status === 201), winner = await race[index].json();
  await race[1 - index].json();
  assert.deepEqual(await call(`${requests}/${[first, second][index].request_id}/confirm`, 'POST', confirmBody, confirmKeys[index]), { ...winner, replayed: true });
  assert.equal(winner.status, 'confirmed');
  assert.ok(!(await available()).slots.some(s => s.starts_at === slot.starts_at));
  const calendar = `/appointments?from=${date}&until=${date}`;
  const listed = (await call(calendar)).items.find(a => a.id === winner.appointment_id);
  assert.ok(listed); assert.equal(listed.patient, null); assert.equal(listed.source, 'configured');
  report('request is not a booking; concurrent confirmations produce one winner and one conflict');

  const commandPath = `/appointments/${winner.appointment_id}/configured-commands`;
  const moves = await call(`/appointments/${winner.appointment_id}/configured-availability?date=${date}`);
  const destination = moves.slots.find(s => Date.parse(s.starts_at) >= Date.parse(slot.starts_at) + 2 * 3600000);
  assert.ok(destination);
  const moveBody = { action: 'reschedule', expected_version: 1, expected_revision: 1, ...destination }, moveKey = randomUUID();
  const moved = await call(commandPath, 'POST', moveBody, moveKey);
  assert.deepEqual(await call(commandPath, 'POST', moveBody, moveKey), { ...moved, replayed: true });
  await call(commandPath, 'POST', moveBody, randomUUID(), 409);
  assert.ok((await available()).slots.some(s => s.starts_at === slot.starts_at));
  assert.ok(!(await available()).slots.some(s => s.starts_at === destination.starts_at));
  const cancelBody = { action: 'cancel', expected_version: 2 }, cancelKey = randomUUID();
  const cancelled = await call(commandPath, 'POST', cancelBody, cancelKey);
  assert.deepEqual(await call(commandPath, 'POST', cancelBody, cancelKey), { ...cancelled, replayed: true });
  assert.ok((await available()).slots.some(s => s.starts_at === destination.starts_at));
  assert.equal((await call(calendar)).items.find(a => a.id === winner.appointment_id).status, 'cancelled');
  report('move/cancel replay, version conflict, calendar state and released public capacity');

  await call('/agenda-settings', 'POST', { expected_revision: 1, settings: { ...settings, revision: 2, confirmation_mode: 'automatic' } }, randomUUID());
  const autoAvailable = await available(), autoKey = randomUUID();
  assert.equal(autoAvailable.confirmation_mode, 'automatic');
  const autoBody = { ...body, configuration_revision: 2, ...autoAvailable.slots[0], contact_email: `agenda-${randomUUID()}@example.test` };
  const automatic = await call(requests, 'POST', autoBody, autoKey, 201, publicOptions);
  assert.equal(automatic.status, 'confirmed');
  assert.deepEqual(await call(requests, 'POST', autoBody, autoKey, 201, publicOptions), { ...automatic, replayed: true });
  await call(`/appointments/${automatic.appointment_id}/configured-commands`, 'POST', { action: 'cancel', expected_version: 1 }, randomUUID());
  report('automatic booking confirms once; same-key replay survives occupied slot');
  return { appointmentIds: [winner.appointment_id, automatic.appointment_id], requestIds: [first.request_id, second.request_id, automatic.request_id] };
}
