import path from "node:path";
import type { StateWatcherEvent } from "../autopilot/state-watcher.js";
import type { SwarmPaths } from "../lib/paths.js";
import type { ProgressSummary, RunRecord, SessionRecord, SpecDoc, WorkflowState } from "../types.js";
import type { WorkflowReader } from "./workflow-reader.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function idFromJsonPath(filePath: string): string {
  return path.basename(filePath, ".json");
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedClones<T>(values: Iterable<T>, idOf: (record: T) => string): T[] {
  return Array.from(values)
    .sort((left, right) => compareIds(idOf(left), idOf(right)))
    .map(clone);
}

export class StateCache implements WorkflowReader {
  private projectRoot?: string;
  private paths?: SwarmPaths;
  private workflow: WorkflowState | null = null;
  private progress: ProgressSummary | null = null;
  private specs = new Map<string, SpecDoc>();
  private runs = new Map<string, RunRecord>();
  private sessions = new Map<string, SessionRecord>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly reader: WorkflowReader) {}

  async start(projectRoot: string): Promise<void> {
    this.assertSameProject(projectRoot);
    const paths = await this.reader.initProject(projectRoot);
    const resolvedProjectRoot = path.resolve(paths.projectRoot);
    this.assertSameProject(resolvedProjectRoot);

    const [workflow, specs, runs, progress, sessions] = await Promise.all([
      this.reader.loadWorkflow(resolvedProjectRoot),
      this.reader.loadSpecs(resolvedProjectRoot),
      this.reader.loadRuns(resolvedProjectRoot),
      this.reader.loadProgress(resolvedProjectRoot),
      this.reader.loadSessions(resolvedProjectRoot),
    ]);
    if (!workflow) {
      throw new Error("workflow-state.json is missing after initialization");
    }

    this.projectRoot = resolvedProjectRoot;
    this.paths = paths;
    this.workflow = clone(workflow);
    this.specs = new Map(specs.map((spec) => [spec.specId, clone(spec)]));
    this.runs = new Map(runs.map((run) => [run.runId, clone(run)]));
    this.progress = progress ? clone(progress) : null;
    this.sessions = new Map(sessions.map((session) => [session.sessionId, clone(session)]));
  }

  async initProject(projectRoot: string): Promise<SwarmPaths> {
    this.assertSameProject(projectRoot);
    if (this.paths) {
      return this.paths;
    }
    return this.reader.initProject(projectRoot);
  }

  async applyChange(event: StateWatcherEvent): Promise<void> {
    this.requireStarted();
    await this.enqueue(() => this.refresh(event));
  }

  async loadWorkflow(projectRoot: string): Promise<WorkflowState | null> {
    this.assertProject(projectRoot);
    await this.queue;
    return this.workflow ? clone(this.workflow) : null;
  }

  async loadSpecs(projectRoot: string): Promise<SpecDoc[]> {
    this.assertProject(projectRoot);
    await this.queue;
    return sortedClones(this.specs.values(), (spec) => spec.specId);
  }

  async loadRuns(projectRoot: string): Promise<RunRecord[]> {
    this.assertProject(projectRoot);
    await this.queue;
    return sortedClones(this.runs.values(), (run) => run.runId);
  }

  async loadRun(projectRoot: string, runId: string): Promise<RunRecord | null> {
    this.assertProject(projectRoot);
    await this.queue;
    const run = this.runs.get(runId);
    return run ? clone(run) : null;
  }

  async loadProgress(projectRoot: string): Promise<ProgressSummary | null> {
    this.assertProject(projectRoot);
    await this.queue;
    return this.progress ? clone(this.progress) : null;
  }

  async loadSessions(projectRoot: string): Promise<SessionRecord[]> {
    this.assertProject(projectRoot);
    await this.queue;
    return sortedClones(this.sessions.values(), (session) => session.sessionId);
  }

  async onWorkflowWritten(projectRoot: string, workflow: WorkflowState): Promise<void> {
    this.assertProject(projectRoot);
    const snapshot = clone(workflow);
    await this.enqueue(async () => {
      this.workflow = snapshot;
    });
  }

  async onSpecWritten(projectRoot: string, spec: SpecDoc): Promise<void> {
    this.assertProject(projectRoot);
    const snapshot = clone(spec);
    await this.enqueue(async () => {
      this.specs.set(snapshot.specId, snapshot);
    });
  }

  async onRunWritten(projectRoot: string, runRecord: RunRecord): Promise<void> {
    this.assertProject(projectRoot);
    const snapshot = clone(runRecord);
    await this.enqueue(async () => {
      this.runs.set(snapshot.runId, snapshot);
    });
  }

  async onProgressWritten(projectRoot: string, progress: ProgressSummary): Promise<void> {
    this.assertProject(projectRoot);
    const snapshot = clone(progress);
    await this.enqueue(async () => {
      this.progress = snapshot;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async refresh(event: StateWatcherEvent): Promise<void> {
    const projectRoot = this.requireStarted();
    if (event.kind === "workflow") {
      if (event.op === "delete") {
        this.workflow = null;
        return;
      }
      const workflow = await this.reader.loadWorkflow(projectRoot);
      this.workflow = workflow ? clone(workflow) : null;
      return;
    }

    if (event.kind === "progress") {
      if (event.op === "delete") {
        this.progress = null;
        return;
      }
      const progress = await this.reader.loadProgress(projectRoot);
      this.progress = progress ? clone(progress) : null;
      return;
    }

    if (event.kind === "run") {
      for (const filePath of event.paths) {
        const runId = idFromJsonPath(filePath);
        if (event.op === "delete") {
          this.runs.delete(runId);
          continue;
        }
        const run = await this.reader.loadRun(projectRoot, runId);
        if (run) {
          if (run.runId !== runId) {
            this.runs.delete(runId);
          }
          this.runs.set(run.runId, clone(run));
        } else {
          this.runs.delete(runId);
        }
      }
      return;
    }

    if (event.kind === "spec") {
      await this.refreshCollection(event, this.specs, (spec) => spec.specId, () => this.reader.loadSpecs(projectRoot));
      return;
    }

    if (event.kind === "session") {
      await this.refreshCollection(event, this.sessions, (session) => session.sessionId, () => this.reader.loadSessions(projectRoot));
    }
  }

  private async refreshCollection<T>(
    event: StateWatcherEvent,
    cache: Map<string, T>,
    idOf: (record: T) => string,
    loadAll: () => Promise<T[]>,
  ): Promise<void> {
    const ids = event.paths.map(idFromJsonPath);
    if (event.op === "delete") {
      ids.forEach((id) => cache.delete(id));
      return;
    }

    const records = await loadAll();
    const byId = new Map(records.map((record) => [idOf(record), record]));
    for (const id of ids) {
      const record = byId.get(id);
      if (record) {
        const recordId = idOf(record);
        if (recordId !== id) {
          cache.delete(id);
        }
        cache.set(recordId, clone(record));
      } else {
        cache.delete(id);
      }
    }
  }

  private assertProject(projectRoot: string): void {
    const boundProjectRoot = this.requireStarted();
    if (path.resolve(projectRoot) !== boundProjectRoot) {
      throw new Error(`StateCache is bound to ${boundProjectRoot}, not ${path.resolve(projectRoot)}`);
    }
  }

  private assertSameProject(projectRoot: string): void {
    if (!this.projectRoot) return;
    if (path.resolve(projectRoot) !== this.projectRoot) {
      throw new Error(`StateCache is bound to ${this.projectRoot}, not ${path.resolve(projectRoot)}`);
    }
  }

  private requireStarted(): string {
    if (!this.projectRoot) {
      throw new Error("StateCache has not been started");
    }
    return this.projectRoot;
  }
}
