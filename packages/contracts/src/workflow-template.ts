import { z } from 'zod';
import { TeamRosterRoleSchema } from './team-roster';

const IdSchema = z.uuid();
const OffsetDateTimeSchema = z.iso.datetime({ offset: true });
const TaskKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

export const WorkflowTemplateStatusSchema = z.enum(['draft', 'approved', 'retired']);

export const WorkflowTaskTemplateSchema = z.object({
  key: TaskKeySchema,
  title: z.string().trim().min(1).max(120),
  assignee_roles: z.array(TeamRosterRoleSchema).min(1).max(4),
  depends_on: z.array(TaskKeySchema).max(100),
  required: z.boolean(),
}).strict();

export const WorkflowTemplateVersionSchema = z.object({
  template_id: IdSchema,
  clinic_id: IdSchema.nullable(),
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  status: WorkflowTemplateStatusSchema,
  created_by: IdSchema,
  created_at: OffsetDateTimeSchema,
  approved_by: IdSchema.nullable(),
  approved_at: OffsetDateTimeSchema.nullable(),
  tasks: z.array(WorkflowTaskTemplateSchema).min(1).max(100),
}).strict().superRefine((template, context) => {
  const taskByKey = new Map<string, (typeof template.tasks)[number]>();
  for (const [index, task] of template.tasks.entries()) {
    if (taskByKey.has(task.key)) {
      context.addIssue({ code: 'custom', path: ['tasks', index, 'key'], message: 'Task keys must be unique within a template version' });
    }
    taskByKey.set(task.key, task);
  }

  for (const [index, task] of template.tasks.entries()) {
    const seenDependencies = new Set<string>();
    for (const dependency of task.depends_on) {
      if (!taskByKey.has(dependency)) {
        context.addIssue({ code: 'custom', path: ['tasks', index, 'depends_on'], message: `Unknown task dependency: ${dependency}` });
      }
      if (dependency === task.key) {
        context.addIssue({ code: 'custom', path: ['tasks', index, 'depends_on'], message: 'A task cannot depend on itself' });
      }
      if (seenDependencies.has(dependency)) {
        context.addIssue({ code: 'custom', path: ['tasks', index, 'depends_on'], message: 'Task dependencies must be unique' });
      }
      seenDependencies.add(dependency);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return false;
    if (visited.has(key)) return true;
    const task = taskByKey.get(key);
    if (!task) return true;
    visiting.add(key);
    for (const dependency of task.depends_on) {
      if (taskByKey.has(dependency) && !visit(dependency)) return false;
    }
    visiting.delete(key);
    visited.add(key);
    return true;
  };
  for (const task of template.tasks) {
    if (!visit(task.key)) {
      context.addIssue({ code: 'custom', path: ['tasks'], message: 'Task dependencies must form an acyclic graph' });
      break;
    }
  }

  const hasApprover = template.approved_by !== null;
  const hasApprovalTime = template.approved_at !== null;
  const hasApproval = hasApprover && hasApprovalTime;
  if (hasApprover !== hasApprovalTime) {
    context.addIssue({ code: 'custom', path: ['approved_by'], message: 'Approval actor and time must be set together' });
  }
  if (template.status === 'draft' && (hasApprover || hasApprovalTime || template.clinic_id !== null)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Draft templates must be unapproved shared definitions' });
  }
  if (template.status !== 'draft' && (!hasApproval || template.clinic_id === null)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Approved or retired templates require a clinic and approval record' });
  }
});

export const WorkflowTaskInstanceSchema = z.object({
  key: TaskKeySchema,
  state: z.enum(['planned', 'eligible']),
  assignee_user_id: IdSchema.nullable(),
  performer_user_id: IdSchema.nullable(),
  completed_at: OffsetDateTimeSchema.nullable(),
  version: z.number().int().positive(),
}).strict();

export const WorkflowInstanceSnapshotSchema = z.object({
  instance_id: IdSchema,
  clinic_id: IdSchema,
  template: WorkflowTemplateVersionSchema,
  started_by: IdSchema,
  started_at: OffsetDateTimeSchema,
  tasks: z.array(WorkflowTaskInstanceSchema).max(100),
}).strict().superRefine((instance, context) => {
  if (instance.template.status !== 'approved') {
    context.addIssue({ code: 'custom', path: ['template', 'status'], message: 'Only an approved template version can start an instance' });
  }
  if (instance.template.clinic_id !== instance.clinic_id) {
    context.addIssue({ code: 'custom', path: ['template', 'clinic_id'], message: 'Template and instance clinic must match' });
  }
  const definitionKeys = new Set(instance.template.tasks.map(task => task.key));
  const instanceKeys = new Set(instance.tasks.map(task => task.key));
  if (definitionKeys.size !== instanceKeys.size || [...definitionKeys].some(key => !instanceKeys.has(key))) {
    context.addIssue({ code: 'custom', path: ['tasks'], message: 'Instance tasks must match the pinned template version' });
    return;
  }
  for (const task of instance.tasks) {
    const definition = instance.template.tasks.find(item => item.key === task.key)!;
    const expectedState = definition.depends_on.length === 0 ? 'eligible' : 'planned';
    if (task.state !== expectedState || task.assignee_user_id !== null || task.performer_user_id !== null || task.completed_at !== null || task.version !== 1) {
      context.addIssue({ code: 'custom', path: ['tasks'], message: 'New instances must begin in an unassigned, incomplete template-derived state' });
    }
  }
});

export type WorkflowTemplateVersion = z.infer<typeof WorkflowTemplateVersionSchema>;
export type WorkflowInstanceSnapshot = z.infer<typeof WorkflowInstanceSnapshotSchema>;

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) freezeDeep(nested);
  }
  return value;
}

export function createWorkflowInstanceSnapshot(input: {
  instance_id: string;
  clinic_id: string;
  template: WorkflowTemplateVersion;
  started_by: string;
  started_at: string;
}): Readonly<WorkflowInstanceSnapshot> {
  const template = WorkflowTemplateVersionSchema.parse(input.template);
  if (template.status !== 'approved') throw new Error('Only an approved template version can start an instance');
  if (template.clinic_id !== input.clinic_id) throw new Error('Template and instance clinic must match');

  const tasks = template.tasks.map(task => ({
    key: task.key,
    state: task.depends_on.length === 0 ? 'eligible' as const : 'planned' as const,
    assignee_user_id: null,
    performer_user_id: null,
    completed_at: null,
    version: 1,
  }));
  const snapshot = WorkflowInstanceSnapshotSchema.parse({ ...input, template, tasks });
  return freezeDeep(snapshot);
}
