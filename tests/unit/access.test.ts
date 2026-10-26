import { describe, expect, it } from 'vitest';
import { resolveActor, canReadPatient, type Actor } from '../../apps/dental-api/src/identity/domain/access';
import { safeCorrelation, accessLog } from '../../apps/dental-api/src/audit/redaction';
import { PatientsService } from '../../apps/dental-api/src/patients/application/patients.service';
import { FoundationEventSchema } from '../../packages/contracts/src';
import { A, B, STAFF, PATIENT, P1, P2, P3, syntheticRecords } from '../fixtures';
describe('identity and tenant policy', () => {
  it('denies missing and inactive membership', () => {
    expect(resolveActor(STAFF,'token',A,[],[])).toBeNull();
    expect(resolveActor(STAFF,'token',A,[{ user_id: STAFF, clinic_id: A, role: 'dentist', active: false }],[])).toBeNull();
  });
  it('never trusts caller-selected tenant or foreign membership', () => {
    expect(resolveActor(STAFF,'token',B,[{ user_id: STAFF, clinic_id: A, role: 'dentist', active: true }],[])).toBeNull();
    expect(resolveActor(PATIENT,'token',A,[{ user_id: STAFF, clinic_id: A, role: 'dentist', active: true }],[])).toBeNull();
  });
  it('manager is not made a clinician', () => {
    expect(resolveActor(STAFF,'token',A,[{ user_id: STAFF, clinic_id: A, role: 'manager', active: true }],[])?.roles).toEqual(['manager']);
  });
  it('requires verified, unambiguous patient linkage', () => {
    const link = { user_id: PATIENT, clinic_id: A, patient_id: P1, verified_at: null };
    expect(resolveActor(PATIENT,'token',A,[],[link])).toBeNull();
    const verified = { ...link, verified_at: '2026-10-26T10:00:00Z' };
    expect(resolveActor(PATIENT,'token',A,[],[verified])?.patientId).toBe(P1);
    expect(resolveActor(PATIENT,'token',A,[],[verified, { ...verified, patient_id: P3 }])).toBeNull();
  });
  it('patient cannot read another patient even inside own clinic', () => {
    const actor: Actor = { userId: PATIENT, token:'token', clinicId: A, roles:[], patientId: P1 };
    expect(canReadPatient(actor,syntheticRecords[0]!)).toBe(true);
    expect(canReadPatient(actor,syntheticRecords[1]!)).toBe(false);
    expect(canReadPatient(actor,syntheticRecords[2]!)).toBe(false);
  });
  it('defends against a privileged adapter bypassing RLS', async () => {
    const service = new PatientsService({
      list: async () => syntheticRecords,
      find: async (_, id) => syntheticRecords.find(p => p.id === id) ?? null,
      lookup: async () => ({ items: [], truncated: false }),
    });
    const actor: Actor = { userId: STAFF, token:'token', clinicId:A, roles:['reception'] };
    expect((await service.list(actor)).map(p => p.id)).toEqual([P1,P3]);
    await expect(service.find(actor,P2)).rejects.toThrow('Record unavailable');
    await expect(service.list({ ...actor, roles:[], patientId:P1 })).rejects.toThrow();
    await expect(service.find({ ...actor, roles:[], patientId:P1 },P3)).rejects.toThrow();
  });
});
describe('data minimization', () => {
  it('rejects arbitrary data in correlation identifiers', () => { expect(safeCorrelation('patient@email.invalid')).not.toContain('@'); expect(safeCorrelation(A)).toBe(A); });
  it('logs only approved metadata, never URL/query/body/headers', () => { expect(Object.keys(accessLog(A,'GET',403,12))).toEqual(['event','correlation_id','method','status','duration_ms']); });
  it('rejects event payload expansion and unimplemented clinical types', () => {
    const event = { event_id:P1,event_type:'FoundationAccessReviewed',event_version:1,clinic_id:A,aggregate_type:'membership',aggregate_id:P2,occurred_at:'2026-10-26T10:00:00Z',correlation_id:P3,actor_ref:STAFF,payload:{outcome:'allowed'} };
    expect(FoundationEventSchema.safeParse(event).success).toBe(true);
    expect(FoundationEventSchema.safeParse({ ...event, payload:{outcome:'allowed',transcript:'never store'} }).success).toBe(false);
    expect(FoundationEventSchema.safeParse({ ...event,event_type:'EncounterSigned' }).success).toBe(false);
  });
});
