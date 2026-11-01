import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import type {NextRequest} from '../../apps/clinic-os/node_modules/next/server';
const refresh=vi.hoisted(()=>vi.fn());
const provider=vi.hoisted(()=>vi.fn(()=>({auth:{refreshSession:refresh,signOut:vi.fn()}})));
vi.mock('../../apps/clinic-os/node_modules/@supabase/supabase-js',()=>({createClient:provider}));
import {POST} from '../../apps/clinic-os/app/api/clinic-session/route';
const origin='https://clinic.example.test';
function request(body:unknown,source:string=origin):NextRequest {
 return {headers:new Headers({host:'clinic.example.test',origin:source,'x-clinic-session':'1','sec-fetch-site':'same-origin','content-type':'application/json'}),nextUrl:new URL(origin+'/api/clinic-session'),cookies:{get:()=>({value:'cookie-refresh-fixture'})},text:async()=>JSON.stringify(body)} as unknown as NextRequest;
}
beforeEach(()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://giufpdppsunryyhfnzps.supabase.co');
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','public-test-key');
 vi.stubEnv('CLINIC_SESSION_PROJECT_REF','giufpdppsunryyhfnzps');
 vi.stubEnv('CLINIC_APP_ORIGIN',origin);
 provider.mockClear();refresh.mockReset();
 refresh.mockResolvedValue({data:{session:{access_token:'access-fixture',refresh_token:'rotated-refresh-fixture',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-fixture'}}},error:null});
});
afterEach(()=>vi.unstubAllEnvs());
describe('hosted clinic session route',()=>{
 it('refreshes through the pinned provider and keeps refresh token in a secure HttpOnly cookie',async()=>{
   const result=await POST(request({action:'resume'}));
   expect(result.status).toBe(200);expect(provider.mock.calls[0]?.slice(0,2)).toEqual(['https://giufpdppsunryyhfnzps.supabase.co','public-test-key']);
   expect(refresh).toHaveBeenCalledWith({refresh_token:'cookie-refresh-fixture'});
   expect(await result.json()).toEqual({access_token:'access-fixture',expires_at:expect.any(Number),user_id:'user-fixture'});
   const cookie=result.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=strict');expect(cookie).toContain('Path=/api/clinic-session');
   expect(result.headers.get('cache-control')).toContain('no-store');
 });
 it('rejects foreign origins and caller-selected provider fields before contacting Auth',async()=>{
   expect((await POST(request({action:'resume'},'https://outside.example.test'))).status).toBe(403);
   expect((await POST(request({action:'start',refresh_token:'fixture-token',url:'https://outside.example.test'}))).status).toBe(400);
   expect(provider).not.toHaveBeenCalled();
 });
 it('fails closed for a missing hosted project pin without clearing a valid refresh cookie',async()=>{
   vi.stubEnv('CLINIC_SESSION_PROJECT_REF','');const result=await POST(request({action:'resume'}));expect(result.status).toBe(503);expect(result.headers.get('set-cookie')).toBeNull();expect(provider).not.toHaveBeenCalled();
 });
 it('preserves the cookie after a transient provider error and clears it after invalid refresh',async()=>{
   refresh.mockResolvedValueOnce({data:{session:null},error:{status:503}});
   const transient=await POST(request({action:'resume'}));expect(transient.status).toBe(503);expect(transient.headers.get('set-cookie')).toBeNull();
   refresh.mockResolvedValueOnce({data:{session:null},error:{status:400}});
   const expired=await POST(request({action:'resume'}));expect(expired.status).toBe(401);expect(expired.headers.get('set-cookie')).toContain('Max-Age=0');
 });
});
