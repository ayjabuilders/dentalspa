type SessionEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  CLINIC_SESSION_PROJECT_REF?: string;
  CLINIC_APP_ORIGIN?: string;
};

function originOnly(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? '');
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url : null;
  } catch { return null; }
}

/** Server configuration selects the provider; request bodies never select a host. */
export function clinicSessionProvider(env: SessionEnvironment): {origin:string; key:string; hosted:boolean} | null {
  const url=originOnly(env.NEXT_PUBLIC_SUPABASE_URL), key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url || !key) return null;
  if(url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname) && url.port==='54321') return {origin:url.origin,key,hosted:false};
  const ref=env.CLINIC_SESSION_PROJECT_REF, app=originOnly(env.CLINIC_APP_ORIGIN);
  if(!ref || !/^[a-z0-9]{20}$/.test(ref) || url.origin!==`https://${ref}.supabase.co` || !app || app.protocol!=='https:') return null;
  return {origin:url.origin,key,hosted:true};
}

export function trustedClinicSessionOrigin(origin:string|null,host:string|null,protocol:string,configuredOrigin?:string):boolean {
  const source=originOnly(origin??undefined);
  if(!source || origin!==source.origin || source.host!==host || source.protocol!==protocol) return false;
  if(configuredOrigin) {
    const configured=originOnly(configuredOrigin);
    return !!configured && configured.protocol==='https:' && configured.origin===source.origin;
  }
  return true;
}
