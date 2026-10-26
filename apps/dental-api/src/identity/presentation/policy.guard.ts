import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { z } from 'zod';
import { IDENTITY, resolveActor, type Actor, type IdentityPort } from '../domain/access';

export type AccessRule = 'public' | 'staff' | 'patient';
export const Access = (rule: AccessRule) => SetMetadata('access', rule);
export type AuthorizedRequest = Request & { actor: Actor; correlationId: string };
@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(IDENTITY) private readonly identity: IdentityPort) {}
  async canActivate(context: ExecutionContext) {
    const rule = this.reflector.getAllAndOverride<AccessRule>('access', [context.getHandler(), context.getClass()]);
    if (rule === 'public') return true;
    // Runtime metadata can outlive or bypass the TypeScript union. Unknown rules
    // must never fall through to an authenticated-but-unrestricted endpoint.
    if (rule !== 'staff' && rule !== 'patient') throw new ForbiddenException('No supported access policy');
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const bearer = request.headers.authorization;
    if (!bearer || !/^Bearer \S+$/.test(bearer)) throw new UnauthorizedException();
    const token = bearer.slice(7);
    const userId = await this.identity.verify(token);
    if (!userId || !z.string().uuid().safeParse(userId).success) throw new UnauthorizedException();
    const clinicId = request.headers['x-clinic-id'];
    if (typeof clinicId !== 'string' || !z.string().uuid().safeParse(clinicId).success) throw new ForbiddenException('Select an authorized clinic');
    const [memberships, links] = await Promise.all([this.identity.memberships(token, userId), this.identity.patientLinks(token, userId)]);
    const actor = resolveActor(userId, token, clinicId, memberships, links);
    if (!actor || (rule === 'staff' && !actor.roles.length) || (rule === 'patient' && !actor.patientId)) throw new ForbiddenException('Scope denied');
    request.actor = actor;
    return true;
  }
}
