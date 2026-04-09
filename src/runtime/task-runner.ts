import type { RunRecord, SessionRecord, TaskNode, WorkflowState } from "../types.js";

export type RunnerPlanInput = {
  projectRoot: string;
  task: TaskNode;
  workflow: WorkflowState;
  dryRun?: boolean;
};

export type RunnerPlan = {
  runnable: boolean;
  summary: string;
  workspacePath: string;
  nextStatus: TaskNode["status"];
};

export type RunnerRunInput = {
  projectRoot: string;
  task: TaskNode;
  workflow: WorkflowState;
  reusedSession?: SessionRecord;
};

export type RunnerRunResult = {
  accepted: boolean;
  runRecord: RunRecord;
  nextTaskStatus: TaskNode["status"];
};

export type RunnerSyncInput = {
  projectRoot: string;
  task: TaskNode;
  runRecord: RunRecord;
};

export type RunnerSyncResult = {
  runRecord: RunRecord;
  checkedAt?: string;
  remoteState?: RunRecord["status"];
};

export interface TaskRunner {
  kind: "manual" | "acp";
  plan(input: RunnerPlanInput): Promise<RunnerPlan>;
  run(input: RunnerRunInput): Promise<RunnerRunResult>;
  sync?(input: RunnerSyncInput): Promise<RunnerSyncResult>;
}
