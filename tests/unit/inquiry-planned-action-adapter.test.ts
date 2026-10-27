import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabasePlannedAction } from '../../apps/dental-api/src/intake/infrastructure/planned-action.repository';
import { A,STAFF,P1,P2 } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['reception' as const]},input={expected_revision:0,planned_action:null};
const state={vocabulary_version:1,schema_version:1,inquiry_id:P1,clinic_id:A,owner_user_id:STAFF,planned_action:null,revision:0,updated_at:null};
const receipt={vocabulary_version:1 as const,inquiry_id:P1,clinic_id:A,owner_user_id:STAFF,previous_planned_action:null,planned_action:null,previous_revision:0,revision:0,changed:false,recorded_at:'2026-10-26T20:00:00Z',event_version:1};
describe('planned action scoped adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('uses POST RPC for both verbs with verified scope and exact input',async()=>{rpc.mockResolvedValueOnce({data:state,error:null});expect(await new SupabasePlannedAction().get(actor,P1)).toEqual(state);expect(rpc).toHaveBeenLastCalledWith('get_inquiry_planned_action',{p_clinic_id:A,p_inquiry_id:P1},{get:false,head:false});rpc.mockResolvedValueOnce({data:{receipt,replayed:false},error:null});await new SupabasePlannedAction().set(actor,P1,input,P2,P2);expect(rpc).toHaveBeenLastCalledWith('set_inquiry_planned_action',{p_clinic_id:A,p_inquiry_id:P1,p_payload:input,p_request_key:P2,p_correlation_id:P2},{get:false,head:false});});
 it('rejects missing and unknown vocabulary versions on states and receipts',async()=>{
  for(const vocabulary_version of [undefined,2]){
   rpc.mockResolvedValueOnce({data:{...state,vocabulary_version},error:null});
   await expect(new SupabasePlannedAction().get(actor,P1)).rejects.toMatchObject({status:503});
   rpc.mockResolvedValueOnce({data:{receipt:{...receipt,vocabulary_version},replayed:false},error:null});
   await expect(new SupabasePlannedAction().set(actor,P1,input,P2,P2)).rejects.toMatchObject({status:503});
  }
 });
 it.each([['PT404',404],['42501',403],['PT409',409],['22023',400],['28000',401],['PT503',503],['XX000',503]])('sanitizes write SQLSTATE%s',async(code,status)=>{rpc.mockResolvedValue({data:null,error:{code,message:'private contact'}});try{await new SupabasePlannedAction().set(actor,P1,input,P2,P2);throw new Error('expected rejection');}catch(error){expect(error).toMatchObject({status});expect(String(error)).not.toContain('private');if(code==='PT503')expect(error).toMatchObject({response:{code:'intake_disabled'}});}});
 it('does not describe a failed read as disabled, and rejects malformed data/transport failures',async()=>{rpc.mockResolvedValueOnce({data:null,error:{code:'PT503',message:'private'}});try{await new SupabasePlannedAction().get(actor,P1);}catch(error){expect(error).toMatchObject({status:503});expect(error).not.toMatchObject({response:{code:'intake_disabled'}});}rpc.mockResolvedValueOnce({data:{...state,revision:1},error:null});await expect(new SupabasePlannedAction().get(actor,P1)).rejects.toMatchObject({status:503});rpc.mockResolvedValueOnce({data:{receipt:{...receipt,planned_action:'review_inquiry'},replayed:false},error:null});await expect(new SupabasePlannedAction().set(actor,P1,input,P2,P2)).rejects.toMatchObject({status:503});rpc.mockRejectedValueOnce(new Error('private credentials'));await expect(new SupabasePlannedAction().get(actor,P1)).rejects.toThrow('Planned action unavailable');});
});
