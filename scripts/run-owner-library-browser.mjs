import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const accounts = JSON.parse(readFileSync('.local/document-demo-access.json', 'utf8'));
const owner = JSON.parse(readFileSync('.local/owner-demo-access.json', 'utf8'));
const env = { ...process.env, LOCAL_DOCUMENT_API: 'http://127.0.0.1:4300', LOCAL_DOCUMENT_PATIENT_ID: '20000000-0000-4000-8000-000000000001' };
for (const account of accounts.accounts) {
  env[`LOCAL_DOCUMENT_${account.role.toUpperCase()}_EMAIL`] = account.email;
  env[`LOCAL_DOCUMENT_${account.role.toUpperCase()}_PASSWORD`] = account.password;
}
env.LOCAL_DOCUMENT_MANAGER_EMAIL = owner.email;
env.LOCAL_DOCUMENT_MANAGER_PASSWORD = owner.password;
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'tests/e2e/patient-document-library.config.ts', ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
