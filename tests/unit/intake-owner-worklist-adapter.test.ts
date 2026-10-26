import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseOwnerWorklist } from '../../apps/dental-api/src/intake/infrastructure/owner-worklist.repository';
import { compareInquiryInstants,OwnerWorklistService } from '../../apps/dental-api/src/intake/application/owner-worklist.service';
import { A,STAFF,P1 } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['reception' as const]};
describe('owner worklist adapter and precision boundary',()=>{
 beforeEach(()=>rpc.mockReset());
 it('uses explicit POST user RPC and server-derived clinic',async()=>{
  const empty={items:[],truncated:false};rpc.mockResolvedValue({data:{observed_at:'2026-10-26T00:00:00Z',overdue:empty,upcoming:empty,undated:empty},error:null});await new SupabaseOwnerWorklist().list(actor);expect(rpc).toHaveBeenCalledWith('inquiry_owner_worklist',{p_clinic_id:A},{get:false,head:false});
 });
 it.each([['PT404',404],['42501',403],['28000',401],['22023',400],['XX000',503]])('maps%s without provider text',async(code,status)=>{
  rpc.mockResolvedValue({data:null,error:{code,message:'secret contact'}});await expect(new SupabaseOwnerWorklist().find(actor,P1)).rejects.toMatchObject({status});
 });
 it('does not collapse PostgreSQL microseconds or equivalent offsets',()=>{
  expect(compareInquiryInstants('2026-10-26T00:00:00.000001Z','2026-10-26T00:00:00Z')).toBe(1);
  expect(compareInquiryInstants('2026-10-26T01:00:00.123456+01:00','2026-10-26T00:00:00.123456Z')).toBe(0);
 });
 it('validates sub-millisecond membership using the returned observation, never browser time',async()=>{
  const item={id:P1,clinic_id:A,owner_user_id:STAFF,display_name:'Synthetic',source:'phone',status:'new',follow_up_at:'2026-10-26T00:00:00.000001Z',created_at:'2020-01-01T00:00:00Z'};
  const value={observed_at:'2026-10-26T00:00:00Z',overdue:{items:[],truncated:false},upcoming:{items:[item],truncated:false},undated:{items:[],truncated:false}};
  const service=new OwnerWorklistService({list:async()=>value as never,find:async()=>null as never});expect((await service.list(actor)).upcoming.items).toHaveLength(1);
 });
});
