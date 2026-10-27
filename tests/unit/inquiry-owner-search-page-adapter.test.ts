import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseOwnerSearchPage } from '../../apps/dental-api/src/intake/infrastructure/owner-search-page.repository';
import { A,STAFF } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['reception' as const]};
describe('owner search adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('uses POST RPC with verified clinic and canonical literal payload',async()=>{rpc.mockResolvedValue({data:{clinic_id:A,owner_user_id:STAFF,name:'\\%_',before:null,next_before:null,items:[],truncated:false},error:null});await new SupabaseOwnerSearchPage().search(actor,{before:null,name:'\\%_'});expect(rpc).toHaveBeenCalledWith('inquiry_owner_search_page',{p_clinic_id:A,p_payload:{before:null,name:'\\%_'}},{get:false,head:false});});
 it.each([['42501',403],['22023',400],['22P05',400],['28000',401],['PT503',503],['PT404',503],['XX000',503]])('sanitizes%s without write-disabled/foreign-existence meaning',async(code,status)=>{rpc.mockResolvedValue({data:null,error:{code,message:'private contact'}});try{await new SupabaseOwnerSearchPage().search(actor,{before:null,name:'Synthetic'});throw new Error('expected error');}catch(error){expect(error).toMatchObject({status});expect(String(error)).not.toContain('private');expect(error).not.toMatchObject({response:{code:'intake_disabled'}});}});
 it('rejects malformed response and hides transport failures',async()=>{rpc.mockResolvedValueOnce({data:{clinic_id:A,owner_user_id:STAFF,name:'Synthetic',before:null,next_before:null,items:[],truncated:true},error:null});await expect(new SupabaseOwnerSearchPage().search(actor,{before:null,name:'Synthetic'})).rejects.toMatchObject({status:503});rpc.mockRejectedValueOnce(new Error('private token'));await expect(new SupabaseOwnerSearchPage().search(actor,{before:null,name:'Synthetic'})).rejects.toThrow('Owner search unavailable');});
});
