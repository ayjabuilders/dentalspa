import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const verifierPath = resolve(repoRoot, 'apps/dental-api/scripts/verify-hosted-dev.mjs');

describe('hosted verifier credential gate', () => {
  it('exits before hosted requests when the server-only key is missing', () => {
    const env = {
      ...process.env,
      SUPABASE_URL: 'https://giufpdppsunryyhfnzps.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_test-placeholder',
      SUPABASE_SECRET_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    };
    const result = spawnSync(process.execPath, [verifierPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
      timeout: 5_000,
    });

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 2, output);
    assert.match(output, /Missing required local variables: SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY\./);
    assert.doesNotMatch(output, /Hosted verification passed|temporary fixture cleanup|PASS /);
  });

  it('refuses to run against any Supabase project other than the pinned dev project', () => {
    const env = {
      ...process.env,
      SUPABASE_URL: 'https://other-project.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_test-placeholder',
      SUPABASE_SECRET_KEY: 'sb_secret_test-placeholder',
      SUPABASE_SERVICE_ROLE_KEY: '',
    };
    const result = spawnSync(process.execPath, [verifierPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
      timeout: 5_000,
    });

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 2, output);
    assert.match(output, /Refusing to run: this verifier is restricted to Supabase project giufpdppsunryyhfnzps\./);
    assert.doesNotMatch(output, /Hosted verification passed|temporary fixture cleanup|PASS /);
  });
});
