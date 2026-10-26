import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseFollowUp } from '../../apps/dental-api/src/intake/infrastructure/follow-up.repository';
import { A,STAFF,P1,P2 } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['reception' as const]};
describe('follow-up user-scoped adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('uses POST RPC for reads with actor clinic and bound inquiry',async()=>{
  rpc.mockResolvedValue({data:{items:[],truncated:false},error:null});expect(await new SupabaseFollowUp().list(actor,P1)).toEqual({items:[],truncated:false});
  expect(rpc).toHaveBeenCalledWith('list_inquiry_follow_ups',{p_clinic_id:A,p_inquiry_id:P1},{get:false,head:false});
 });
 it.each([['PT404',404],['42501',403],['PT409',409],['22023',400],['28000',401],['PT503',503],['XX000',503]])('sanitizes SQLSTATE%s to status%s',async(code,status)=>{
  rpc.mockResolvedValue({data:null,error:{code,message:'private contact value'}});
  try {await new SupabaseFollowUp().record(actor,P1,{kind:'contact_attempt',channel:'phone'},P2,P2);throw new Error('expected exception');}
  catch(error) {expect(error).toMatchObject({status});expect(String(error)).not.toContain('private contact');if(code==='PT503') expect(error).toMatchObject({response:{code:'intake_disabled'}});}
 });
 it('rejects malformed successful response and sanitizes transport failure',async()=>{
  rpc.mockResolvedValueOnce({data:{items:[{secret:'private'}],truncated:false},error:null});await expect(new SupabaseFollowUp().list(actor,P1)).rejects.toMatchObject({status:503});
  rpc.mockRejectedValueOnce(new Error('private token'));await expect(new SupabaseFollowUp().list(actor,P1)).rejects.toMatchObject({status:503,message:'Follow-up unavailable'});
 });
});
