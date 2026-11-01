import { z } from 'zod';

export const TeamAccessRoleSchema = z.enum(['dentist', 'reception', 'assistant', 'manager']);
const Id = z.uuid();
const Email = z.string().trim().email().max(254);
const Password = z.string().min(12).max(72);
const Roles = z.array(TeamAccessRoleSchema).min(1).max(4);

export const TeamAccessMemberSchema = z.object({
  user_id: Id,
  display_name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  roles: z.array(TeamAccessRoleSchema).max(4),
  active: z.boolean(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
}).strict();

export const TeamAccessListSchema = z.object({
  schema_version: z.literal(1),
  clinic_id: Id,
  current_user_id: Id,
  items: z.array(TeamAccessMemberSchema).max(10),
  next_cursor: z.string().max(300).nullable(),
  clinical_role_notice: z.literal('Clinical roles grant application access only; they do not verify professional qualifications.'),
}).strict();

export const CreateTeamAccessMemberSchema = z.object({
  display_name: z.string().trim().min(1).max(120),
  email: Email,
  temporary_password: Password,
  roles: Roles,
}).strict();

export const UpdateTeamAccessMemberSchema = z.object({
  expected_version: z.number().int().positive(),
  roles: Roles,
  active: z.boolean(),
}).strict();

export const TeamAccessReceiptSchema = z.object({
  clinic_id: Id,
  member: TeamAccessMemberSchema,
  replayed: z.boolean(),
  clinical_role_notice: z.literal('Clinical roles grant application access only; they do not verify professional qualifications.'),
}).strict();

export type TeamAccessMember = z.infer<typeof TeamAccessMemberSchema>;
export type TeamAccessList = z.infer<typeof TeamAccessListSchema>;
export type CreateTeamAccessMember = z.infer<typeof CreateTeamAccessMemberSchema>;
export type UpdateTeamAccessMember = z.infer<typeof UpdateTeamAccessMemberSchema>;
export type TeamAccessReceipt = z.infer<typeof TeamAccessReceiptSchema>;
