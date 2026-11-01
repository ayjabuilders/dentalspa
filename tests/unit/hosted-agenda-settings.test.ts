import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {A,STAFF} from '../fixtures';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/dental-api/src/identity/infrastructure/supabase',()=>({scopedClient:()=>({rpc})}));
import {AgendaSettingsService} from '../../apps/dental-api/src/booking-requests/agenda-settings.service';
const actor={clinicId:A,userId:STAFF,token:'test-token',roles:['manager' as const]};
describe('hosted agenda configuration access',()=>{
  beforeEach(()=>{
    rpc.mockReset().mockResolvedValue({data:{settings:null},error:null});
    vi.stubEnv('SUPABASE_URL','https://giufpdppsunryyhfnzps.supabase.co');
    vi.stubEnv('HOSTED_SUPABASE_PROJECT_REF','giufpdppsunryyhfnzps');
    vi.stubEnv('ENABLE_HOSTED_AGENDA_SETTINGS','true');
    vi.stubEnv('HOSTED_AGENDA_SETTINGS_GATE_KEY','hosted-test-key');
  });
  afterEach(()=>vi.unstubAllEnvs());
  it('passes the hosted key and actor clinic to the scoped RPC',async()=>{
    await expect(new AgendaSettingsService().read(actor)).resolves.toEqual({settings:null});
    expect(rpc).toHaveBeenCalledWith('read_local_agenda_configuration',{p_clinic_id:A,p_gate_key:'hosted-test-key'});
  });
  it('keeps local-only flags from enabling hosted configuration',async()=>{
    vi.stubEnv('ENABLE_HOSTED_AGENDA_SETTINGS','false');
    vi.stubEnv('ENABLE_LOCAL_AGENDA_SETTINGS','true');
    vi.stubEnv('LOCAL_AGENDA_SETTINGS_GATE_KEY','local-test-key');
    await expect(new AgendaSettingsService().read(actor)).rejects.toThrow('not enabled');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects unpinned providers before accessing data',async()=>{
    vi.stubEnv('SUPABASE_URL','https://other.supabase.co');
    await expect(new AgendaSettingsService().read(actor)).rejects.toThrow('not enabled');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('retains manager-only editing authority',async()=>{
    await expect(new AgendaSettingsService().read({...actor,roles:['assistant']})).rejects.toThrow('Manager access required');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('preserves server authorization rejection',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'42501'}});
    await expect(new AgendaSettingsService().read(actor)).rejects.toThrow('scope denied');
  });
});
