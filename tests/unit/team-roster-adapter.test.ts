import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseTeamRoster } from '../../apps/dental-api/src/team/infrastructure/roster.repository';
import { TeamRosterService } from '../../apps/dental-api/src/team/application/roster.service';
import { A,STAFF } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['manager' as const]};
describe('team roster adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('calls POST RPC with only verified clinic and preserves empty response',async()=>{
  rpc.mockResolvedValue({data:{observed_at:'2026-10-26T00:00:00Z',members:[],truncated:false},error:null});await new SupabaseTeamRoster().list(actor);expect(rpc).toHaveBeenCalledWith('team_roster',{p_clinic_id:A},{get:false,head:false});
 });
 it.each([['42501',403],['28000',401],['22023',400],['PT503',503],['XX000',503]])('sanitizes%s without disabled-write meaning',async(code,status)=>{
  rpc.mockResolvedValue({data:null,error:{code,message:'private staff profile'}});
  try{await new SupabaseTeamRoster().list(actor);throw new Error('expected rejection');}catch(error){expect(error).toMatchObject({status});expect(String(error)).not.toContain('private');expect(error).not.toMatchObject({response:{code:'intake_disabled'}});}
 });
 it('rejects case-varied duplicate UUIDs and impossible partial results',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const member={user_id:id,clinic_id:A,display_name:'Synthetic',roles:['manager']};
  const service=new TeamRosterService({list:async()=>({observed_at:'2026-10-26T00:00:00Z',members:[member,{...member,user_id:id.toUpperCase()}],truncated:false}) as never});await expect(service.list(actor)).rejects.toMatchObject({status:503});
  const partial=new TeamRosterService({list:async()=>({observed_at:'2026-10-26T00:00:00Z',members:[],truncated:true})});await expect(partial.list(actor)).rejects.toMatchObject({status:503});
 });
});
