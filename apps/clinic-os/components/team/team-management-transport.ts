import { TeamAccessListSchema, TeamAccessReceiptSchema, CreateTeamAccessMemberSchema, UpdateTeamAccessMemberSchema, type CreateTeamAccessMember, type UpdateTeamAccessMember } from '@dental/contracts';
import { sessionFetch } from '../../lib/renewing-session';

export type TeamManagementList = ReturnType<typeof TeamAccessListSchema.parse>;
export type TeamManagementFailure = 'denied' | 'expired' | 'offline' | 'unavailable' | 'invalid' | 'conflict' | 'uncertain';
export class TeamManagementError extends Error { constructor(public readonly kind: TeamManagementFailure) { super(kind); } }
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function sameTeamRoles(a: readonly string[], b: readonly string[]) { return a.length === b.length && [...a].sort().every((role, index) => role === [...b].sort()[index]); }
export function validTemporaryTeamPassword(value: string) { return value.length >= 12 && value.length <= 72 && new TextEncoder().encode(value).length <= 72; }

/** No credentials are retained here. The form owns the single in-memory command until its result is known. */
export function createTeamManagementTransport(options: { api: string; token: string; clinicId: string; currentUserId?: string; onSessionExpired: () => void; onAccessDenied?: () => void; fetcher?: typeof globalThis.fetch }) {
  const fetcher = options.fetcher ?? sessionFetch, base = options.api.replace(/\/$/, '') + '/api/v1/team/access/members';
  async function request(path: string, init: RequestInit | undefined, signal?: AbortSignal): Promise<unknown> {
    const mutation = !!init?.method && init.method !== 'GET';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TeamManagementError('offline');
    try {
      const response = await fetcher(base + path, { ...init, headers: { Authorization: 'Bearer ' + options.token, 'X-Clinic-Id': options.clinicId, ...init?.headers }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20000)]) });
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (response.status === 401) { options.onSessionExpired(); throw new TeamManagementError('expired'); }
      if (response.status === 403 || response.status === 404) { options.onAccessDenied?.(); throw new TeamManagementError('denied'); }
      if (response.status === 409) throw new TeamManagementError('conflict');
      if ([400, 422].includes(response.status)) throw new TeamManagementError('invalid');
      if (!response.ok) throw new TeamManagementError(mutation ? 'uncertain' : 'unavailable');
      const result: unknown = await response.json(); if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); return result;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (error instanceof TeamManagementError) throw error;
      throw new TeamManagementError(mutation ? 'uncertain' : typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unavailable');
    }
  }
  const command = (method: string, key: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
  return {
    async list(query: string, cursor: string | null, signal?: AbortSignal) {
      const params = new URLSearchParams(); if (query.trim()) params.set('q', query.trim()); if (cursor) params.set('cursor', cursor);
      const parsed = TeamAccessListSchema.safeParse(await request(params.size ? '?' + params.toString() : '', undefined, signal));
      if (!parsed.success || !same(parsed.data.clinic_id, options.clinicId) || (options.currentUserId && !same(parsed.data.current_user_id, options.currentUserId)) || parsed.data.items.length > 10 || new Set(parsed.data.items.map(item => item.user_id.toLowerCase())).size !== parsed.data.items.length) throw new TeamManagementError('unavailable');
      return parsed.data;
    },
    async create(input: CreateTeamAccessMember, key: string, signal?: AbortSignal) {
      const body = CreateTeamAccessMemberSchema.safeParse(input); if (!body.success || !validTemporaryTeamPassword(body.data.temporary_password)) throw new TeamManagementError('invalid');
      const parsed = TeamAccessReceiptSchema.safeParse(await request('', command('POST', key, body.data), signal));
      if (!parsed.success || !same(parsed.data.clinic_id, options.clinicId) || parsed.data.member.display_name !== body.data.display_name || parsed.data.member.email.toLowerCase() !== body.data.email.toLowerCase() || !sameTeamRoles(parsed.data.member.roles, body.data.roles) || !parsed.data.member.active || parsed.data.member.version !== 1) throw new TeamManagementError('uncertain');
      return parsed.data.member;
    },
    async update(userId: string, input: UpdateTeamAccessMember, key: string, signal?: AbortSignal) {
      const body = UpdateTeamAccessMemberSchema.safeParse(input); if (!body.success) throw new TeamManagementError('invalid');
      const parsed = TeamAccessReceiptSchema.safeParse(await request('/' + encodeURIComponent(userId), command('PATCH', key, body.data), signal));
      if (!parsed.success || !same(parsed.data.clinic_id, options.clinicId) || !same(parsed.data.member.user_id, userId) || parsed.data.member.version !== body.data.expected_version + 1 || parsed.data.member.active !== body.data.active || !sameTeamRoles(parsed.data.member.roles, body.data.roles)) throw new TeamManagementError('uncertain');
      return parsed.data.member;
    },
  };
}
export type TeamManagementTransport = ReturnType<typeof createTeamManagementTransport>;
export const teamManagementMessages: Record<TeamManagementFailure, string> = {
  denied: 'La gestion de l’équipe n’est pas autorisée pour cette session. Les informations ont été retirées.',
  expired: 'Session expirée. Connectez-vous à nouveau.', offline: 'Hors connexion. Retrouvez le réseau pour consulter ou gérer l’équipe.',
  unavailable: 'L’équipe n’a pas pu être vérifiée. Réessayez.', invalid: 'Vérifiez le nom, l’adresse e-mail, le mot de passe temporaire et les rôles sélectionnés.',
  conflict: 'Les informations ou droits d’accès ont changé, ou cette modification est refusée. Actualisez avant de réessayer.',
  uncertain: 'Résultat à vérifier : la modification peut être enregistrée. Réessayez exactement la même opération.',
};
