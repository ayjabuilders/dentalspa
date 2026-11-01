import {afterEach,describe,expect,it,vi} from 'vitest';
import {createRenewingSession} from '../../apps/clinic-os/lib/renewing-session';
afterEach(()=>vi.useRealTimers());
const auth={token:'initial',userId:'user-a',api:'http://localhost:4300',expiresAt:120000};
describe('in-memory session renewal',()=>{
 it('coalesces refresh and dispatches each command once with its original body/key',async()=>{
  vi.useFakeTimers();vi.setSystemTime(0);let resolve!:(a:typeof auth)=>void;
  const refresh=vi.fn(()=>new Promise<typeof auth>(r=>{resolve=r;})),fetcher=vi.fn(async()=>new Response('{}'));
  const session=createRenewingSession({auth,refresh,fetcher,onExpired:vi.fn()});vi.setSystemTime(70000);
  const body=JSON.stringify({amount_minor:123}),headers={Authorization:'Bearer initial','Idempotency-Key':'same-command'};
  const first=session.fetch(auth.api+'/api/v1/commands',{method:'POST',headers,body}),second=session.fetch(auth.api+'/api/v1/patients',{headers});
  expect(refresh).toHaveBeenCalledTimes(1);expect(fetcher).not.toHaveBeenCalled();resolve({...auth,token:'rotated',expiresAt:3600000});await Promise.all([first,second]);
  expect(fetcher).toHaveBeenCalledTimes(2);const call=fetcher.mock.calls[0] as unknown as [unknown,RequestInit];expect(call[1].body).toBe(body);expect(new Headers(call[1].headers).get('Idempotency-Key')).toBe('same-command');expect(new Headers(call[1].headers).get('Authorization')).toBe('Bearer rotated');session.stop();
 });
 it('does not dispatch an in-flight renewal after logout',async()=>{
  vi.useFakeTimers();vi.setSystemTime(70000);let resolve!:(a:typeof auth)=>void;const fetcher=vi.fn(async()=>new Response('{}'));
  const session=createRenewingSession({auth,fetcher,refresh:()=>new Promise(r=>{resolve=r;}),onExpired:vi.fn()});const request=session.fetch(auth.api+'/api/v1/commands',{method:'POST',headers:{Authorization:'Bearer initial'},body:'unchanged'});const rejected=expect(request).rejects.toThrow('Session closed');session.stop();resolve({...auth,token:'rotated',expiresAt:3600000});await rejected;expect(fetcher).not.toHaveBeenCalled();
 });
 it('expires on invalid refresh or changed identity without sending the command',async()=>{
  vi.useFakeTimers();vi.setSystemTime(70000);
  for(const refresh of [async()=>{throw Error('session-expired');},async()=>({...auth,userId:'user-b',expiresAt:3600000})]){const fetcher=vi.fn(async()=>new Response('{}')),onExpired=vi.fn();const session=createRenewingSession({auth,refresh,fetcher,onExpired});await expect(session.fetch(auth.api+'/api/v1/commands',{headers:{Authorization:'Bearer initial'}})).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();expect(onExpired).toHaveBeenCalledTimes(1);session.stop();}
 });
 it('never forwards a managed credential outside its configured API',async()=>{
  vi.useFakeTimers();vi.setSystemTime(0);const fetcher=vi.fn(async()=>new Response('{}'));const session=createRenewingSession({auth,refresh:vi.fn(),fetcher,onExpired:vi.fn()});await expect(session.fetch('https://outside.invalid/api/v1/patients',{headers:{Authorization:'Bearer initial'}})).rejects.toThrow('outside configured API');expect(fetcher).not.toHaveBeenCalled();session.stop();
 });
 it('keeps a still-valid token during transient refresh failure and expires at the boundary',async()=>{
  vi.useFakeTimers();vi.setSystemTime(70000);const fetcher=vi.fn(async()=>new Response('{}')),onExpired=vi.fn();const session=createRenewingSession({auth,fetcher,onExpired,refresh:async()=>{throw Error('network');}});
  await session.fetch(auth.api+'/api/v1/patients',{headers:{Authorization:'Bearer initial'}});expect(fetcher).toHaveBeenCalledTimes(1);expect(onExpired).not.toHaveBeenCalled();vi.setSystemTime(120001);await expect(session.fetch(auth.api+'/api/v1/patients',{headers:{Authorization:'Bearer initial'}})).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);expect(onExpired).toHaveBeenCalledTimes(1);session.stop();
 });
});
