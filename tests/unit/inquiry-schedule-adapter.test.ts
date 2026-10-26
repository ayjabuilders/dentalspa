import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseInquirySchedule } from '../../apps/dental-api/src/intake/infrastructure/inquiry-schedule.repository';
import { A,STAFF,P1,P2 } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['reception' as const]},input={expected_follow_up_at:null,follow_up_at:null};
const receipt={inquiry_id:P1,clinic_id:A,owner_user_id:STAFF,previous_follow_up_at:null,follow_up_at:null,changed:false,recorded_at:'2026-10-26T20:00:00Z',event_version:1};
describe('inquiry schedule adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('uses explicit POST RPC with verified tenant and exact payload',async()=>{rpc.mockResolvedValue({data:{receipt,replayed:false},error:null});expect(await new SupabaseInquirySchedule().set(actor,P1,input,P2,P2)).toEqual({receipt,replayed:false});expect(rpc).toHaveBeenCalledWith('set_inquiry_follow_up_schedule',{p_clinic_id:A,p_inquiry_id:P1,p_request_key:P2,p_payload:input,p_correlation_id:P2},{get:false,head:false});});
 it.each([['PT404',404],['42501',403],['PT409',409],['22023',400],['28000',401],['PT503',503],['XX000',503]])('sanitizes SQLSTATE%s',async(code,status)=>{rpc.mockResolvedValue({data:null,error:{code,message:'private contact'}});try{await new SupabaseInquirySchedule().set(actor,P1,input,P2,P2);throw new Error('expected rejection');}catch(error){expect(error).toMatchObject({status});expect(String(error)).not.toContain('private');if(code==='PT503')expect(error).toMatchObject({response:{code:'intake_disabled'}});}});
 it('rejects malformed data and hides transport errors',async()=>{rpc.mockResolvedValueOnce({data:{receipt:{...receipt,contact:'private'},replayed:false},error:null});await expect(new SupabaseInquirySchedule().set(actor,P1,input,P2,P2)).rejects.toMatchObject({status:503});rpc.mockRejectedValueOnce(new Error('private credentials'));await expect(new SupabaseInquirySchedule().set(actor,P1,input,P2,P2)).rejects.toThrow('Schedule unavailable');});
});
