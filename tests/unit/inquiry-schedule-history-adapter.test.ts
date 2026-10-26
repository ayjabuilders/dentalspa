import { beforeEach,describe,expect,it,vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import { SupabaseScheduleHistory } from '../../apps/dental-api/src/intake/infrastructure/schedule-history.repository';
import { A,STAFF,P1 } from '../fixtures';
const actor={clinicId:A,userId:STAFF,token:'synthetic-token',roles:['reception' as const]};
describe('schedule history adapter',()=>{
 beforeEach(()=>rpc.mockReset());
 it('uses explicit POST and binds actor clinic and inquiry',async()=>{rpc.mockResolvedValue({data:{inquiry_id:P1,items:[],truncated:false},error:null});await new SupabaseScheduleHistory().list(actor,P1);expect(rpc).toHaveBeenCalledWith('inquiry_schedule_history',{p_clinic_id:A,p_inquiry_id:P1},{get:false,head:false});});
 it.each([['PT404',404],['42501',403],['22023',400],['28000',401],['PT503',503],['XX000',503]])('sanitizes%s without write-disabled meaning',async(code,status)=>{rpc.mockResolvedValue({data:null,error:{code,message:'private contact'}});try{await new SupabaseScheduleHistory().list(actor,P1);throw new Error('expected error');}catch(error){expect(error).toMatchObject({status});expect(String(error)).not.toContain('private');expect(error).not.toMatchObject({response:{code:'intake_disabled'}});}});
 it('rejects malformed data and transport failure',async()=>{rpc.mockResolvedValueOnce({data:{inquiry_id:P1,items:[],truncated:true},error:null});await expect(new SupabaseScheduleHistory().list(actor,P1)).rejects.toMatchObject({status:503});rpc.mockRejectedValueOnce(new Error('private token'));await expect(new SupabaseScheduleHistory().list(actor,P1)).rejects.toThrow('Schedule history unavailable');});
});
