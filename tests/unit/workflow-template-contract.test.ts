import { describe, expect, it } from 'vitest';
import {
  WorkflowTemplateVersionSchema,
  createWorkflowInstanceSnapshot,
  type WorkflowTemplateVersion,
} from '../../packages/contracts/src';

const clinicId = 'e59fa39a-f46f-48a5-a309-cde8b9b5de50';
const creatorId = '1cad91d1-e394-4d3b-b7df-8e6f9bcced94';
const approverId = '443f0f9e-7b55-4d6e-a2bf-6913277d9c19';
const templateId = 'b8fa6f4e-0928-46ff-98fd-3b6095609c04';
const templateBase: Omit<WorkflowTemplateVersion, 'clinic_id' | 'status' | 'approved_by' | 'approved_at'> = {
  template_id: templateId,
  version: 1,
  title: 'Generic operations template',
  created_by: creatorId,
  created_at: '2026-10-28T09:00:00Z',
  tasks: [
    { key: 'prepare_room', title: 'Prepare room', assignee_roles: ['assistant'], depends_on: [], required: true },
    { key: 'welcome_guest', title: 'Welcome guest', assignee_roles: ['reception'], depends_on: ['prepare_room'], required: true },
  ],
};
const draftTemplate = {
  ...templateBase,
  clinic_id: null,
  status: 'draft' as const,
  approved_by: null,
  approved_at: null,
};
const approvedTemplate = {
  ...templateBase,
  clinic_id: clinicId,
  status: 'approved' as const,
  approved_by: approverId,
  approved_at: '2026-10-28T09:30:00Z',
};

describe('workflow template contract', () => {
  it('accepts shared drafts and clinic-approved versions', () => {
    expect(WorkflowTemplateVersionSchema.parse(draftTemplate)).toEqual(draftTemplate);
    expect(WorkflowTemplateVersionSchema.parse(approvedTemplate)).toEqual(approvedTemplate);
  });

  it('rejects unknown, repeated, self and cyclic task dependencies', () => {
    expect(WorkflowTemplateVersionSchema.safeParse({
      ...draftTemplate,
      tasks: [{ ...draftTemplate.tasks[0], depends_on: ['missing_task'] }],
    }).success).toBe(false);
    expect(WorkflowTemplateVersionSchema.safeParse({
      ...draftTemplate,
      tasks: [{ ...draftTemplate.tasks[0], depends_on: ['prepare_room'] }],
    }).success).toBe(false);
    expect(WorkflowTemplateVersionSchema.safeParse({
      ...draftTemplate,
      tasks: [
        { ...draftTemplate.tasks[0], depends_on: ['welcome_guest'] },
        draftTemplate.tasks[1],
      ],
    }).success).toBe(false);
    expect(WorkflowTemplateVersionSchema.safeParse({
      ...draftTemplate,
      tasks: [draftTemplate.tasks[0], { ...draftTemplate.tasks[1], depends_on: ['prepare_room', 'prepare_room'] }],
    }).success).toBe(false);
  });

  it('requires coherent clinic approval metadata for every status', () => {
    expect(WorkflowTemplateVersionSchema.safeParse({ ...approvedTemplate, clinic_id: null }).success).toBe(false);
    expect(WorkflowTemplateVersionSchema.safeParse({ ...approvedTemplate, approved_at: null }).success).toBe(false);
    expect(WorkflowTemplateVersionSchema.safeParse({ ...draftTemplate, approved_by: approverId }).success).toBe(false);
    expect(WorkflowTemplateVersionSchema.safeParse({ ...draftTemplate, clinic_id: clinicId }).success).toBe(false);
  });

  it('pins an immutable approved template snapshot and derives only initial task eligibility', () => {
    const snapshot = createWorkflowInstanceSnapshot({
      instance_id: '67302a0b-e3fb-4acd-809f-b41ae9a3601b',
      clinic_id: clinicId,
      template: approvedTemplate,
      started_by: creatorId,
      started_at: '2026-10-28T10:00:00Z',
    });
    expect(snapshot.template.version).toBe(1);
    expect(snapshot.tasks.map(task => [task.key, task.state])).toEqual([
      ['prepare_room', 'eligible'],
      ['welcome_guest', 'planned'],
    ]);
    expect(snapshot.tasks.every(task => task.assignee_user_id === null && task.performer_user_id === null)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.template.tasks[0])).toBe(true);
    expect(() => { (snapshot.template.tasks[0] as { title: string }).title = 'Changed'; }).toThrow();
  });

  it('refuses to start shared drafts or cross-clinic instances', () => {
    expect(() => createWorkflowInstanceSnapshot({
      instance_id: '67302a0b-e3fb-4acd-809f-b41ae9a3601b',
      clinic_id: clinicId,
      template: draftTemplate,
      started_by: creatorId,
      started_at: '2026-10-28T10:00:00Z',
    })).toThrow('Only an approved template version can start an instance');
    expect(() => createWorkflowInstanceSnapshot({
      instance_id: '67302a0b-e3fb-4acd-809f-b41ae9a3601b',
      clinic_id: 'bc80b1e8-38b0-47dd-a17f-11c21c0674d4',
      template: approvedTemplate,
      started_by: creatorId,
      started_at: '2026-10-28T10:00:00Z',
    })).toThrow('Template and instance clinic must match');
  });
});
