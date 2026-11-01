import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {A,STAFF,P1,P2} from '../fixtures';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import {PatientAppointmentsService} from '../../apps/dental-api/src/scheduling/patient-appointments.service';
import {BookingRequestsService} from '../../apps/dental-api/src/booking-requests/booking-requests.service';
const actor={clinicId:A,userId:STAFF,token:'test',roles:['manager' as const]};
const starts_at='2026-11-03T09:00:00Z',ends_at='2026-11-03T09:30:00Z';
describe('hosted appointment commands',()=>{
 beforeEach(()=>{rpc.mockReset();vi.stubEnv('SUPABASE_URL','https://giufpdppsunryyhfnzps.supabase.co');vi.stubEnv('HOSTED_SUPABASE_PROJECT_REF','giufpdppsunryyhfnzps');vi.stubEnv('ENABLE_HOSTED_CONFIGURED_BOOKING_CONFIRMATIONS','true');vi.stubEnv('HOSTED_AGENDA_SETTINGS_GATE_KEY','test-hosted');});
 afterEach(()=>vi.unstubAllEnvs());
 it.each(['cancel','reschedule'] as const)('routes %s through the scoped hosted RPC',async action=>{
  rpc.mockResolvedValue({data:{appointment_id:P1,status:action==='cancel'?'cancelled':'confirmed',version:2,starts_at,ends_at,replayed:false},error:null});
  const input=action==='cancel'?{action,expected_version:1}:{action,expected_version:1,expected_revision:1,starts_at,ends_at};
  await new PatientAppointmentsService().configuredCommand(actor,P1,input,P2);
  expect(rpc).toHaveBeenCalledWith(action==='cancel'?'cancel_local_configured_appointment':'reschedule_local_configured_appointment',expect.objectContaining({p_clinic_id:A,p_gate_key:'test-hosted',p_request_key:P2}));
 });
 it('confirms a configured request with the hosted gate',async()=>{
  rpc.mockResolvedValue({data:{request_id:P1,appointment_id:P2,status:'confirmed',version:1,starts_at,ends_at,replayed:false},error:null});
  await new BookingRequestsService().confirmConfigured(actor,P1,{expected_revision:1},P2);
  expect(rpc).toHaveBeenCalledWith('confirm_local_configured_booking_request',expect.objectContaining({p_gate_key:'test-hosted',p_clinic_id:A}));
 });
 it('does not inherit the agenda settings switch',async()=>{
  vi.stubEnv('ENABLE_HOSTED_CONFIGURED_BOOKING_CONFIRMATIONS','false');vi.stubEnv('ENABLE_HOSTED_AGENDA_SETTINGS','true');
  await expect(new PatientAppointmentsService().configuredCommand(actor,P1,{action:'cancel',expected_version:1},P2)).rejects.toThrow('not enabled');expect(rpc).not.toHaveBeenCalled();
 });
 it('rejects an unauthorized role before RPC',async()=>{
  await expect(new PatientAppointmentsService().configuredCommand({...actor,roles:['assistant']},P1,{action:'cancel',expected_version:1},P2)).rejects.toThrow('scope denied');expect(rpc).not.toHaveBeenCalled();
 });
 it('retains database conflict handling',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'SH409'}});
  await expect(new PatientAppointmentsService().configuredCommand(actor,P1,{action:'cancel',expected_version:1},P2)).rejects.toThrow('refresh before editing');
 });
});
