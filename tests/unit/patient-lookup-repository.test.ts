import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { Actor } from '../../apps/dental-api/src/identity/domain/access';
import { A,STAFF,P1 } from '../fixtures';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),client:vi.fn()}));
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:mocks.client}));
import { SupabasePatients, throwPatientLookupError } from '../../apps/dental-api/src/patients/infrastructure/patient.repository';
const actor:Actor={userId:STAFF,clinicId:A,token:'synthetic-token',roles:['reception']};
const payload={mode:'name_prefix' as const,query:'Al'};
const item={id:P1,clinic_id:A,reference:'R-001',display_name:'Alice',match_basis:'name_prefix'};
describe('patient lookup RPC transport and safe errors',()=>{
  beforeEach(()=>{mocks.rpc.mockReset();mocks.client.mockReset().mockReturnValue({rpc:mocks.rpc});});
  it('uses verified token and JSON POST RPC with no REST filter chain',async()=>{
    mocks.rpc.mockResolvedValue({data:{items:[item],truncated:false},error:null});
    expect(await new SupabasePatients().lookup(actor,payload)).toEqual({items:[item],truncated:false});
    expect(mocks.client).toHaveBeenCalledExactlyOnceWith(actor.token);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('lookup_patients',{p_clinic_id:A,p_request:payload},{get:false,head:false});
  });
  it('fails closed for malformed provider data and unauthorized extra fields',async()=>{
    for(const data of [{items:[{...item,contact_email:'synthetic@example.test'}],truncated:false},{items:Array(21).fill(item),truncated:true},{items:[]},{items:[],truncated:'false'}]){
      mocks.rpc.mockResolvedValueOnce({data,error:null});
      await expect(new SupabasePatients().lookup(actor,payload)).rejects.toMatchObject({status:503,message:'Patient lookup unavailable'});
    }
  });
  it('sanitizes a thrown provider exception without logging query/token/error text',async()=>{
    mocks.rpc.mockRejectedValueOnce(new Error('synthetic-token Alice SQL detail'));
    await expect(new SupabasePatients().lookup(actor,payload)).rejects.toMatchObject({status:503,message:'Patient lookup unavailable'});
  });
  for(const [code,status] of [['28000',401],['PGRST301',401],['PGRST302',401],['42501',403],['22023',400],['22P02',400],['22P05',400],['unknown',503]] as const){
    it(`maps ${code} to sanitized ${status}`,()=>{
      expect.assertions(3);
      try{throwPatientLookupError({code,...{message:'Alice synthetic-token'}});}
      catch(error){expect(error).toBeInstanceOf(HttpException);expect((error as HttpException).getStatus()).toBe(status);expect(JSON.stringify((error as HttpException).getResponse())).not.toMatch(/Alice|synthetic-token/);}
    });
  }
});
