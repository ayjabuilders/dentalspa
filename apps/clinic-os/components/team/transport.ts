import { TeamRosterSchema, type TeamRoster } from '@dental/contracts';
export type TeamFailure = 'expired' | 'denied' | 'offline' | 'unavailable';
export class TeamError extends Error { constructor(public kind: TeamFailure) { super(kind); } }
export interface TeamTransport {
  mode: 'demo' | 'connected';
  roster(signal?: AbortSignal): Promise<TeamRoster>;
  onDispose(listener: () => void): () => void;
  dispose(): void;
}
function lifecycle() {
  let closed = false; const listeners = new Set<() => void>();
  return { get closed() { return closed; }, onDispose(listener: () => void) { if (closed) listener(); else listeners.add(listener); return () => { listeners.delete(listener); }; }, dispose() { if (closed) return; closed = true; listeners.forEach(listener => listener()); listeners.clear(); } };
}
export function createTeamTransport(options: { api: string; token: string; clinicId: string; fetcher?: typeof fetch }): TeamTransport {
  const { api, clinicId } = options;
  let token: string | null = options.token; const life = lifecycle(); const controllers = new Set<AbortController>();
  const fetcher = options.fetcher ?? fetch;
  return {
    mode: 'connected', onDispose: life.onDispose,
    async roster(signal) {
      if (!token || life.closed) throw new TeamError('expired');
      const controller = new AbortController(); controllers.add(controller);
      try {
        const response = await fetcher(`${api.replace(/\/$/, '')}/api/v1/team/roster`, { method: 'GET', cache: 'no-store', credentials: 'omit', headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
        if (!token) throw new TeamError('expired');
        if (!response.ok) throw new TeamError(response.status === 401 ? 'expired' : response.status === 403 ? 'denied' : 'unavailable');
        const parsed = TeamRosterSchema.safeParse(await response.json());
        if (!token) throw new TeamError('expired');
        if (!parsed.success || parsed.data.members.some(member => member.clinic_id !== clinicId)) throw new TeamError('unavailable');
        return parsed.data;
      } catch (error) {
        if (!token) throw new TeamError('expired');
        if (error instanceof TeamError) throw error;
        throw new TeamError(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unavailable');
      } finally { controllers.delete(controller); }
    },
    dispose() { token = null; controllers.forEach(controller => controller.abort()); controllers.clear(); life.dispose(); },
  };
}
export function createDemoTeamTransport(): TeamTransport {
  const life = lifecycle();
  return {
    mode: 'demo', onDispose: life.onDispose, dispose: life.dispose,
    async roster(signal) {
      signal?.throwIfAborted(); if (life.closed) throw new TeamError('expired');
      return TeamRosterSchema.parse({ observed_at: new Date().toISOString(), truncated: false, members: [
        { user_id: '10000000-0000-4000-8000-000000000011', clinic_id: '10000000-0000-4000-8000-000000000001', display_name: 'Adam Exemple', roles: ['manager'] },
        { user_id: '10000000-0000-4000-8000-000000000012', clinic_id: '10000000-0000-4000-8000-000000000001', display_name: 'Lina Exemple', roles: ['assistant', 'reception'] },
        { user_id: '10000000-0000-4000-8000-000000000013', clinic_id: '10000000-0000-4000-8000-000000000001', display_name: 'Nora Exemple', roles: ['dentist', 'manager'] },
        { user_id: '10000000-0000-4000-8000-000000000014', clinic_id: '10000000-0000-4000-8000-000000000001', display_name: 'Yanis Exemple', roles: ['reception'] },
      ] });
    },
  };
}
