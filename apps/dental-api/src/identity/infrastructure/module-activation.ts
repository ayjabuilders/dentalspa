const financeModules = {
  quotes: 'QUOTE_DRAFTS', invoices: 'INVOICES', payments: 'PAYMENTS', installments: 'INSTALLMENTS',
} as const;
export type FinanceModule = keyof typeof financeModules;

/** Deployment selection is configuration, never authorization. RPC guards still
 * validate sessions, memberships, patient scope and their independent DB gate. */
export function financeActivationKey(module:FinanceModule,env:Readonly<Record<string,string|undefined>>=process.env):string|null {
  return deploymentActivationKey(financeModules[module], 'LOCAL_QUOTE_DRAFT_GATE_KEY', 'HOSTED_FINANCE_GATE_KEY', env);
}

export function teamActivationKey(env:Readonly<Record<string,string|undefined>>=process.env):string|null {
  return deploymentActivationKey('TEAM_ACCESS', 'LOCAL_TEAM_ACCESS_GATE_KEY', 'HOSTED_TEAM_ACCESS_GATE_KEY', env);
}

export function documentsActivationKey(env:Readonly<Record<string,string|undefined>>=process.env):string|null {
  return deploymentActivationKey('PATIENT_DOCUMENTS', 'LOCAL_PATIENT_DOCUMENTS_GATE_KEY', 'HOSTED_PATIENT_DOCUMENTS_GATE_KEY', env);
}

export function agendaSettingsActivationKey(env:Readonly<Record<string,string|undefined>>=process.env):string|null {
  return deploymentActivationKey('AGENDA_SETTINGS', 'LOCAL_AGENDA_SETTINGS_GATE_KEY', 'HOSTED_AGENDA_SETTINGS_GATE_KEY', env);
}

export function configuredBookingActivationKey(env:Readonly<Record<string,string|undefined>>=process.env):string|null {
  return deploymentActivationKey('CONFIGURED_BOOKING_CONFIRMATIONS', 'LOCAL_AGENDA_SETTINGS_GATE_KEY', 'HOSTED_AGENDA_SETTINGS_GATE_KEY', env);
}

export function publicAgendaActivation(env:Readonly<Record<string,string|undefined>>=process.env) {
  const key = (suffix:string) => deploymentActivationKey(suffix,'LOCAL_PUBLIC_AGENDA_GATE_KEY','HOSTED_PUBLIC_AGENDA_GATE_KEY',env);
  const gateKey=key('PUBLIC_AGENDA');
  if(!gateKey)return null;
  const hosted=env.SUPABASE_URL?.startsWith('https:');
  return {
    gateKey,
    clinicId:hosted?env.HOSTED_PUBLIC_AGENDA_CLINIC_ID:env.LOCAL_PUBLIC_AGENDA_CLINIC_ID,
    requestsEnabled:!!key('CONFIGURED_BOOKING_REQUESTS'),
    confirmationsEnabled:!!key('CONFIGURED_BOOKING_CONFIRMATIONS'),
  };
}

function deploymentActivationKey(suffix:string,localKey:string,hostedKey:string,env:Readonly<Record<string,string|undefined>>):string|null {
  let url:URL;
  try { url=new URL(env.SUPABASE_URL??''); } catch { return null; }
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;
  const local=url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.port==='54321';
  if(local) return env[`ENABLE_LOCAL_${suffix}`]==='true'&&env[localKey] ? env[localKey] : null;
  const ref=env.HOSTED_SUPABASE_PROJECT_REF;
  if(!ref||!/^[a-z0-9]{20}$/.test(ref)||url.origin!==`https://${ref}.supabase.co`)return null;
  return env[`ENABLE_HOSTED_${suffix}`]==='true'&&env[hostedKey] ? env[hostedKey] : null;
}
