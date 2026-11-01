import {describe,expect,it} from 'vitest';
import {publicAgendaActivation} from '../../apps/dental-api/src/identity/infrastructure/module-activation';
const env={SUPABASE_URL:'https://giufpdppsunryyhfnzps.supabase.co',HOSTED_SUPABASE_PROJECT_REF:'giufpdppsunryyhfnzps',ENABLE_HOSTED_PUBLIC_AGENDA:'true',HOSTED_PUBLIC_AGENDA_GATE_KEY:'public-test',HOSTED_PUBLIC_AGENDA_CLINIC_ID:'10000000-0000-4000-8000-000000000001'};
describe('hosted public agenda configuration',()=>{
 it('binds a server-selected clinic with separate request/confirmation switches',()=>{
   expect(publicAgendaActivation(env)).toEqual({clinicId:env.HOSTED_PUBLIC_AGENDA_CLINIC_ID,gateKey:'public-test',requestsEnabled:false,confirmationsEnabled:false});
   expect(publicAgendaActivation({...env,ENABLE_HOSTED_CONFIGURED_BOOKING_REQUESTS:'true'})).toMatchObject({requestsEnabled:true,confirmationsEnabled:false});
   expect(publicAgendaActivation({...env,ENABLE_HOSTED_CONFIGURED_BOOKING_REQUESTS:'true',ENABLE_HOSTED_CONFIGURED_BOOKING_CONFIRMATIONS:'true'})).toMatchObject({requestsEnabled:true,confirmationsEnabled:true});
 });
 it('does not inherit local switches or clinic selection',()=>{
   expect(publicAgendaActivation({...env,HOSTED_PUBLIC_AGENDA_CLINIC_ID:undefined,LOCAL_PUBLIC_AGENDA_CLINIC_ID:'other',ENABLE_LOCAL_CONFIGURED_BOOKING_REQUESTS:'true'})).toMatchObject({clinicId:undefined,requestsEnabled:false});
 });
 it.each(['https://other.supabase.co','http://giufpdppsunryyhfnzps.supabase.co','https://giufpdppsunryyhfnzps.supabase.co/rest/v1'])('rejects provider %s',SUPABASE_URL=>{
   expect(publicAgendaActivation({...env,SUPABASE_URL})).toBeNull();
 });
 it('requires public activation and key independently of staff settings',()=>{
   expect(publicAgendaActivation({...env,ENABLE_HOSTED_PUBLIC_AGENDA:'false',ENABLE_HOSTED_AGENDA_SETTINGS:'true'})).toBeNull();
   expect(publicAgendaActivation({...env,HOSTED_PUBLIC_AGENDA_GATE_KEY:undefined,HOSTED_AGENDA_SETTINGS_GATE_KEY:'staff'})).toBeNull();
 });
});
