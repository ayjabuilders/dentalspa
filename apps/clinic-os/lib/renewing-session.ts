/** Access tokens stay in memory. Renewal does not replace component props or command state. */
export type RenewableAuth={token:string;userId:string;expiresAt:number;api:string};
type Options={auth:RenewableAuth;refresh:()=>Promise<RenewableAuth>;onExpired:()=>void;fetcher?:typeof globalThis.fetch;now?:()=>number;setTimer?:typeof setTimeout;clearTimer?:typeof clearTimeout};
export function createRenewingSession(options:Options){
 const fetcher=options.fetcher??globalThis.fetch.bind(globalThis),now=options.now??Date.now,setTimer=options.setTimer??setTimeout,clearTimer=options.clearTimer??clearTimeout;
 const original=options.auth.token,api=new URL(options.auth.api),prefix=api.pathname.replace(/\/$/,'')+'/api/v1/';
 let current={...options.auth},active=true,flight:Promise<void>|null=null,timer:ReturnType<typeof setTimeout>|null=null;
 function stop(){active=false;if(timer)clearTimer(timer);timer=null;current={...current,token:''};}
 function expire(){if(!active)return;stop();options.onExpired();}
 function schedule(delay=Math.max(1000,current.expiresAt-now()-60000)){if(!active)return;if(timer)clearTimer(timer);timer=setTimer(()=>{void renew().catch(()=>undefined);},delay);}
 async function renew(){
  if(!active)throw new DOMException('Session closed','AbortError');if(flight)return flight;
  flight=(async()=>{try{const next=await options.refresh();if(!active)throw new DOMException('Session closed','AbortError');if(next.userId!==current.userId||next.api!==current.api||next.expiresAt<=now()||!next.token){expire();throw Error('Session identity changed');}current=next;schedule();}
   catch(error){if(active){if((error instanceof Error&&error.message==='session-expired')||current.expiresAt<=now())expire();else schedule(Math.min(15000,Math.max(1000,current.expiresAt-now())));}throw error;}
   finally{flight=null;}})();return flight;
 }
 const fetch:typeof globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),api.origin),headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
  if(headers.get('Authorization')!=='Bearer '+original)return fetcher(input,init);
  if(url.origin!==api.origin||!url.pathname.startsWith(prefix))throw Error('Authenticated request outside configured API');
  if(!active)throw new DOMException('Session closed','AbortError');
  if(current.expiresAt-now()<=60000){try{await renew();}catch(error){if(!active||current.expiresAt<=now())throw error;}}
  if(!active)throw new DOMException('Session closed','AbortError');
  init?.signal?.throwIfAborted();if(input instanceof Request)input.signal.throwIfAborted();
  headers.set('Authorization','Bearer '+current.token);
  // Never replay a mutation here. The module retains ownership of its idempotency key.
  return fetcher(input,{...init,headers});
 };
 schedule();return {fetch,stop,renew};
}
let installed:ReturnType<typeof createRenewingSession>|null=null;
export function installRenewingSession(options:Options){installed?.stop();installed=createRenewingSession(options);}
export function stopRenewingSession(){installed?.stop();installed=null;}
export const sessionFetch:typeof globalThis.fetch=(input,init)=>installed?installed.fetch(input,init):globalThis.fetch(input,init);
