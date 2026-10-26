import type { InfrastructureItem, ProductModule, TestLink } from '../../lib/product-roadmap';
import type { ModuleProgress } from '../../lib/module-progress';
export type BuildTaskState = 'done' | 'active' | 'blocked' | 'queued';

export type BuildTask = {
  id: string;
  label: string;
  phase: string;
  state: BuildTaskState;
  acceptance: string;
  evidence?: string;
  blocker?: string;
  nextAction?: string;
  dependencies: string[];
  pullRequests: { number: string; url: string }[];
  links: TestLink[];
};

export type BuildMilestone = {
  id: string;
  title: string;
  state: 'foundation' | 'current' | 'future' | 'gated';
  summary: string;
  unlock: string;
  modules?: string[];
};

export type BuildStatusData = {
  sourceVersion: number;
  tasks: BuildTask[];
  counts: Record<BuildTaskState, number>;
  milestones: BuildMilestone[];
  productModules: (ProductModule & { progress: ModuleProgress })[];
  infrastructure: InfrastructureItem[];
  releaseGates: { title: string; state: string; remaining: string }[];
  snapshotAt: string;
  snapshotId: string;
  successfulAt: string | null;
  progressReviewedAt: string;
};
