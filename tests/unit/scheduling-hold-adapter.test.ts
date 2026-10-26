import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseScheduling } from '../../apps/dental-api/src/scheduling/scheduling.repository';
import { databaseError } from '../../apps/dental-api/src/scheduling/errors';
import { A,STAFF } from '../fixtures';
const actor={userId:STAFF,clinicId:A,token:'private-token',roles:['reception' as const]};
describe('scheduling user-scoped RPC adapter',()=>{
 beforeEach(()=>{rpc.mockReset();});
 it('always uses POST with server-derived clinic, including read projections',async()=>{
  rpc.mockResolvedValue({data:{items:[]},error:null});const repo=new SupabaseScheduling();await repo.call(actor,'scheduling_resources',{p_clinic_id:'forged'});
  expect(rpc).toHaveBeenCalledWith('scheduling_resources',{p_clinic_id:A},{get:false,head:false});
 });
 it('maps SQLSTATE without exposing provider messages',async()=>{
  for(const [sql,code] of Object.entries({PT503:'scheduling_disabled','28000':'unauthenticated','42501':'forbidden','22023':'invalid_request',SH404:'resource_not_found',SH405:'hold_not_found',SH409:'resource_conflict',SH410:'idempotency_conflict',SH411:'hold_expired',XX000:'internal_error'})) {
   try{databaseError({code:sql});throw new Error('expected failure');}catch(error){expect(error).toMatchObject({code});}
  }
  rpc.mockResolvedValue({data:null,error:{code:'XX000',message:'private value'}});await expect(new SupabaseScheduling().call(actor,'scheduling_resources',{})).rejects.toMatchObject({code:'internal_error',message:'internal_error'});
 });
});
