import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {clinicSessionProvider,trustedClinicSessionOrigin} from '../../../lib/clinic-session-policy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const cookieName='clinic_os_refresh';
const cookiePath='/api/clinic-session';
function response(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, private','Pragma':'no-cache','Vary':'Origin','X-Content-Type-Options':'nosniff'}});}
function clear(result:NextResponse,secure:boolean){result.cookies.set(cookieName,'',{httpOnly:true,sameSite:'strict',secure,path:cookiePath,maxAge:0});return result;}
/** Local development or an explicitly pinned hosted provider. No caller-selected URL. */
export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');
 const sameOrigin=trustedClinicSessionOrigin(origin,request.headers.get('host'),request.nextUrl.protocol,process.env.CLINIC_APP_ORIGIN);
 if(!sameOrigin||request.headers.get('x-clinic-session')!=='1'||request.headers.get('sec-fetch-site')==='cross-site')return response({error:'Forbidden'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')??0)>4096)return response({error:'Invalid request'},400);
 let body:Record<string,unknown>;
 try{const text=await request.text();if(text.length>4096)throw Error();const parsed:unknown=JSON.parse(text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();body=parsed as Record<string,unknown>;}catch{return response({error:'Invalid request'},400);}
 const action=body.action;
 if(!['start','resume','logout'].includes(String(action))||Object.keys(body).some(k=>k!=='action'&&!(action==='start'&&k==='refresh_token')))return response({error:'Invalid request'},400);
 const secure=request.nextUrl.protocol==='https:';
 const provider=clinicSessionProvider({NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,CLINIC_SESSION_PROJECT_REF:process.env.CLINIC_SESSION_PROJECT_REF,CLINIC_APP_ORIGIN:process.env.CLINIC_APP_ORIGIN});
 if(!provider || (provider.hosted&&!secure))return action==='logout'?clear(response({ok:true}),secure):response({error:'Session unavailable'},503);
 const token=action==='start'?body.refresh_token:request.cookies.get(cookieName)?.value;
 if(typeof token!=='string'||token.length<8||token.length>2048){return action==='logout'?clear(response({ok:true}),secure):clear(response({error:'No session'},401),secure);}
 const client=createClient(provider.origin,provider.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',signal:AbortSignal.timeout(15000)})}});
 try{
  const {data,error}=await client.auth.refreshSession({refresh_token:token});
  if(error||!data.session){
   if(action==='logout')return clear(response({ok:true}),secure);
   if(error&&(!error.status||error.status>=500||error.status===429))return response({error:'Session temporarily unavailable'},503);
   return clear(response({error:'Session expired'},401),secure);
  }
  if(action==='logout'){await client.auth.signOut({scope:'local'});return clear(response({ok:true}),secure);}
  const session=data.session;if(!session.expires_at||session.expires_at*1000<=Date.now())return clear(response({error:'Session expired'},401),secure);
  const result=response({access_token:session.access_token,expires_at:session.expires_at,user_id:session.user.id});
  result.cookies.set(cookieName,session.refresh_token,{httpOnly:true,sameSite:'strict',secure,path:cookiePath,maxAge:8*60*60});
  return result;
 }catch{return action==='logout'?clear(response({ok:true}),secure):response({error:'Session temporarily unavailable'},503);}
}
