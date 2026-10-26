import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseCommunicationTimeZone } from '../../apps/dental-api/src/intake/infrastructure/communication-time-zone.repository';
import { A,STAFF,P1,P2 } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['reception' as const]},input={expected_revision:0,time_zone:null};
const state={catalogue_version:1,schema_version:1,inquiry_id:P1,clinic_id:A,owner_user_id:STAFF,time_zone:null,revision:0,updated_at:null};
const receipt={catalogue_version:1 as const,inquiry_id:P1,clinic_id:A,owner_user_id:STAFF,previous_time_zone:null,time_zone:null,previous_revision:0,revision:0,changed:false,recorded_at:'2026-10-26T20:00:00Z',event_version:1};
describe('communication time_zone scoped adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('uses POST RPC for both verbs with verified scope and exact input',async()=>{rpc.mockResolvedValueOnce({data:state,error:null});expect(await new SupabaseCommunicationTimeZone().get(actor,P1)).toEqual(state);expect(rpc).toHaveBeenLastCalledWith('get_inquiry_communication_time_zone',{p_clinic_id:A,p_inquiry_id:P1},{get:false,head:false});rpc.mockResolvedValueOnce({data:{receipt,replayed:false},error:null});await new SupabaseCommunicationTimeZone().set(actor,P1,input,P2,P2);expect(rpc).toHaveBeenLastCalledWith('set_inquiry_communication_time_zone',{p_clinic_id:A,p_inquiry_id:P1,p_payload:input,p_request_key:P2,p_correlation_id:P2},{get:false,head:false});});
 it('rejects missing and unknown catalogue versions on states and receipts',async()=>{
  for(const catalogue_version of [undefined,2]){
   rpc.mockResolvedValueOnce({data:{...state,catalogue_version},error:null});
   await expect(new SupabaseCommunicationTimeZone().get(actor,P1)).rejects.toMatchObject({status:503});
   rpc.mockResolvedValueOnce({data:{receipt:{...receipt,catalogue_version},replayed:false},error:null});
   await expect(new SupabaseCommunicationTimeZone().set(actor,P1,input,P2,P2)).rejects.toMatchObject({status:503});
  }
 });
 it.each([['PT404',404],['42501',403],['PT409',409],['22023',400],['28000',401],['PT503',503],['XX000',503]])('sanitizes write SQLSTATE%s',async(code,status)=>{rpc.mockResolvedValue({data:null,error:{code,message:'private contact'}});try{await new SupabaseCommunicationTimeZone().set(actor,P1,input,P2,P2);throw new Error('expected rejection');}catch(error){expect(error).toMatchObject({status});expect(String(error)).not.toContain('private');if(code==='PT503')expect(error).toMatchObject({response:{code:'intake_disabled'}});}});
 it('does not describe a failed read as disabled, and rejects malformed data/transport failures',async()=>{rpc.mockResolvedValueOnce({data:null,error:{code:'PT503',message:'private'}});try{await new SupabaseCommunicationTimeZone().get(actor,P1);}catch(error){expect(error).toMatchObject({status:503});expect(error).not.toMatchObject({response:{code:'intake_disabled'}});}rpc.mockResolvedValueOnce({data:{...state,revision:1},error:null});await expect(new SupabaseCommunicationTimeZone().get(actor,P1)).rejects.toMatchObject({status:503});rpc.mockResolvedValueOnce({data:{receipt:{...receipt,time_zone:'Africa/Casablanca'},replayed:false},error:null});await expect(new SupabaseCommunicationTimeZone().set(actor,P1,input,P2,P2)).rejects.toMatchObject({status:503});rpc.mockRejectedValueOnce(new Error('private credentials'));await expect(new SupabaseCommunicationTimeZone().get(actor,P1)).rejects.toThrow('Communication time_zone unavailable');});
});
