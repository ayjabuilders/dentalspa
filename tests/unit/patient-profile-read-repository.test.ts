import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { Actor } from '../../apps/dental-api/src/identity/domain/access';
import { A, STAFF, P1 } from '../fixtures';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase', () => ({ scopedClient: mocks.client }));
import { SupabasePatients, throwPatientProfileReadError } from '../../apps/dental-api/src/patients/infrastructure/patient.repository';

const actor: Actor = { userId: STAFF, clinicId: A, token: 'synthetic-token', roles: [], patientId: P1 };
const correlationId = '20000000-0000-4000-8000-000000000099';
const profile = { id: P1, clinic_id: A, display_name: 'Alice', reference: 'R-001' };

describe('verified own patient profile RPC transport', () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.client.mockReset().mockReturnValue({ rpc: mocks.rpc }); });

  it('uses the authenticated user token and JSON POST RPC with minimal fields', async () => {
    mocks.rpc.mockResolvedValue({ data: [profile], error: null });
    expect(await new SupabasePatients().readOwnProfile(actor, correlationId)).toEqual(profile);
    expect(mocks.client).toHaveBeenCalledExactlyOnceWith(actor.token);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('read_my_patient_profile', {
      p_clinic_id: A,
      p_correlation_id: correlationId,
    }, { get: false, head: false });
  });

  it('returns no linked profile without inventing data and rejects ambiguous or malformed results', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(new SupabasePatients().readOwnProfile(actor, correlationId)).resolves.toBeNull();
    for (const data of [[profile, profile], [{ ...profile, email: 'private@example.test' }], { ...profile }]) {
      mocks.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(new SupabasePatients().readOwnProfile(actor, correlationId)).rejects.toMatchObject({ status: 503, message: 'Patient profile unavailable' });
    }
  });

  it('sanitizes thrown provider errors', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('Alice private@example.test SQL detail'));
    await expect(new SupabasePatients().readOwnProfile(actor, correlationId)).rejects.toMatchObject({ status: 503, message: 'Patient profile unavailable' });
  });

  for (const [code, status] of [['28000', 401], ['PGRST301', 401], ['PGRST302', 401], ['42501', 403], ['22023', 400], ['22P02', 400], ['22P05', 400], ['unknown', 503]] as const) {
    it(`maps ${code} to sanitized ${status}`, () => {
      expect.assertions(3);
      try { throwPatientProfileReadError({ code, message: 'Alice private@example.test' }); }
      catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(status);
        expect(JSON.stringify((error as HttpException).getResponse())).not.toMatch(/Alice|private@example\.test/);
      }
    });
  }
});
