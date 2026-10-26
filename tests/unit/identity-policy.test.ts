import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PolicyGuard } from '../../apps/dental-api/src/identity/presentation/policy.guard';
import type { IdentityPort } from '../../apps/dental-api/src/identity/domain/access';

describe('runtime route policy declaration', () => {
  it.each([undefined, 'authenticated', 'Staff', 'admin', ''])('fails closed for unsupported policy %s before identity lookup', async rule => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(rule);
    const identity: IdentityPort = { verify: vi.fn(), memberships: vi.fn(), patientLinks: vi.fn() };
    const context = { getHandler: () => () => undefined, getClass: () => class {} } as unknown as ExecutionContext;
    await expect(new PolicyGuard(reflector, identity).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(identity.verify).not.toHaveBeenCalled();
  });
});
