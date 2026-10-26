import type { TeamRoster } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access';
export const TEAM_ROSTER_REPOSITORY=Symbol('TEAM_ROSTER_REPOSITORY');
export interface TeamRosterRepository { list(actor:Actor):Promise<TeamRoster> }
