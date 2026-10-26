import { beforeEach, describe, expect, it, vi } from 'vitest';
import { A, STAFF, P1, P3 } from '../fixtures';
import type { Actor } from '../../apps/dental-api/src/identity/domain/access';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),client:vi.fn()}));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:mocks.client}));
import { SupabaseIntake } from '../../apps/dental-api/src/intake/infrastructure/intake.repository';
const actor:Actor={userId:STAFF,clinicId:A,token:'synthetic-user-bearer',roles:['reception']};
const input={display_name:'Synthetic inquiry',contact_email:null,contact_phone:null,source:'phone' as const,follow_up_at:null};
const item={...input,id:P1,clinic_id:A,owner_user_id:STAFF,status:'new',created_at:'2026-10-26T12:00:00Z'};
describe('user-scoped intake RPC adapter',()=>{
  beforeEach(()=>{mocks.rpc.mockReset();mocks.client.mockReset().mockReturnValue({rpc:mocks.rpc});});
  it('passes verified actor token and selected clinic to the list RPC',async()=>{
    mocks.rpc.mockResolvedValue({data:{items:[item],truncated:false},error:null});
    expect(await new SupabaseIntake().list(actor)).toMatchObject({truncated:false});
    expect(mocks.client).toHaveBeenCalledExactlyOnceWith(actor.token);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('list_inquiries',{p_clinic_id:A});
  });
  it('passes normalized command and idempotency scope without caller-owned fields',async()=>{
    mocks.rpc.mockResolvedValue({data:{item,replayed:false},error:null});
    await new SupabaseIntake().create(actor,input,P3,P1);
    expect(mocks.client).toHaveBeenCalledExactlyOnceWith(actor.token);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_inquiry',{p_clinic_id:A,p_request_key:P3,p_payload:input,p_correlation_id:P1});
  });
  it('rejects malformed successful provider data rather than returning it',async()=>{
    mocks.rpc.mockResolvedValue({data:{items:[{secret:'synthetic'}],truncated:false},error:null});
    await expect(new SupabaseIntake().list(actor)).rejects.toMatchObject({status:503,message:'Inquiry list unavailable'});
  });
  it('sanitizes transport exceptions and distinguishes disabled commands',async()=>{
    mocks.rpc.mockRejectedValueOnce(new Error('synthetic credential must not leak'));
    await expect(new SupabaseIntake().create(actor,input,P3,P1)).rejects.toMatchObject({status:503,message:'Intake service unavailable'});
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'PT503',message:'database detail'}});
    await expect(new SupabaseIntake().create(actor,input,P3,P1)).rejects.toMatchObject({response:{code:'intake_disabled',statusCode:503}});
  });
});
