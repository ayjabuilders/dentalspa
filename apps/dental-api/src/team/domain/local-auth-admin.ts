export type LocalTeamAuthUser = { id: string; email?: string; app_metadata?: Record<string, unknown> };
export type LocalTeamAuthAdmin = {
  listUsers(page: number, perPage: number): Promise<{ users: LocalTeamAuthUser[]; error: boolean }>;
  createUser(input: { email: string; password: string; email_confirm: true; app_metadata: Record<string, string> }): Promise<{ user: LocalTeamAuthUser | null; error?: { message: string; status?: number } }>;
};
export const LOCAL_TEAM_AUTH_ADMIN = Symbol('LOCAL_TEAM_AUTH_ADMIN');
