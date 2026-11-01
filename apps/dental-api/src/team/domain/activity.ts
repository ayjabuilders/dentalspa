import type { TeamActivity } from '@dental/contracts';
import type { Actor } from '../../identity/domain/access.js';
export const TEAM_ACTIVITY_REPOSITORY=Symbol('TEAM_ACTIVITY_REPOSITORY');
export interface TeamActivityRepository { list(actor:Actor):Promise<TeamActivity> }
