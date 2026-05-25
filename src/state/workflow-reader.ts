import fs from "node:fs/promises";
import path from "node:path";
import type { SwarmPluginConfig } from "../config.js";
import { ensureDir, readDirectoryJsonFiles, readJsonFile, writeJsonFileAtomic } from "../lib/json-file.js";
import { resolveSwarmPaths, type SwarmPaths } from "../lib/paths.js";
import type { ProgressSummary, RunRecord, SessionRecord, SpecDoc, WorkflowState } from "../types.js";

export type WorkflowReader = {
  initProject(projectRoot: string): Promise<SwarmPaths>;
  loadWorkflow(projectRoot: string): Promise<WorkflowState | null>;
  loadSpecs(projectRoot: string): Promise<SpecDoc[]>;
  loadRuns(projectRoot: string): Promise<RunRecord[]>;
  loadRun(projectRoot: string, runId: string): Promise<RunRecord | null>;
  loadProgress(projectRoot: string): Promise<ProgressSummary | null>;
  loadSessions(projectRoot: string): Promise<SessionRecord[]>;
  onWorkflowWritten?(projectRoot: string, workflow: WorkflowState): Promise<void> | void;
  onSpecWritten?(projectRoot: string, spec: SpecDoc): Promise<void> | void;
  onRunWritten?(projectRoot: string, runRecord: RunRecord): Promise<void> | void;
  onProgressWritten?(projectRoot: string, progress: ProgressSummary): Promise<void> | void;
};

export class FsWorkflowReader implements WorkflowReader {
  constructor(
    private readonly config: SwarmPluginConfig,
    private readonly createEmptyWorkflow: (projectRoot: string) => WorkflowState,
  ) {}

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
        this.createEmptyWorkflow(paths.projectRoot),
      );
    }
    return paths;
  }

  async loadWorkflow(projectRoot: string): Promise<WorkflowState | null> {
    const paths = await this.initProject(projectRoot);
    return readJsonFile<WorkflowState>(paths.workflowStatePath);
  }

  async loadSpecs(projectRoot: string): Promise<SpecDoc[]> {
    const paths = await this.initProject(projectRoot);
    return readDirectoryJsonFiles<SpecDoc>(paths.specsDir);
  }

  async loadRuns(projectRoot: string): Promise<RunRecord[]> {
    const paths = await this.initProject(projectRoot);
    return readDirectoryJsonFiles<RunRecord>(paths.runsDir);
  }

  async loadRun(projectRoot: string, runId: string): Promise<RunRecord | null> {
    const paths = await this.initProject(projectRoot);
    return readJsonFile<RunRecord>(path.join(paths.runsDir, `${runId}.json`));
  }

  async loadProgress(projectRoot: string): Promise<ProgressSummary | null> {
    const paths = this.resolvePaths(projectRoot);
    return readJsonFile<ProgressSummary>(paths.progressFilePath);
  }

  async loadSessions(projectRoot: string): Promise<SessionRecord[]> {
    const paths = await this.initProject(projectRoot);
    return readDirectoryJsonFiles<SessionRecord>(paths.sessionsDir);
  }

  async deleteFileIfExists(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}
