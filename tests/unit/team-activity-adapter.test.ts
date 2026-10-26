import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseTeamActivity } from '../../apps/dental-api/src/team/infrastructure/activity.repository';

import { A,STAFF } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['manager' as const]};
describe('team activity adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('calls POST RPC with only verified clinic and preserves empty response',async()=>{
  rpc.mockResolvedValue({data:{observed_at:'2026-10-26T00:00:00Z',items:[],truncated:false},error:null});await new SupabaseTeamActivity().list(actor);expect(rpc).toHaveBeenCalledWith('team_activity',{p_clinic_id:A},{get:false,head:false});
 });
 it.each([['42501',403],['28000',401],['22023',400],['PT503',503],['XX000',503]])('sanitizes%s without disabled-write meaning',async(code,status)=>{
  rpc.mockResolvedValue({data:null,error:{code,message:'private staff profile'}});
  try{await new SupabaseTeamActivity().list(actor);throw new Error('expected rejection');}catch(error){expect(error).toMatchObject({status});expect(String(error)).not.toContain('private');expect(error).not.toMatchObject({response:{code:'intake_disabled'}});}
 });

 it('rejects malformed trusted responses and transport failures without content',async()=>{rpc.mockResolvedValueOnce({data:{observed_at:'2026-10-26T00:00:00Z',items:[],truncated:true},error:null});await expect(new SupabaseTeamActivity().list(actor)).rejects.toMatchObject({status:503});rpc.mockRejectedValueOnce(new Error('private staff name'));await expect(new SupabaseTeamActivity().list(actor)).rejects.toThrow('Team activity unavailable');});
});
