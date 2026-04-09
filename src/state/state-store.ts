import path from "node:path";
import type { AcpAutomationResolutionHints, SwarmPluginConfig } from "../config.js";
import { resolveDefaultAllowedRunners, resolveSwarmPluginConfig, resolveWorkflowDefaultRunner } from "../config.js";
import { ensureDir, readDirectoryJsonFiles, readJsonFile, writeJsonFileAtomic } from "../lib/json-file.js";
import { validateTaskImmutability } from "../planning/immutability-guard.js";
import { resolveSwarmPaths, type SwarmPaths } from "../lib/paths.js";
import type { ProgressSummary, RunRecord, SessionRecord, SpecDoc, TaskNode, WorkflowState, WorkflowStatusSummary } from "../types.js";

const CURRENT_WORKFLOW_VERSION = 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isCurrentRunnerType(value: unknown): value is "manual" | "acp" {
  return value === "manual" || value === "acp";
}

function isPersistedRunnerType(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertTask(task: unknown, options?: { allowLegacyRunnerTypes?: boolean }): asserts task is TaskNode {
  assert(isObject(task), "task must be an object");
  assert(typeof task.taskId === "string" && task.taskId.length > 0, "task.taskId is required");
  assert(typeof task.specId === "string" && task.specId.length > 0, "task.specId is required");
  assert(typeof task.title === "string" && task.title.length > 0, "task.title is required");
  assert(typeof task.description === "string", "task.description is required");
  assert(isStringArray(task.deps), "task.deps must be a string array");
  assert(isObject(task.workspace) && (task.workspace.mode === "shared" || task.workspace.mode === "isolated"), "task.workspace.mode is invalid");
  assert(
    isObject(task.runner) &&
      (options?.allowLegacyRunnerTypes ? isPersistedRunnerType(task.runner.type) : isCurrentRunnerType(task.runner.type)),
    "task.runner.type is invalid",
  );
  assert(isObject(task.review) && typeof task.review.required === "boolean", "task.review.required is invalid");
  if (task.contract !== undefined) {
    assert(isObject(task.contract), "task.contract must be an object");
    assert(typeof task.contract.taskId === "string", "task.contract.taskId is required");
    assert(typeof task.contract.negotiatedAt === "string", "task.contract.negotiatedAt is required");
    assert(Array.isArray(task.contract.criteria), "task.contract.criteria must be an array");
    assert(typeof task.contract.frozen === "boolean", "task.contract.frozen must be a boolean");
  }
  if (task.session !== undefined) {
    assert(isObject(task.session), "task.session must be an object");
    assert(
      task.session.policy === "none" ||
        task.session.policy === "create_persistent" ||
        task.session.policy === "reuse_if_available" ||
        task.session.policy === "require_existing",
      "task.session.policy is invalid",
    );
    if (task.session.bindingKey !== undefined) {
      assert(typeof task.session.bindingKey === "string", "task.session.bindingKey must be a string");
    }
    if (task.session.preferredSessionId !== undefined) {
      assert(typeof task.session.preferredSessionId === "string", "task.session.preferredSessionId must be a string");
    }
  }
}

export function createEmptyWorkflowState(
  projectRoot: string,
  config: Partial<SwarmPluginConfig> = {},
  hints?: AcpAutomationResolutionHints,
): WorkflowState {
  const resolvedConfig = resolveSwarmPluginConfig(config);
  return {
    version: CURRENT_WORKFLOW_VERSION,
    projectRoot,
    lifecycle: "idle",
    tasks: [],
    reviewQueue: [],
    runtime: {
      defaultRunner: resolveWorkflowDefaultRunner(resolvedConfig, hints),
      allowedRunners: resolveDefaultAllowedRunners(),
    },
  };
}

export class StateStore {
  readonly config: SwarmPluginConfig;
  readonly runtimeVersion?: string | null;

  constructor(config?: Partial<SwarmPluginConfig>, hints?: AcpAutomationResolutionHints) {
    this.config = resolveSwarmPluginConfig(config);
    this.runtimeVersion = hints?.runtimeVersion;
  }

  resolvePaths(projectRoot: string): SwarmPaths {
    return resolveSwarmPaths(projectRoot, this.config);
  }

  async initProject(projectRoot: string): Promise<SwarmPaths> {
    const paths = this.resolvePaths(projectRoot);
    await Promise.all([
      ensureDir(paths.swarmRoot),
      ensureDir(paths.specsDir),
      ensureDir(paths.runsDir),
      ensureDir(paths.sessionsDir),
      ensureDir(paths.artifactsDir),
      ensureDir(paths.logsDir),
    ]);

    const existing = await readJsonFile<WorkflowState>(paths.workflowStatePath);
    if (!existing) {
      await writeJsonFileAtomic(
        paths.workflowStatePath,
        createEmptyWorkflowState(paths.projectRoot, this.config, { runtimeVersion: this.runtimeVersion }),
      );
    }
    return paths;
  }

  async loadWorkflow(projectRoot: string): Promise<WorkflowState> {
    const paths = await this.initProject(projectRoot);
    const workflow = await readJsonFile<WorkflowState>(paths.workflowStatePath);
    if (!workflow) {
      throw new Error("workflow-state.json is missing after initialization");
    }
    this.assertValidWorkflow(workflow, { allowLegacyRunnerTypes: true });
    return workflow;
  }

  async saveWorkflow(projectRoot: string, workflow: WorkflowState): Promise<void> {
    this.assertValidWorkflow(workflow);
    const paths = await this.initProject(projectRoot);

    // Immutability guard: check task fields haven't been illegally mutated
    if (this.config.enforceTaskImmutability) {
      const existing = await readJsonFile<WorkflowState>(paths.workflowStatePath);
      if (existing && existing.tasks && existing.tasks.length > 0) {
        const check = validateTaskImmutability(existing.tasks, workflow.tasks);
        if (!check.ok) {
          throw new Error(`Task immutability violation: ${check.violations.join("; ")}`);
        }
      }
    }

    await writeJsonFileAtomic(paths.workflowStatePath, workflow);
  }

  async writeSpec(projectRoot: string, spec: SpecDoc): Promise<string> {
    this.assertValidSpec(spec);
    const paths = await this.initProject(projectRoot);
    const filePath = path.join(paths.specsDir, `${spec.specId}.json`);
    await writeJsonFileAtomic(filePath, spec);
    return filePath;
  }

  async loadSpecs(projectRoot: string): Promise<SpecDoc[]> {
    const paths = await this.initProject(projectRoot);
    const specs = await readDirectoryJsonFiles<SpecDoc>(paths.specsDir);
    specs.forEach((spec) => this.assertValidSpec(spec));
    return specs;
  }

  async writeRun(projectRoot: string, runRecord: RunRecord): Promise<string> {
    this.assertValidRun(runRecord);
    const paths = await this.initProject(projectRoot);
    const filePath = path.join(paths.runsDir, `${runRecord.runId}.json`);
    await writeJsonFileAtomic(filePath, runRecord);
    return filePath;
  }

  async loadRuns(projectRoot: string): Promise<RunRecord[]> {
    const paths = await this.initProject(projectRoot);
    const runs = await readDirectoryJsonFiles<RunRecord>(paths.runsDir);
    runs.forEach((runRecord) => this.assertValidRun(runRecord, { allowLegacyRunnerTypes: true }));
    return runs;
  }

  async loadRun(projectRoot: string, runId: string): Promise<RunRecord | null> {
    const paths = await this.initProject(projectRoot);
    const filePath = path.join(paths.runsDir, `${runId}.json`);
    const runRecord = await readJsonFile<RunRecord>(filePath);
    if (!runRecord) {
      return null;
    }
    this.assertValidRun(runRecord, { allowLegacyRunnerTypes: true });
    return runRecord;
  }

  async loadProgress(projectRoot: string): Promise<ProgressSummary | null> {
    const paths = this.resolvePaths(projectRoot);
    return readJsonFile<ProgressSummary>(paths.progressFilePath);
  }

  async saveProgress(projectRoot: string, progress: ProgressSummary): Promise<void> {
    const paths = await this.initProject(projectRoot);
    await writeJsonFileAtomic(paths.progressFilePath, progress);
  }

  async loadSessions(projectRoot: string): Promise<SessionRecord[]> {
    const paths = await this.initProject(projectRoot);
    return readDirectoryJsonFiles<SessionRecord>(paths.sessionsDir);
  }

  summarizeWorkflow(workflow: WorkflowState): WorkflowStatusSummary {
    return {
      lifecycle: workflow.lifecycle,
      totalTasks: workflow.tasks.length,
      readyTasks: workflow.tasks.filter((task) => task.status === "ready").length,
      queuedTasks: workflow.tasks.filter((task) => task.status === "queued").length,
      runningTasks: workflow.tasks.filter((task) => task.status === "running").length,
      blockedTasks: workflow.tasks.filter((task) => task.status === "blocked").length,
      deadLetterTasks: workflow.tasks.filter((task) => task.status === "dead_letter").length,
      reviewQueueSize: workflow.reviewQueue.length,
      activeSpecId: workflow.activeSpecId,
    };
  }

  assertValidSpec(spec: SpecDoc): void {
    assert(isObject(spec), "spec must be an object");
    assert(typeof spec.specId === "string" && spec.specId.length > 0, "spec.specId is required");
    assert(typeof spec.title === "string" && spec.title.length > 0, "spec.title is required");
    assert(typeof spec.sourcePath === "string" && spec.sourcePath.length > 0, "spec.sourcePath is required");
    assert(typeof spec.projectRoot === "string" && spec.projectRoot.length > 0, "spec.projectRoot is required");
    assert(isStringArray(spec.goals), "spec.goals must be a string array");
    assert(isStringArray(spec.constraints), "spec.constraints must be a string array");
    assert(isStringArray(spec.acceptanceCriteria), "spec.acceptanceCriteria must be a string array");
    assert(Array.isArray(spec.phases), "spec.phases must be an array");
  }

  assertValidRun(runRecord: RunRecord, options?: { allowLegacyRunnerTypes?: boolean }): void {
    assert(isObject(runRecord), "runRecord must be an object");
    assert(typeof runRecord.runId === "string" && runRecord.runId.length > 0, "runRecord.runId is required");
    assert(typeof runRecord.taskId === "string" && runRecord.taskId.length > 0, "runRecord.taskId is required");
    assert(typeof runRecord.attempt === "number" && runRecord.attempt >= 1, "runRecord.attempt is invalid");
    assert(
      runRecord.status === "planned" ||
        runRecord.status === "accepted" ||
        runRecord.status === "running" ||
        runRecord.status === "completed" ||
        runRecord.status === "failed" ||
        runRecord.status === "cancelled" ||
        runRecord.status === "timed_out",
      "runRecord.status is invalid",
    );
    assert(
      isObject(runRecord.runner) &&
        (options?.allowLegacyRunnerTypes ? isPersistedRunnerType(runRecord.runner.type) : isCurrentRunnerType(runRecord.runner.type)),
      "runRecord.runner.type is invalid",
    );
    assert(typeof runRecord.workspacePath === "string" && runRecord.workspacePath.length > 0, "runRecord.workspacePath is required");
    assert(typeof runRecord.startedAt === "string" && runRecord.startedAt.length > 0, "runRecord.startedAt is required");
    assert(isStringArray(runRecord.artifacts), "runRecord.artifacts must be a string array");
  }

  assertValidWorkflow(workflow: WorkflowState, options?: { allowLegacyRunnerTypes?: boolean }): void {
    try {
      assert(isObject(workflow), "workflow must be an object");
      assert(typeof workflow.version === "number" && workflow.version >= 1, "workflow.version is invalid");
      assert(typeof workflow.projectRoot === "string" && workflow.projectRoot.length > 0, "workflow.projectRoot is required");
      assert(Array.isArray(workflow.tasks), "workflow.tasks must be an array");
      workflow.tasks.forEach((task) => assertTask(task, options));
      assert(isStringArray(workflow.reviewQueue), "workflow.reviewQueue must be a string array");
    } catch (error) {
      throw new Error(
        `Invalid workflow state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
