import {describe,expect,it} from 'vitest';
import {documentsActivationKey} from '../../apps/dental-api/src/identity/infrastructure/module-activation';
const hosted={SUPABASE_URL:'https://giufpdppsunryyhfnzps.supabase.co',HOSTED_SUPABASE_PROJECT_REF:'giufpdppsunryyhfnzps',HOSTED_PATIENT_DOCUMENTS_GATE_KEY:'test-hosted-gate'};
describe('document deployment activation',()=>{
  it('requires a distinct hosted switch and key',()=>{
    expect(documentsActivationKey({...hosted,ENABLE_LOCAL_PATIENT_DOCUMENTS:'true',LOCAL_PATIENT_DOCUMENTS_GATE_KEY:'local'})).toBeNull();
    expect(documentsActivationKey({...hosted,ENABLE_HOSTED_PATIENT_DOCUMENTS:'true'})).toBe('test-hosted-gate');
    expect(documentsActivationKey({...hosted,ENABLE_HOSTED_PATIENT_DOCUMENTS:'true',HOSTED_PATIENT_DOCUMENTS_GATE_KEY:undefined})).toBeNull();
  });
  it('preserves explicit local activation without using hosted keys',()=>{
    const env={...hosted,SUPABASE_URL:'http://127.0.0.1:54321',ENABLE_HOSTED_PATIENT_DOCUMENTS:'true'};
    expect(documentsActivationKey(env)).toBeNull();
    expect(documentsActivationKey({...env,ENABLE_LOCAL_PATIENT_DOCUMENTS:'true',LOCAL_PATIENT_DOCUMENTS_GATE_KEY:'local'})).toBe('local');
  });
  it.each(['http://giufpdppsunryyhfnzps.supabase.co','https://giufpdppsunryyhfnzps.supabase.co.evil.test','https://other.supabase.co','https://user:pass@giufpdppsunryyhfnzps.supabase.co','https://giufpdppsunryyhfnzps.supabase.co/rest/v1','https://giufpdppsunryyhfnzps.supabase.co?x=1'])('rejects an invalid provider %s',SUPABASE_URL=>{
    expect(documentsActivationKey({...hosted,SUPABASE_URL,ENABLE_HOSTED_PATIENT_DOCUMENTS:'true'})).toBeNull();
  });
  it('requires project binding',()=>{
    expect(documentsActivationKey({...hosted,ENABLE_HOSTED_PATIENT_DOCUMENTS:'true',HOSTED_SUPABASE_PROJECT_REF:undefined})).toBeNull();
  });
});
