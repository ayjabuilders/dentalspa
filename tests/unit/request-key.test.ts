import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createRequestKey } from '../../apps/clinic-os/lib/request-key';
import { ownerAssignmentAttempt } from '../../apps/clinic-os/components/intake/transport';

afterEach(() => vi.unstubAllGlobals());
describe('command keys on local HTTP', () => {
  it('uses secure random values even when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const keys = Array.from({ length: 100 }, createRequestKey);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('does not substitute weak randomness when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', {});
    expect(createRequestKey).toThrow();
  });
  it('retains the same intake assignment key for retries on HTTP, but not a different command', () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const inquiry = '20000000-0000-4000-8000-000000000001';
    const body = { expected_owner_user_id: '10000000-0000-4000-8000-000000000010', owner_user_id: '10000000-0000-4000-8000-000000000011' };
    const first = ownerAssignmentAttempt(null, inquiry, body);
    expect(ownerAssignmentAttempt(first, inquiry, body)).toBe(first);
    const changed = ownerAssignmentAttempt(first, inquiry, { ...body, owner_user_id: '10000000-0000-4000-8000-000000000012' });
    expect(changed.key).not.toBe(first.key);
  });
});
