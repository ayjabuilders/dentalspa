import {describe,it,expect} from 'vitest';
import {clinicSessionProvider,trustedClinicSessionOrigin} from '../../apps/clinic-os/lib/clinic-session-policy';
const hosted={NEXT_PUBLIC_SUPABASE_URL:'https://giufpdppsunryyhfnzps.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'publishable-test',CLINIC_SESSION_PROJECT_REF:'giufpdppsunryyhfnzps',CLINIC_APP_ORIGIN:'https://clinic.example.test'};
describe('clinic refresh provider boundary',()=>{
 it('supports the pinned hosted provider only with server-side configuration',()=>{
   expect(clinicSessionProvider(hosted)).toEqual({origin:hosted.NEXT_PUBLIC_SUPABASE_URL,key:'publishable-test',hosted:true});
   expect(clinicSessionProvider({...hosted,CLINIC_SESSION_PROJECT_REF:undefined})).toBeNull();
   expect(clinicSessionProvider({...hosted,CLINIC_APP_ORIGIN:undefined})).toBeNull();
   expect(clinicSessionProvider({...hosted,CLINIC_APP_ORIGIN:'http://clinic.example.test'})).toBeNull();
 });
 it.each(['https://anotherproject000000.supabase.co','https://giufpdppsunryyhfnzps.supabase.co.evil.test','http://giufpdppsunryyhfnzps.supabase.co','https://giufpdppsunryyhfnzps.supabase.co:444','https://user:pass@giufpdppsunryyhfnzps.supabase.co','https://giufpdppsunryyhfnzps.supabase.co/auth','https://giufpdppsunryyhfnzps.supabase.co?redirect=evil','https://giufpdppsunryyhfnzps.supabase.co#evil'])('does not forward refresh credentials to %s',url=>{
   expect(clinicSessionProvider({...hosted,NEXT_PUBLIC_SUPABASE_URL:url})).toBeNull();
 });
 it('preserves local desktop/LAN browser sessions without sending tokens to a LAN provider',()=>{
   expect(clinicSessionProvider({NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local'})).toMatchObject({hosted:false});
   expect(clinicSessionProvider({NEXT_PUBLIC_SUPABASE_URL:'http://192.168.11.102:54321',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local'})).toBeNull();
   expect(trustedClinicSessionOrigin('http://192.168.11.102:4204','192.168.11.102:4204','http:')).toBe(true);
 });
 it('rejects cross-origin, malformed and unconfigured deployment origins',()=>{
   expect(trustedClinicSessionOrigin(hosted.CLINIC_APP_ORIGIN,'clinic.example.test','https:',hosted.CLINIC_APP_ORIGIN)).toBe(true);
   for(const source of [null,'null','https://outside.test','https://clinic.example.test/','https://clinic.example.test/path','https://user@clinic.example.test']) expect(trustedClinicSessionOrigin(source,'clinic.example.test','https:',hosted.CLINIC_APP_ORIGIN)).toBe(false);
   expect(trustedClinicSessionOrigin('https://preview.example.test','preview.example.test','https:',hosted.CLINIC_APP_ORIGIN)).toBe(false);
   expect(trustedClinicSessionOrigin(hosted.CLINIC_APP_ORIGIN,'clinic.example.test','http:',hosted.CLINIC_APP_ORIGIN)).toBe(false);
 });
});
