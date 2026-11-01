import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingRequestsService } from '../../apps/dental-api/src/booking-requests/booking-requests.service';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase', () => ({ scopedClient: () => ({ rpc }) }));

describe('public availability service boundary', () => {
  const service = new BookingRequestsService();
  const input = { date: '2026-11-04' };
  const slot = { starts_at: '2026-11-04T09:00:00Z', ends_at: '2026-11-04T09:45:00Z', resource_pair: 'a' };
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('ENABLE_DEMO_BOOKING_CONFIRMATIONS', 'true');
    vi.stubEnv('DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY', 'test-gate');
    rpc.mockReset().mockResolvedValue({ data: [slot], error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('does not call any hosted database or run with its gate disabled', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project.example.invalid');
    await expect(service.availability(input)).rejects.toMatchObject({ status: 503 });
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('ENABLE_DEMO_BOOKING_CONFIRMATIONS', 'false');
    await expect(service.availability(input)).rejects.toMatchObject({ status: 503 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects clinic/patient selectors and malformed dates before the database', async () => {
    for (const query of [{ ...input, clinic_id: 'another-clinic' }, { ...input, patient_id: 'someone' }, { date: '2026-02-30' }]) {
      await expect(service.availability(query)).rejects.toMatchObject({ status: 400 });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('returns informational times only and never returns the gate key', async () => {
    const result = await service.availability(input);
    expect(result).toEqual({ ...input, time_zone: 'Africa/Casablanca', duration_minutes: 45, informational: true, slots: [slot] });
    expect(rpc).toHaveBeenCalledWith('list_demo_booking_availability', { p_date: input.date, p_gate_key: 'test-gate' });
  });
  it('fails closed on private fields, bad intervals and unavailable database', async () => {
    for (const row of [{ ...slot, patient_id: 'private' }, { ...slot, ends_at: slot.starts_at }]) {
      rpc.mockResolvedValueOnce({ data: [row], error: null });
      await expect(service.availability(input)).rejects.toMatchObject({ status: 503 });
    }
    rpc.mockRejectedValueOnce(new Error('private database diagnostic'));
    await expect(service.availability(input)).rejects.toMatchObject({ status: 503, message: 'Local availability unavailable' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } });
    await expect(service.availability(input)).rejects.toMatchObject({ status: 400 });
  });
});
