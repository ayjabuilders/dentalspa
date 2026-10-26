import { z } from 'zod';

// Keep the four access roles aligned with the foundation membership contract.
export const TeamRosterRoleSchema = z.enum(['dentist', 'reception', 'assistant', 'manager']);
const canonicalRoles = ['assistant', 'dentist', 'manager', 'reception'] as const;

export const TeamRosterMemberSchema = z.object({
  user_id: z.uuid(),
  clinic_id: z.uuid(),
  display_name: z.string().min(1).max(120),
  roles: z.array(TeamRosterRoleSchema).min(1).max(4).refine(
    roles => roles.every((role, index) => index === 0 || canonicalRoles.indexOf(roles[index - 1]!) < canonicalRoles.indexOf(role)),
    'Roles must be unique and in canonical order',
  ),
}).strict();
export type TeamRosterMember = z.infer<typeof TeamRosterMemberSchema>;

export const TeamRosterSchema = z.object({
  observed_at: z.iso.datetime({ offset: true }),
  members: z.array(TeamRosterMemberSchema).max(100),
  truncated: z.boolean(),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  for (const [index, member] of value.members.entries()) {
    if (seen.has(member.user_id)) context.addIssue({ code: 'custom', message: 'Duplicate roster member', path: ['members', index, 'user_id'] });
    seen.add(member.user_id);
  }
});
export type TeamRoster = z.infer<typeof TeamRosterSchema>;
