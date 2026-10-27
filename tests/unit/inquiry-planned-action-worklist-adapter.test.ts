import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabasePlannedActionWorklist } from '../../apps/dental-api/src/intake/infrastructure/planned-action-worklist.repository';
import { A,STAFF } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic',roles:['reception' as const]};
const result={schema_version:1,clinic_id:A,owner_user_id:STAFF,observed_at:'2026-10-27T00:00:00.123456Z',items:[],truncated:false};
describe('planned action worklist adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('uses explicit POST RPC and verified clinic without a key or body filter',async()=>{rpc.mockResolvedValueOnce({data:result,error:null});expect(await new SupabasePlannedActionWorklist().list(actor)).toEqual(result);expect(rpc).toHaveBeenCalledWith('inquiry_owner_planned_actions',{p_clinic_id:A},{get:false,head:false});});
 it.each([['28000',401],['PGRST301',401],['42501',403],['22023',400],['PT503',503],['XX000',503]])('sanitizes SQLSTATE %s',async(code,status)=>{rpc.mockResolvedValueOnce({error:{code,message:'private token'},data:null});await expect(new SupabasePlannedActionWorklist().list(actor)).rejects.toMatchObject({status});});
 it('rejects malformed and missing echoes and does not label failure as disabled',async()=>{for(const data of [{...result,clinic_id:undefined},{...result,owner_user_id:undefined},{...result,items:null},{...result,private:'secret'}]){rpc.mockResolvedValueOnce({data,error:null});await expect(new SupabasePlannedActionWorklist().list(actor)).rejects.toMatchObject({status:503});}rpc.mockRejectedValueOnce(new Error('private credential'));await expect(new SupabasePlannedActionWorklist().list(actor)).rejects.toThrow('Planned-action worklist unavailable');});
});
