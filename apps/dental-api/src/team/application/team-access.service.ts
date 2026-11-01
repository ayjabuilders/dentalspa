import { createHmac } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CreateTeamAccessMemberSchema, TeamAccessListSchema, TeamAccessReceiptSchema, UpdateTeamAccessMemberSchema } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';
import { scopedClient } from '../../identity/infrastructure/supabase.js';
import { supabaseAdminKey } from '../../identity/infrastructure/supabase-admin-key.js';
import { teamActivationKey } from '../../identity/infrastructure/module-activation.js';
import { LOCAL_TEAM_AUTH_ADMIN, type LocalTeamAuthAdmin } from '../domain/local-auth-admin.js';

const CLINICAL_ROLE_NOTICE = 'Clinical roles grant application access only; they do not verify professional qualifications.' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[0-9a-f-]{36}$/i;

@Injectable()
export class TeamAccessService {
  constructor(@Inject(LOCAL_TEAM_AUTH_ADMIN) private readonly authAdmin: LocalTeamAuthAdmin) {}
  private gateKey() {
    const gate = teamActivationKey();
    if (!gate || !supabaseAdminKey()) throw new ServiceUnavailableException('Team access unavailable');
    return gate;
  }
  private authorize(actor: Actor) {
    this.gateKey();
    if (!actor.roles.includes('manager')) throw new ForbiddenException('Manager access required');
  }
  private async rpc(actor: Actor, name: string, params: Record<string, unknown>) {
    let result;
    try { result = await scopedClient(actor.token).rpc(name, params, { get: false, head: false }); }
    catch { throw new ServiceUnavailableException('Team access unavailable'); }
    if (result.error) {
      if (['28000', 'PGRST301', 'PGRST302'].includes(result.error.code)) throw new ServiceUnavailableException('Authentication required');
      if (result.error.code === '42501') throw new ForbiddenException('Team access denied');
      if (result.error.code === 'P0002') throw new NotFoundException('Team member unavailable');
      if (['23505', '23514', '40001', 'PT409'].includes(result.error.code)) throw new ConflictException('Team access changed or request conflicted');
      if (['22023', '22P02'].includes(result.error.code)) throw new BadRequestException('Invalid team access request');
      throw new ServiceUnavailableException('Team access unavailable');
    }
    return result.data;
  }
  async list(actor: Actor, query?: string, cursor?: string) {
    this.authorize(actor);
    if (query !== undefined && (typeof query !== 'string' || query.trim() !== query || query.length > 100)) throw new BadRequestException('Invalid team search');
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 300 || !CURSOR.test(cursor))) throw new BadRequestException('Invalid team cursor');
    const data = await this.rpc(actor, 'list_team_access_members', { p_clinic_id: actor.clinicId, p_query: query ?? null, p_cursor: cursor ?? null, p_gate: this.gateKey() });
    const parsed = TeamAccessListSchema.safeParse(data);
    if (!parsed.success || parsed.data.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || parsed.data.current_user_id.toLowerCase() !== actor.userId.toLowerCase() || new Set(parsed.data.items.map(item => item.user_id.toLowerCase())).size !== parsed.data.items.length) throw new ServiceUnavailableException('Team access unavailable');
    return parsed.data;
  }
  private async findProvisioned(email: string, reservationId: string) {
    for (let page = 1; page <= 100; page++) {
      let result;
      try { result = await this.authAdmin.listUsers(page, 1000); }
      catch { throw new ServiceUnavailableException('Local account reconciliation unavailable'); }
      if (result.error) throw new ServiceUnavailableException('Local account reconciliation unavailable');
      const found = result.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        if (found.app_metadata?.local_team_provisioning_id !== reservationId) throw new ConflictException('An Auth account with this email already exists');
        return found;
      }
      if (result.users.length < 1000) return null;
    }
    throw new ServiceUnavailableException('Local account reconciliation limit reached');
  }
  async create(actor: Actor, body: unknown, requestKey: string) {
    this.authorize(actor);
    if (!UUID.test(requestKey)) throw new BadRequestException('Invalid idempotency key');
    const parsed = CreateTeamAccessMemberSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid team member');
    const gate = this.gateKey(), value = parsed.data, email = value.email.toLowerCase();
    if (new Set(value.roles).size !== value.roles.length || Buffer.byteLength(value.temporary_password, 'utf8') > 72) throw new BadRequestException('Invalid team member');
    const fingerprint = createHmac('sha256', gate).update(JSON.stringify({ display_name: value.display_name, email, roles: [...value.roles].sort(), temporary_password: value.temporary_password })).digest('hex');
    const reservation = await this.rpc(actor, 'reserve_local_team_member', {
      p_clinic_id: actor.clinicId, p_email: email, p_fingerprint: fingerprint,
      p_display_name: value.display_name, p_roles: value.roles, p_request_key: requestKey, p_gate: gate,
    }) as { reservation_id?: unknown; auth_user_id?: unknown; completed?: unknown };
    if (!reservation || typeof reservation !== 'object' || typeof reservation.reservation_id !== 'string' || !UUID.test(reservation.reservation_id) || typeof reservation.completed !== 'boolean') throw new ServiceUnavailableException('Team reservation unavailable');
    const reservationId = reservation.reservation_id;
    let user;
    try {
      user = await this.findProvisioned(email, reservationId);
      if (!user) {
        let result;
        try {
          result = await this.authAdmin.createUser({
            email,
            password: value.temporary_password,
            email_confirm: true,
            app_metadata: { local_team_provisioning_id: reservationId },
          });
        } catch {
          // Auth Admin may have committed before a transport failure. Keep the
          // reservation and retry marker reconciliation; never delete unknown state.
          user = await this.findProvisioned(email, reservationId);
          if (!user) throw new ServiceUnavailableException('Local account creation outcome is uncertain; retry the same request key');
        }
        if (result?.error) {
          user = await this.findProvisioned(email, reservationId);
          if (!user) {
            if (result.error.status !== undefined && result.error.status >= 400 && result.error.status < 500) {
              // A duplicate response could be our first Auth call after a lost
              // reply. Keep the reservation unless reconciliation proves the
              // identity has a different provisioning marker.
              if (/already (?:registered|exists|been registered)/i.test(result.error.message)) throw new ServiceUnavailableException('Local account outcome is uncertain; retry the same request key');
              await this.rpc(actor, 'release_foreign_local_team_member_reservation', { p_clinic_id: actor.clinicId, p_reservation_id: reservationId, p_request_key: requestKey, p_gate: gate }).catch(() => undefined);
              throw new BadRequestException('Local Auth rejected the account details');
            }
            throw new ServiceUnavailableException('Local account creation failed');
          }
        } else if (result?.user) user = result.user;
      }
    } catch (error) {
      if (error instanceof ConflictException) await this.rpc(actor, 'release_foreign_local_team_member_reservation', { p_clinic_id: actor.clinicId, p_reservation_id: reservationId, p_request_key: requestKey, p_gate: gate }).catch(() => undefined);
      throw error;
    }
    if (!user?.id || !UUID.test(user.id)) throw new ServiceUnavailableException('Local account creation outcome is uncertain; retry the same request key');
    const raw = await this.rpc(actor, 'finalize_local_team_member', { p_clinic_id: actor.clinicId, p_reservation_id: reservationId, p_auth_user_id: user.id, p_request_key: requestKey, p_gate: gate });
    const data = raw && typeof raw === 'object' && 'receipt' in raw ? (raw as { receipt: unknown }).receipt : null;
    const response = raw && typeof raw === 'object' && 'replayed' in raw ? raw as { replayed: unknown } : null;
    const receipt = TeamAccessReceiptSchema.safeParse(data);
    if (!receipt.success || !response || typeof response.replayed !== 'boolean' || receipt.data.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || receipt.data.member.user_id.toLowerCase() !== user.id.toLowerCase()) throw new ServiceUnavailableException('Team member receipt unavailable');
    return { ...receipt.data, replayed: response.replayed, clinical_role_notice: CLINICAL_ROLE_NOTICE };
  }
  async update(actor: Actor, userId: string, body: unknown, requestKey: string) {
    this.authorize(actor);
    if (!UUID.test(userId) || !UUID.test(requestKey)) throw new BadRequestException('Invalid team update');
    if (userId.toLowerCase() === actor.userId.toLowerCase()) throw new ForbiddenException('Managers cannot change their own access');
    const parsed = UpdateTeamAccessMemberSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid team update');
    const gate = this.gateKey(), payload = parsed.data;
    if (new Set(payload.roles).size !== payload.roles.length) throw new BadRequestException('Invalid team update');
    const fingerprint = createHmac('sha256', gate).update(JSON.stringify({ user_id: userId.toLowerCase(), expected_version: payload.expected_version, roles: [...payload.roles].sort(), active: payload.active })).digest('hex');
    const raw = await this.rpc(actor, 'update_team_access_member', {
      p_clinic_id: actor.clinicId, p_target_user_id: userId, p_expected_version: payload.expected_version,
      p_roles: payload.roles, p_active: payload.active, p_request_key: requestKey, p_fingerprint: fingerprint, p_gate: gate,
    });
    if (!raw || typeof raw !== 'object' || !('receipt' in raw) || !('replayed' in raw)) throw new ServiceUnavailableException('Team access receipt unavailable');
    const result = raw as { receipt: unknown; replayed: unknown }, receipt = TeamAccessReceiptSchema.safeParse(result.receipt);
    if (!receipt.success || typeof result.replayed !== 'boolean' || receipt.data.clinic_id.toLowerCase() !== actor.clinicId.toLowerCase() || receipt.data.member.user_id.toLowerCase() !== userId.toLowerCase()) throw new ServiceUnavailableException('Team access receipt unavailable');
    return { ...receipt.data, replayed: result.replayed, clinical_role_notice: CLINICAL_ROLE_NOTICE };
  }
}
