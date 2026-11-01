import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const password = process.env.LOCAL_DEMO_PASSWORD || `Mvp!${randomBytes(18).toString('base64url')}9`;
const users = [
  { email: 'ghita.bennani@dentalspa.test', name: 'Ghita Bennani' },
  { email: 'youssef.elidrissi@dentalspa.test', name: 'Youssef El Idrissi' },
];
const memberships = [
  { userIndex: 0, clinicId: '10000000-0000-4000-8000-000000000001', role: 'reception' },
  { userIndex: 1, clinicId: '10000000-0000-4000-8000-000000000001', role: 'manager' },
  { userIndex: 1, clinicId: '10000000-0000-4000-8000-000000000002', role: 'manager' },
];

function ensureLocalBookingGateKey() {
  const apiEnvPath = join(process.cwd(), 'apps', 'dental-api', '.env.local');
  let contents = existsSync(apiEnvPath) ? readFileSync(apiEnvPath, 'utf8') : '';
  const existing = contents.match(/^DEMO_BOOKING_DATABASE_GATE_KEY=(.*)$/m)?.[1]?.trim();
  const gateKey = existing || randomBytes(32).toString('base64url');
  if (!/^[A-Za-z0-9_-]{40,}$/.test(gateKey)) throw new Error('Local booking gate configuration is invalid.');
  if (!existing) {
    contents += `${contents && !contents.endsWith('\n') ? '\n' : ''}DEMO_BOOKING_DATABASE_GATE_KEY=${gateKey}\n`;
    writeFileSync(apiEnvPath, contents, 'utf8');
  }
  return gateKey;
}

function ensureLocalBookingConfirmationGateKey() {
  const apiEnvPath = join(process.cwd(), 'apps', 'dental-api', '.env.local');
  let contents = existsSync(apiEnvPath) ? readFileSync(apiEnvPath, 'utf8') : '';
  const existing = contents.match(/^DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY=(.*)$/m)?.[1]?.trim();
  const gateKey = existing || randomBytes(32).toString('base64url');
  if (!/^[A-Za-z0-9_-]{40,}$/.test(gateKey)) throw new Error('Local booking-confirmation gate configuration is invalid.');
  const set = (source, name, value) => {
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    if (pattern.test(source)) return source.replace(pattern, `${name}=${value}`);
    return `${source}${source && !source.endsWith('\n') ? '\n' : ''}${name}=${value}\n`;
  };
  const updated = set(set(contents, 'DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY', gateKey), 'ENABLE_DEMO_BOOKING_CONFIRMATIONS', 'true');
  if (updated !== contents) writeFileSync(apiEnvPath, updated, 'utf8');
  return gateKey;
}

function runStatus() {
  if (process.platform === 'win32') {
    const dockerDirectory = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin');
    process.env.PATH = `${dockerDirectory};${process.env.PATH ?? ''}`;
  }
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm exec supabase status -o json'], { encoding: 'utf8', windowsHide: true })
    : spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Could not read local Supabase status. Start the local stack first.');
  try { return JSON.parse(result.stdout); } catch { throw new Error('Local Supabase did not return status JSON.'); }
}

async function ensureUser(apiUrl, adminHeaders, user) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users?page=1&per_page=100`, { headers: adminHeaders });
  if (!response.ok) throw new Error('Local Auth user lookup failed.');
  const result = await response.json();
  const existing = result.users?.find(item => item.email === user.email);
  const body = { email: user.email, password, email_confirm: true, user_metadata: { full_name: user.name } };
  const saved = await fetch(existing
    ? `${apiUrl}/auth/v1/admin/users/${encodeURIComponent(existing.id)}`
    : `${apiUrl}/auth/v1/admin/users`, {
    method: existing ? 'PUT' : 'POST', headers: { ...adminHeaders, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!saved.ok) throw new Error('Could not create or reset a local synthetic demo user.');
  const account = await saved.json();
  if (!account.id) throw new Error('Local Auth returned no user id.');
  return account.id;
}

async function main() {
  const status = runStatus();
  const apiUrl = new URL(status.API_URL);
  if (apiUrl.protocol !== 'http:' || apiUrl.hostname !== '127.0.0.1') {
    throw new Error('Refusing to manage users outside the local 127.0.0.1 Supabase stack.');
  }
  const adminKey = status.SERVICE_ROLE_KEY;
  if (typeof adminKey !== 'string' || adminKey.length < 20) throw new Error('Local Auth admin key is unavailable.');
  const adminHeaders = { apikey: adminKey, authorization: `Bearer ${adminKey}` };
  const bookingGateKey = ensureLocalBookingGateKey();
  const bookingConfirmationGateKey = ensureLocalBookingConfirmationGateKey();
  const userIds = [];
  for (const user of users) userIds.push(await ensureUser(apiUrl.origin, adminHeaders, user));

  const profileValues = users.map((user, index) => {
    if (!/^[0-9a-f-]{36}$/i.test(userIds[index])) throw new Error('Unexpected local Auth user id.');
    return `('${userIds[index]}','${user.name}')`;
  }).join(',');
  const membershipValues = memberships.map(membership => {
    const userId = userIds[membership.userIndex];
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Unexpected local Auth user id.');
    return `('${membership.clinicId}','${userId}','${membership.role}',true)`;
  }).join(',');
  const sql = `insert into public.profiles(user_id,display_name) values ${profileValues} on conflict (user_id) do update set display_name=excluded.display_name; insert into public.clinic_memberships(clinic_id,user_id,role,active) values ${membershipValues} on conflict (clinic_id,user_id,role) do update set active=true; insert into private.demo_booking_sample_resources(id,clinic_id,kind,display_name) values ('73000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','provider','Praticien·ne démo A'),('73000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','provider','Praticien·ne démo B'),('73000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','chair','Fauteuil démo A'),('73000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','chair','Fauteuil démo B') on conflict (id) do update set clinic_id=excluded.clinic_id,kind=excluded.kind,display_name=excluded.display_name,active=true; update private.intake_command_settings set enabled=true where singleton=true; update private.demo_booking_request_settings set enabled=true,api_gate_key='${bookingGateKey}' where singleton=true; update private.demo_booking_confirmation_settings set enabled=true,api_gate_key='${bookingConfirmationGateKey}' where singleton=true;`;

  const dockerCandidates = process.platform === 'win32'
    ? [join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'), 'docker.exe']
    : ['docker'];
  const docker = dockerCandidates.find(candidate => candidate.includes('/') || candidate.includes('\\') ? existsSync(candidate) : true);
  if (!docker) throw new Error('Docker CLI was not found. Start Docker Desktop and retry.');
  try {
    execFileSync(docker, ['exec', 'supabase_db_Dental_Spa', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('Could not assign the local demo clinic memberships.');
  }
  console.log('Local-only synthetic Clinic OS accounts are ready:');
  console.log(`  ${users[0].email} — Réception — fictional clinic Atlas / Casablanca`);
  console.log(`  ${users[1].email} — Gestionnaire — fictional clinics Atlas / Casablanca and Sourire / Salé`);
  console.log(`  Shared local demo password: ${password}`);
  console.log('This helper refuses non-loopback Supabase URLs. The service key is used only in memory for local account setup.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Local demo account setup failed.');
  process.exitCode = 1;
});
