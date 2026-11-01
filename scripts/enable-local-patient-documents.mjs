import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';

// Explicit local demo setup. Never changes an existing user's password or roles.
const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true };
const status = JSON.parse(process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], options)
  : execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], options));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
const clinicId = '10000000-0000-4000-8000-000000000001';
const envPath = 'apps/dental-api/.env.local';
let env = readFileSync(envPath, 'utf8');
assert.match(env, /^SUPABASE_URL=http:\/\/127\.0\.0\.1:54321\s*$/m);
const accessPath = '.local/document-demo-access.json';
const saved = existsSync(accessPath) ? JSON.parse(readFileSync(accessPath, 'utf8')) : { clinicId, accounts: [] };
assert.equal(saved.clinicId, clinicId);
const key = env.match(/^LOCAL_PATIENT_DOCUMENTS_GATE_KEY=(.+)$/m)?.[1]?.trim() ?? randomBytes(32).toString('hex');
const db = new pg.Client({ host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres', database: 'postgres' });
const headers = { apikey: status.SERVICE_ROLE_KEY, Authorization: 'Bearer ' + status.SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
await db.connect();
try {
  const clinic = await db.query("select name from public.clinics where id=$1 and name like '%(FICTIF)'", [clinicId]);
  assert.equal(clinic.rowCount, 1, 'Exact synthetic Atlas clinic required');
  for (const item of [
    { role: 'dentist', email: 'demo.dentiste.documents@dentalspa.test', name: 'Dr Amina — démonstration (FICTIF)' },
    { role: 'assistant', email: 'demo.assistante.documents@dentalspa.test', name: 'Ghita — assistante démonstration (FICTIF)' },
  ]) {
    const existing = (await db.query('select id from auth.users where email=$1', [item.email])).rows[0];
    let account = saved.accounts.find(a => a.email === item.email);
    if (existing) {
      assert.ok(account?.id === existing.id && account?.password, 'Existing demo account has no matching local credentials; no reset performed');
      const membership = await db.query('select 1 from public.clinic_memberships where clinic_id=$1 and user_id=$2 and role=$3 and active', [clinicId, existing.id, item.role]);
      assert.equal(membership.rowCount, 1, 'Existing role changed; no access expansion performed');
    } else {
      const password = 'Local!' + randomBytes(24).toString('base64url') + '9';
      const response = await fetch(status.API_URL + '/auth/v1/admin/users', { method: 'POST', headers, body: JSON.stringify({ email: item.email, password, email_confirm: true }) });
      assert.equal(response.ok, true, 'Synthetic Auth account creation failed');
      const user = await response.json();
      account = { ...item, id: user.id, password };
      saved.accounts = [...saved.accounts.filter(a => a.email !== item.email), account];
      mkdirSync('.local', { recursive: true }); writeFileSync(accessPath, JSON.stringify(saved, null, 2));
      await db.query('begin');
      try {
        await db.query('insert into public.profiles(user_id,display_name) values($1,$2)', [user.id, item.name]);
        await db.query('insert into public.clinic_memberships(clinic_id,user_id,role,active) values($1,$2,$3,true)', [clinicId, user.id, item.role]);
        await db.query('commit');
      } catch (error) { await db.query('rollback'); throw error; }
    }
  }
  await db.query('begin');
  try {
    await db.query('update private.patient_documents_settings set enabled=true,api_gate_key=$1 where singleton', [key]);
    await db.query('select private.seed_patient_document_templates($1)', [clinicId]);
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; }
  const set = (name, value) => { const pattern = new RegExp('^' + name + '=.*$', 'm'); env = pattern.test(env) ? env.replace(pattern, name + '=' + value) : env + '\n' + name + '=' + value + '\n'; };
  set('LOCAL_PATIENT_DOCUMENTS_GATE_KEY', key); set('ENABLE_LOCAL_PATIENT_DOCUMENTS', 'true'); set('SUPABASE_SERVICE_ROLE_KEY', status.SERVICE_ROLE_KEY);
  writeFileSync(envPath, env);
  console.log('Local document gate and blank templates enabled. Dedicated fictitious dentist/assistant accounts stored in .local/document-demo-access.json. Existing owner roles/passwords unchanged. Restart local API to load flags.');
} finally { await db.end(); }
