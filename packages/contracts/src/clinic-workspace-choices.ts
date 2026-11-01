import { z } from 'zod';

const WorkspaceRoleSchema = z.enum(['dentist', 'reception', 'assistant', 'manager']);
const canonicalRoles = ['assistant', 'dentist', 'manager', 'reception'] as const;

export const ClinicWorkspaceChoiceSchema = z.object({
  clinic_id: z.uuid(),
  clinic_name: z.string().min(1).max(120),
  roles: z.array(WorkspaceRoleSchema).min(1).max(4).refine(
    roles => roles.every((role, index) => index === 0 || canonicalRoles.indexOf(roles[index - 1]!) < canonicalRoles.indexOf(role)),
    'Roles must be unique and in canonical order',
  ),
}).strict();

export const ClinicWorkspaceChoicesSchema = z.object({
  items: z.array(ClinicWorkspaceChoiceSchema).max(100)
    .refine(items => new Set(items.map(item => item.clinic_id.toLowerCase())).size === items.length),
}).strict();

export type ClinicWorkspaceChoice = z.infer<typeof ClinicWorkspaceChoiceSchema>;
export type ClinicWorkspaceChoices = z.infer<typeof ClinicWorkspaceChoicesSchema>;
