# Autopilot FS Watcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current timer-primary autopilot service loop with a watcher-primary loop that keeps idle gateway CPU near zero while preserving the existing polling mode as the rollback path.

**Architecture:** Keep `AutopilotController.tick()` as the public behavioral boundary, but make its state reads go through a `WorkflowReader` abstraction. In watcher modes, a per-project `StateWatcher` invalidates a per-project `StateCache`, and `AutopilotServiceLoop` invokes ticks from watcher, safety, hybrid-polling, or manual sources without re-entrant execution.

**Tech Stack:** TypeScript, Node 22, Vitest, OpenClaw plugin SDK, optional `@parcel/watcher` native watcher, existing JSON file state store.

---

## Source Findings

- The local development repo is the repository checkout; use it for implementation.
- The remote deployment checkout may lag behind the local repo, so use remote hosts only for staging smoke after local build and tests pass.
- Current hot path:
  - `src/autopilot/service-loop.ts` schedules a recurring timeout and invokes `controller.tick()` every `tickSeconds`.
  - `src/autopilot/controller.ts` reads `workflow-state.json` at the start, then rereads workflow and runs several times during one tick.
  - `src/state/state-store.ts` still implements `loadRuns()` as `readdir(runsDir) + read every *.json`.
- The design doc requires default-safe rollout: keep `polling`, add `watch` and `hybrid`, and make the default remain `polling` for the first release.
- The `@parcel/watcher` README documents `subscribe()`, `getEventsSince()`, and `writeSnapshot()`, which match the snapshot/resume design.

## File Structure

Create:
- `src/state/workflow-reader.ts` - read abstraction and default filesystem reader.
- `src/state/state-cache.ts` - per-project cache implementing `WorkflowReader`.
- `src/autopilot/state-watcher.ts` - normalized watcher events over the swarm state directory.
- `test/unit/state/workflow-reader.test.ts` - no-behavior-change reader coverage.
- `test/unit/state/state-cache.test.ts` - cache invalidation and write-through coverage.
- `test/unit/autopilot/state-watcher.test.ts` - event mapping and debounce coverage.
- `test/e2e/autopilot-fs-watcher.e2e.test.ts` - real filesystem latency test.
- `scripts/autopilot-fs-watcher-smoke.mjs` - local and remote staging smoke/perf harness.

Modify:
- `package.json` and `package-lock.json` - add optional watcher dependency and smoke script.
- `src/config.ts` - add watcher config types, defaults, schema validation, and resolver logic.
- `src/lib/paths.ts` - add watcher snapshot/cache paths under `<swarmRoot>/.autopilot/`.
- `src/state/state-store.ts` - delegate read methods to `WorkflowReader` and notify cache on writes.
- `src/autopilot/types.ts` - add tick source metadata to persisted decisions.
- `src/autopilot/controller.ts` - accept and persist tick source without changing dispatch semantics.
- `src/autopilot/service-loop.ts` - support polling, watcher, hybrid, safety ticks, debounce, and non-reentrant follow-up.
- `src/services/orchestrator.ts` - wire watcher/cache only when configured mode is not `polling`.
- `src/autopilot/metrics.ts` - add tick source counters in health output only if the state has them.
- `test/unit/config.test.ts`, `test/unit/autopilot/controller.test.ts`, `test/unit/autopilot/service-loop.test.ts`, `test/unit/services/swarm-service.test.ts` - cover new behavior.
- `docs/configuration.md` and `docs/operator-runbook.md` - document config, rollback, and smoke commands.

## Task 1: Config And Dependency Surface

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/config.ts`
- Modify: `test/unit/config.test.ts`
- Modify: `docs/configuration.md`

- [ ] **Step 1: Write failing config tests**

Add this to `test/unit/config.test.ts` near the existing autopilot config tests:

```ts
it("resolves autopilot watcher defaults", () => {
  const resolved = resolveSwarmPluginConfig({});
  expect(resolved.autopilot.watcherMode).toBe("polling");
  expect(resolved.autopilot.watcher).toEqual({
    debounceMs: 100,
    safetyTickMs: 300000,
    safetyResyncMs: 3600000,
    library: "auto",
    ignoreInitial: true,
    useFsEventsCoalescing: false,
  });
});

it("accepts nested autopilot watcher config", () => {
  const resolved = resolveSwarmPluginConfig({
    autopilot: {
      watcherMode: "hybrid",
      watcher: {
        debounceMs: 50,
        safetyTickMs: 120000,
        safetyResyncMs: 600000,
        library: "node",
        ignoreInitial: false,
        useFsEventsCoalescing: true,
      },
    },
  });

  expect(resolved.autopilot.watcherMode).toBe("hybrid");
  expect(resolved.autopilot.watcher.debounceMs).toBe(50);
  expect(resolved.autopilot.watcher.safetyTickMs).toBe(120000);
  expect(resolved.autopilot.watcher.safetyResyncMs).toBe(600000);
  expect(resolved.autopilot.watcher.library).toBe("node");
  expect(resolved.autopilot.watcher.ignoreInitial).toBe(false);
  expect(resolved.autopilot.watcher.useFsEventsCoalescing).toBe(true);
});

it("rejects invalid autopilot watcher config", () => {
  const result = swarmPluginConfigSchema.validate({
    autopilot: {
      watcherMode: "fast",
      watcher: {
        debounceMs: 0,
        safetyTickMs: 999,
        safetyResyncMs: 0,
        library: "bad",
        ignoreInitial: "yes",
        useFsEventsCoalescing: "no",
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.errors).toEqual([
    'autopilot.watcherMode must be one of: "polling", "watch", "hybrid"',
    "autopilot.watcher.debounceMs must be an integer >= 1",
    "autopilot.watcher.safetyTickMs must be an integer >= 1000",
    "autopilot.watcher.safetyResyncMs must be an integer >= 1",
    'autopilot.watcher.library must be one of: "auto", "parcel", "node"',
    "autopilot.watcher.ignoreInitial must be a boolean",
    "autopilot.watcher.useFsEventsCoalescing must be a boolean",
  ]);
});
```

- [ ] **Step 2: Run config tests and verify failure**

Run:

```bash
npm run test:unit -- test/unit/config.test.ts
```

Expected: FAIL because `watcherMode` and `watcher` are not in `SwarmAutopilotConfig`.

- [ ] **Step 3: Add dependency**

Run:

```bash
npm install --save-optional @parcel/watcher
```

Expected:
- `package.json` gains `optionalDependencies["@parcel/watcher"]`.
- `package-lock.json` is updated.

- [ ] **Step 4: Extend config types and defaults**

In `src/config.ts`, add:

```ts
export type SwarmAutopilotWatcherMode = "polling" | "watch" | "hybrid";

export type SwarmAutopilotWatcherLibrary = "auto" | "parcel" | "node";

export type SwarmAutopilotWatcherConfig = {
  debounceMs: number;
  safetyTickMs: number;
  safetyResyncMs: number;
  library: SwarmAutopilotWatcherLibrary;
  ignoreInitial: boolean;
  useFsEventsCoalescing: boolean;
};
```

Extend `SwarmAutopilotConfig`:

```ts
export type SwarmAutopilotConfig = {
  enabled: boolean;
  mode: "supervised";
  tickSeconds: number;
  leaseSeconds: number;
  maxDispatchPerTick: number;
  watcherMode: SwarmAutopilotWatcherMode;
  watcher: SwarmAutopilotWatcherConfig;
  reviewPolicy: SwarmAutopilotReviewPolicy;
  recoveryPolicy: SwarmAutopilotRecoveryPolicy;
};
```

Add defaults inside `defaultSwarmPluginConfig.autopilot`:

```ts
watcherMode: "polling",
watcher: {
  debounceMs: 100,
  safetyTickMs: 300000,
  safetyResyncMs: 3600000,
  library: "auto",
  ignoreInitial: true,
  useFsEventsCoalescing: false,
},
```

- [ ] **Step 5: Extend schema validation and resolver**

Add `"watcherMode"` and `"watcher"` to `allowedAutopilotKeys`.

Add watcher validation after existing autopilot scalar validation:

```ts
if (
  autopilot.watcherMode !== undefined &&
  autopilot.watcherMode !== "polling" &&
  autopilot.watcherMode !== "watch" &&
  autopilot.watcherMode !== "hybrid"
) {
  errors.push('autopilot.watcherMode must be one of: "polling", "watch", "hybrid"');
}
if (autopilot.watcher !== undefined) {
  if (!isObject(autopilot.watcher)) {
    errors.push("autopilot.watcher must be an object");
  } else {
    const watcher = autopilot.watcher;
    const allowedWatcherKeys = new Set([
      "debounceMs",
      "safetyTickMs",
      "safetyResyncMs",
      "library",
      "ignoreInitial",
      "useFsEventsCoalescing",
    ]);
    for (const key of Object.keys(watcher)) {
      if (!allowedWatcherKeys.has(key)) {
        errors.push(`Unrecognized key: "autopilot.watcher.${key}"`);
      }
    }
    if (watcher.debounceMs !== undefined && (!Number.isInteger(watcher.debounceMs) || Number(watcher.debounceMs) < 1)) {
      errors.push("autopilot.watcher.debounceMs must be an integer >= 1");
    }
    if (watcher.safetyTickMs !== undefined && (!Number.isInteger(watcher.safetyTickMs) || Number(watcher.safetyTickMs) < 1000)) {
      errors.push("autopilot.watcher.safetyTickMs must be an integer >= 1000");
    }
    if (watcher.safetyResyncMs !== undefined && (!Number.isInteger(watcher.safetyResyncMs) || Number(watcher.safetyResyncMs) < 1)) {
      errors.push("autopilot.watcher.safetyResyncMs must be an integer >= 1");
    }
    if (
      watcher.library !== undefined &&
      watcher.library !== "auto" &&
      watcher.library !== "parcel" &&
      watcher.library !== "node"
    ) {
      errors.push('autopilot.watcher.library must be one of: "auto", "parcel", "node"');
    }
    if (watcher.ignoreInitial !== undefined && typeof watcher.ignoreInitial !== "boolean") {
      errors.push("autopilot.watcher.ignoreInitial must be a boolean");
    }
    if (watcher.useFsEventsCoalescing !== undefined && typeof watcher.useFsEventsCoalescing !== "boolean") {
      errors.push("autopilot.watcher.useFsEventsCoalescing must be a boolean");
    }
  }
}
```

In `resolveSwarmPluginConfig()`, add:

```ts
watcherMode:
  isObject(input.autopilot) &&
  (input.autopilot.watcherMode === "polling" ||
    input.autopilot.watcherMode === "watch" ||
    input.autopilot.watcherMode === "hybrid")
    ? input.autopilot.watcherMode
    : defaultSwarmPluginConfig.autopilot.watcherMode,
watcher: {
  debounceMs:
    isObject(input.autopilot) &&
    isObject(input.autopilot.watcher) &&
    typeof input.autopilot.watcher.debounceMs === "number" &&
    input.autopilot.watcher.debounceMs > 0
      ? Math.floor(input.autopilot.watcher.debounceMs)
      : defaultSwarmPluginConfig.autopilot.watcher.debounceMs,
  safetyTickMs:
    isObject(input.autopilot) &&
    isObject(input.autopilot.watcher) &&
    typeof input.autopilot.watcher.safetyTickMs === "number" &&
    input.autopilot.watcher.safetyTickMs >= 1000
      ? Math.floor(input.autopilot.watcher.safetyTickMs)
      : defaultSwarmPluginConfig.autopilot.watcher.safetyTickMs,
  safetyResyncMs:
    isObject(input.autopilot) &&
    isObject(input.autopilot.watcher) &&
    typeof input.autopilot.watcher.safetyResyncMs === "number" &&
    input.autopilot.watcher.safetyResyncMs > 0
      ? Math.floor(input.autopilot.watcher.safetyResyncMs)
      : defaultSwarmPluginConfig.autopilot.watcher.safetyResyncMs,
  library:
    isObject(input.autopilot) &&
    isObject(input.autopilot.watcher) &&
    (input.autopilot.watcher.library === "auto" ||
      input.autopilot.watcher.library === "parcel" ||
      input.autopilot.watcher.library === "node")
      ? input.autopilot.watcher.library
      : defaultSwarmPluginConfig.autopilot.watcher.library,
  ignoreInitial:
    isObject(input.autopilot) &&
    isObject(input.autopilot.watcher) &&
    typeof input.autopilot.watcher.ignoreInitial === "boolean"
      ? input.autopilot.watcher.ignoreInitial
      : defaultSwarmPluginConfig.autopilot.watcher.ignoreInitial,
  useFsEventsCoalescing:
    isObject(input.autopilot) &&
    isObject(input.autopilot.watcher) &&
    typeof input.autopilot.watcher.useFsEventsCoalescing === "boolean"
      ? input.autopilot.watcher.useFsEventsCoalescing
      : defaultSwarmPluginConfig.autopilot.watcher.useFsEventsCoalescing,
},
```

- [ ] **Step 6: Document config**

In `docs/configuration.md`, extend the autopilot table with:

```md
| `watcherMode` | `"polling" \| "watch" \| "hybrid"` | `"polling"` | Selects the service loop driver. `polling` is the rollback path, `watch` is event-driven, and `hybrid` combines watcher events with a low-frequency poll. |
| `watcher.debounceMs` | integer (>= 1) | `100` | Change-event debounce window before a watcher tick is invoked |
| `watcher.safetyTickMs` | integer (>= 1000) | `300000` | Safety tick interval used by watcher modes |
| `watcher.safetyResyncMs` | integer (>= 1) | `3600000` | Maximum snapshot age before startup falls back to full cache load |
| `watcher.library` | `"auto" \| "parcel" \| "node"` | `"auto"` | Watcher backend preference |
| `watcher.ignoreInitial` | boolean | `true` | Suppress initial backend events after cache warmup |
| `watcher.useFsEventsCoalescing` | boolean | `false` | macOS-specific option passed to the native watcher when supported |
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
npm run test:unit -- test/unit/config.test.ts
npm run build
```

Expected: PASS.

Commit:

```bash
git add package.json package-lock.json src/config.ts test/unit/config.test.ts docs/configuration.md
git commit -m "feat: add autopilot watcher config"
```

## Task 2: WorkflowReader Abstraction Without Behavior Change

**Files:**
- Create: `src/state/workflow-reader.ts`
- Modify: `src/state/state-store.ts`
- Create: `test/unit/state/workflow-reader.test.ts`
- Modify: `test/unit/state/state-store.test.ts`

- [ ] **Step 1: Write failing delegation tests**

Create `test/unit/state/workflow-reader.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../../src/state/state-store.js";
import type { WorkflowReader } from "../../../src/state/workflow-reader.js";
import type { RunRecord, WorkflowState } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-workflow-reader-"));
}

describe("WorkflowReader delegation", () => {
  it("loads workflow and runs through an injected reader", async () => {
    const projectRoot = await makeTempProject();
    const workflow: WorkflowState = {
      version: 1,
      projectRoot,
      lifecycle: "planned",
      tasks: [],
      reviewQueue: [],
    };
    const run: RunRecord = {
      runId: "run-1",
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "manual" },
      workspacePath: projectRoot,
      startedAt: "2026-05-25T00:00:00.000Z",
      artifacts: [],
    };
    const reader: WorkflowReader = {
      initProject: vi.fn(async () => new StateStore().resolvePaths(projectRoot)),
      loadWorkflow: vi.fn(async () => workflow),
      loadSpecs: vi.fn(async () => []),
      loadRuns: vi.fn(async () => [run]),
      loadRun: vi.fn(async () => run),
      loadProgress: vi.fn(async () => null),
      loadSessions: vi.fn(async () => []),
    };
    const store = new StateStore({}, undefined, reader);

    await expect(store.loadWorkflow(projectRoot)).resolves.toEqual(workflow);
    await expect(store.loadRuns(projectRoot)).resolves.toEqual([run]);
    expect(reader.loadWorkflow).toHaveBeenCalledWith(projectRoot);
    expect(reader.loadRuns).toHaveBeenCalledWith(projectRoot);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm run test:unit -- test/unit/state/workflow-reader.test.ts
```

Expected: FAIL because `WorkflowReader` and the third `StateStore` constructor parameter do not exist.

- [ ] **Step 3: Create `WorkflowReader` and filesystem reader**

Create `src/state/workflow-reader.ts`:

```ts
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
```

- [ ] **Step 4: Delegate StateStore reads**

Modify `src/state/state-store.ts`:

```ts
import { FsWorkflowReader, type WorkflowReader } from "./workflow-reader.js";
```

Change constructor:

```ts
  private readonly reader: WorkflowReader;

  constructor(
    config?: Partial<SwarmPluginConfig>,
    hints?: AcpAutomationResolutionHints,
    reader?: WorkflowReader,
  ) {
    this.config = resolveSwarmPluginConfig(config);
    this.runtimeVersion = hints?.runtimeVersion;
    this.reader =
      reader ??
      new FsWorkflowReader(this.config, (projectRoot) =>
        createEmptyWorkflowState(projectRoot, this.config, { runtimeVersion: this.runtimeVersion }),
      );
  }
```

Change read methods:

```ts
async initProject(projectRoot: string): Promise<SwarmPaths> {
  return this.reader.initProject(projectRoot);
}

async loadWorkflow(projectRoot: string): Promise<WorkflowState> {
  const workflow = await this.reader.loadWorkflow(projectRoot);
  if (!workflow) {
    throw new Error("workflow-state.json is missing after initialization");
  }
  this.assertValidWorkflow(workflow, { allowLegacyRunnerTypes: true });
  return workflow;
}

async loadSpecs(projectRoot: string): Promise<SpecDoc[]> {
  const specs = await this.reader.loadSpecs(projectRoot);
  specs.forEach((spec) => this.assertValidSpec(spec));
  return specs;
}

async loadRuns(projectRoot: string): Promise<RunRecord[]> {
  const runs = await this.reader.loadRuns(projectRoot);
  runs.forEach((runRecord) => this.assertValidRun(runRecord, { allowLegacyRunnerTypes: true }));
  return runs;
}

async loadRun(projectRoot: string, runId: string): Promise<RunRecord | null> {
  const runRecord = await this.reader.loadRun(projectRoot, runId);
  if (!runRecord) {
    return null;
  }
  this.assertValidRun(runRecord, { allowLegacyRunnerTypes: true });
  return runRecord;
}

async loadProgress(projectRoot: string): Promise<ProgressSummary | null> {
  return this.reader.loadProgress(projectRoot);
}

async loadSessions(projectRoot: string): Promise<SessionRecord[]> {
  return this.reader.loadSessions(projectRoot);
}
```

After existing writes, notify the reader:

```ts
await writeJsonFileAtomic(paths.workflowStatePath, workflow);
await this.reader.onWorkflowWritten?.(projectRoot, workflow);
```

```ts
await writeJsonFileAtomic(filePath, spec);
await this.reader.onSpecWritten?.(projectRoot, spec);
```

```ts
await writeJsonFileAtomic(filePath, runRecord);
await this.reader.onRunWritten?.(projectRoot, runRecord);
```

```ts
await writeJsonFileAtomic(paths.progressFilePath, progress);
await this.reader.onProgressWritten?.(projectRoot, progress);
```

- [ ] **Step 5: Verify no behavior change**

Run:

```bash
npm run test:unit -- test/unit/state/state-store.test.ts test/unit/state/workflow-reader.test.ts
npm run test:unit -- test/unit/autopilot/controller.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/workflow-reader.ts src/state/state-store.ts test/unit/state/workflow-reader.test.ts test/unit/state/state-store.test.ts
git commit -m "refactor: add workflow reader abstraction"
```

## Task 3: StateWatcher

**Files:**
- Create: `src/autopilot/state-watcher.ts`
- Modify: `src/lib/paths.ts`
- Create: `test/unit/autopilot/state-watcher.test.ts`

- [ ] **Step 1: Add watcher paths**

In `src/lib/paths.ts`, extend `SwarmPaths`:

```ts
autopilotDir: string;
autopilotWatcherSnapshotPath: string;
```

In `resolveSwarmPaths()`, set:

```ts
autopilotDir: path.join(swarmRoot, ".autopilot"),
autopilotWatcherSnapshotPath: path.join(swarmRoot, ".autopilot", "watcher.snapshot"),
```

- [ ] **Step 2: Write failing watcher tests**

Create `test/unit/autopilot/state-watcher.test.ts`:

```ts
import path from "node:path";
import { StateWatcher, type RawStateWatcherEvent } from "../../../src/autopilot/state-watcher.js";
import { resolveSwarmPaths } from "../../../src/lib/paths.js";

describe("StateWatcher", () => {
  it("maps raw state paths to normalized event kinds", () => {
    const paths = resolveSwarmPaths("<TEMP_DIR>/project", {});
    expect(StateWatcher.classifyPath(paths, paths.workflowStatePath)).toBe("workflow");
    expect(StateWatcher.classifyPath(paths, paths.autopilotStatePath)).toBe("autopilot");
    expect(StateWatcher.classifyPath(paths, paths.progressFilePath)).toBe("progress");
    expect(StateWatcher.classifyPath(paths, path.join(paths.runsDir, "run-1.json"))).toBe("run");
    expect(StateWatcher.classifyPath(paths, path.join(paths.specsDir, "spec-1.json"))).toBe("spec");
    expect(StateWatcher.classifyPath(paths, path.join(paths.sessionsDir, "session-1.json"))).toBe("session");
    expect(StateWatcher.classifyPath(paths, path.join(paths.logsDir, "autopilot-decisions.ndjson"))).toBeUndefined();
  });

  it("debounces raw events into one normalized change", async () => {
    vi.useFakeTimers();
    const paths = resolveSwarmPaths("<TEMP_DIR>/project", {});
    const watcher = new StateWatcher(paths, {
      debounceMs: 100,
      safetyResyncMs: 3600000,
      library: "node",
      ignoreInitial: true,
      useFsEventsCoalescing: false,
    });
    const changes: unknown[] = [];
    watcher.on("change", (event) => changes.push(event));

    const raw: RawStateWatcherEvent = { type: "update", path: path.join(paths.runsDir, "run-1.json") };
    watcher.pushRawEventsForTest([raw]);
    watcher.pushRawEventsForTest([raw]);
    await vi.advanceTimersByTimeAsync(100);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "run", paths: [raw.path], seq: 1 });
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run watcher tests and verify failure**

Run:

```bash
npm run test:unit -- test/unit/autopilot/state-watcher.test.ts
```

Expected: FAIL because `StateWatcher` does not exist.

- [ ] **Step 4: Implement watcher**

Create `src/autopilot/state-watcher.ts`:

```ts
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { SwarmAutopilotWatcherConfig } from "../config.js";
import { ensureDir } from "../lib/json-file.js";
import type { SwarmPaths } from "../lib/paths.js";

export type StateWatcherEventKind = "workflow" | "autopilot" | "progress" | "run" | "spec" | "session";
export type StateWatcherOperation = "create" | "update" | "delete";

export type StateWatcherEvent = {
  kind: StateWatcherEventKind;
  op: StateWatcherOperation;
  paths: string[];
  at: string;
  seq: number;
};

export type RawStateWatcherEvent = {
  type: string;
  path: string;
};

type ParcelWatcherModule = {
  subscribe(
    dir: string,
    callback: (err: Error | null, events: RawStateWatcherEvent[]) => void,
    opts?: Record<string, unknown>,
  ): Promise<{ unsubscribe(): Promise<void> }>;
  getEventsSince?(dir: string, snapshotPath: string): Promise<RawStateWatcherEvent[]>;
  writeSnapshot?(dir: string, snapshotPath: string): Promise<void>;
};

type NodeWatcherHandle = { close(): void };
type WatchSubscription = { unsubscribe(): Promise<void> };

export class StateWatcher extends EventEmitter {
  private subscriptions: WatchSubscription[] = [];
  private nodeWatchers: NodeWatcherHandle[] = [];
  private buffer = new Map<string, RawStateWatcherEvent>();
  private timer?: ReturnType<typeof setTimeout>;
  private seq = 0;
  private started = false;

  constructor(
    private readonly paths: SwarmPaths,
    private readonly config: Pick<
      SwarmAutopilotWatcherConfig,
      "debounceMs" | "safetyResyncMs" | "library" | "ignoreInitial" | "useFsEventsCoalescing"
    >,
  ) {
    super();
  }

  override on(event: "change", handler: (e: StateWatcherEvent) => void): this;
  override on(event: "error", handler: (err: Error, scope: string) => void): this;
  override on(event: string, handler: (...args: unknown[]) => void): this {
    return super.on(event, handler);
  }

  static classifyPath(paths: SwarmPaths, filePath: string): StateWatcherEventKind | undefined {
    const normalized = path.resolve(filePath);
    if (normalized === paths.workflowStatePath) return "workflow";
    if (normalized === paths.autopilotStatePath) return "autopilot";
    if (normalized === paths.progressFilePath) return "progress";
    if (normalized.startsWith(`${paths.runsDir}${path.sep}`) && normalized.endsWith(".json")) return "run";
    if (normalized.startsWith(`${paths.specsDir}${path.sep}`) && normalized.endsWith(".json")) return "spec";
    if (normalized.startsWith(`${paths.sessionsDir}${path.sep}`) && normalized.endsWith(".json")) return "session";
    return undefined;
  }

  lastSeq(): number {
    return this.seq;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await ensureDir(this.paths.autopilotDir);
    await this.replaySnapshot();

    if (this.config.library === "node") {
      await this.startNodeWatchers();
      return;
    }

    try {
      await this.startParcelWatcher();
    } catch (error) {
      if (this.config.library === "parcel") {
        throw error;
      }
      this.emit("error", error instanceof Error ? error : new Error(String(error)), this.paths.swarmRoot);
      await this.startNodeWatchers();
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await Promise.all(this.subscriptions.map((subscription) => subscription.unsubscribe()));
    this.subscriptions = [];
    this.nodeWatchers.forEach((watcher) => watcher.close());
    this.nodeWatchers = [];
    await this.writeSnapshot();
  }

  pushRawEventsForTest(events: RawStateWatcherEvent[]): void {
    this.pushRawEvents(events);
  }

  private async startParcelWatcher(): Promise<void> {
    const watcher = (await import("@parcel/watcher")) as ParcelWatcherModule;
    const subscription = await watcher.subscribe(
      this.paths.swarmRoot,
      (err, events) => {
        if (err) {
          this.emit("error", err, this.paths.swarmRoot);
          return;
        }
        this.pushRawEvents(events);
      },
      {
        ignore: [this.paths.autopilotDir],
        useFsEventsCoalescing: this.config.useFsEventsCoalescing,
      },
    );
    this.subscriptions.push(subscription);
  }

  private async startNodeWatchers(): Promise<void> {
    await Promise.all([
      ensureDir(this.paths.swarmRoot),
      ensureDir(this.paths.runsDir),
      ensureDir(this.paths.specsDir),
      ensureDir(this.paths.sessionsDir),
    ]);
    const dirs = [this.paths.swarmRoot, this.paths.runsDir, this.paths.specsDir, this.paths.sessionsDir];
    for (const dir of dirs) {
      const watcher = fs.watch(dir, { persistent: false }, (eventType, fileName) => {
        if (!fileName) return;
        const op = eventType === "rename" ? "update" : "update";
        this.pushRawEvents([{ type: op, path: path.join(dir, fileName.toString()) }]);
      });
      watcher.on("error", (err) => this.emit("error", err, dir));
      this.nodeWatchers.push(watcher);
    }
  }

  private async replaySnapshot(): Promise<void> {
    if (this.config.library === "node") return;
    const snapshotFresh = await this.isSnapshotFresh();
    if (!snapshotFresh) return;
    try {
      const watcher = (await import("@parcel/watcher")) as ParcelWatcherModule;
      const events = await watcher.getEventsSince?.(this.paths.swarmRoot, this.paths.autopilotWatcherSnapshotPath);
      if (events && events.length > 0) {
        this.pushRawEvents(events);
      }
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)), this.paths.autopilotWatcherSnapshotPath);
    }
  }

  private async writeSnapshot(): Promise<void> {
    if (this.config.library === "node") return;
    try {
      const watcher = (await import("@parcel/watcher")) as ParcelWatcherModule;
      await watcher.writeSnapshot?.(this.paths.swarmRoot, this.paths.autopilotWatcherSnapshotPath);
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)), this.paths.autopilotWatcherSnapshotPath);
    }
  }

  private async isSnapshotFresh(): Promise<boolean> {
    try {
      const stat = await fsp.stat(this.paths.autopilotWatcherSnapshotPath);
      return Date.now() - stat.mtimeMs <= this.config.safetyResyncMs;
    } catch {
      return false;
    }
  }

  private pushRawEvents(events: RawStateWatcherEvent[]): void {
    for (const event of events) {
      if (this.shouldIgnore(event.path)) continue;
      const kind = StateWatcher.classifyPath(this.paths, event.path);
      if (!kind) continue;
      this.buffer.set(path.resolve(event.path), event);
    }
    if (this.buffer.size === 0 || this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.config.debounceMs);
  }

  private flush(): void {
    this.timer = undefined;
    const grouped = new Map<string, string[]>();
    for (const event of this.buffer.values()) {
      const kind = StateWatcher.classifyPath(this.paths, event.path);
      if (!kind) continue;
      const existing = grouped.get(kind) ?? [];
      existing.push(path.resolve(event.path));
      grouped.set(kind, existing);
    }
    this.buffer.clear();
    for (const [kind, changedPaths] of grouped) {
      this.seq += 1;
      this.emit("change", {
        kind,
        op: "update",
        paths: Array.from(new Set(changedPaths)).sort(),
        at: new Date().toISOString(),
        seq: this.seq,
      } satisfies StateWatcherEvent);
    }
  }

  private shouldIgnore(filePath: string): boolean {
    const basename = path.basename(filePath);
    return (
      filePath.startsWith(this.paths.autopilotDir) ||
      basename.endsWith(".lock") ||
      basename.startsWith(".tmp") ||
      basename.startsWith(".~atomic-") ||
      basename.endsWith(".bak")
    );
  }
}
```

- [ ] **Step 5: Run watcher tests**

Run:

```bash
npm run test:unit -- test/unit/autopilot/state-watcher.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/autopilot/state-watcher.ts src/lib/paths.ts test/unit/autopilot/state-watcher.test.ts
git commit -m "feat: add autopilot state watcher"
```

## Task 4: StateCache

**Files:**
- Create: `src/state/state-cache.ts`
- Create: `test/unit/state/state-cache.test.ts`

- [ ] **Step 1: Write failing cache tests**

Create `test/unit/state/state-cache.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWorkflowReader } from "../../../src/state/workflow-reader.js";
import { StateCache } from "../../../src/state/state-cache.js";
import { StateStore, createEmptyWorkflowState } from "../../../src/state/state-store.js";
import type { RunRecord, WorkflowState } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-state-cache-"));
}

function runRecord(projectRoot: string, runId: string): RunRecord {
  return {
    runId,
    taskId: "task-1",
    attempt: 1,
    status: "completed",
    runner: { type: "manual" },
    workspacePath: projectRoot,
    startedAt: "2026-05-25T00:00:00.000Z",
    artifacts: [],
  };
}

describe("StateCache", () => {
  it("serves loadRuns from memory after warmup", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const fsReader = new FsWorkflowReader(stateStore.config, (root) => createEmptyWorkflowState(root, stateStore.config));
    const cache = new StateCache(fsReader);
    await stateStore.writeRun(projectRoot, runRecord(projectRoot, "run-1"));
    await cache.start(projectRoot);

    const paths = stateStore.resolvePaths(projectRoot);
    await fs.rename(path.join(paths.runsDir, "run-1.json"), path.join(paths.runsDir, "run-1.moved"));

    await expect(cache.loadRuns(projectRoot)).resolves.toEqual([runRecord(projectRoot, "run-1")]);
  });

  it("refreshes changed run files selectively", async () => {
    const projectRoot = await makeTempProject();
    const config = new StateStore().config;
    const writer = new StateStore(config);
    const cache = new StateCache(new FsWorkflowReader(config, (root) => createEmptyWorkflowState(root, config)));
    await writer.writeRun(projectRoot, runRecord(projectRoot, "run-1"));
    await cache.start(projectRoot);

    const updated = { ...runRecord(projectRoot, "run-1"), status: "failed" as const };
    await writer.writeRun(projectRoot, updated);
    await cache.applyChange({
      kind: "run",
      op: "update",
      paths: [path.join(writer.resolvePaths(projectRoot).runsDir, "run-1.json")],
      at: "2026-05-25T00:00:01.000Z",
      seq: 1,
    });

    await expect(cache.loadRuns(projectRoot)).resolves.toEqual([updated]);
  });
});
```

- [ ] **Step 2: Run cache tests and verify failure**

Run:

```bash
npm run test:unit -- test/unit/state/state-cache.test.ts
```

Expected: FAIL because `StateCache` does not exist.

- [ ] **Step 3: Implement StateCache**

Create `src/state/state-cache.ts`:

```ts
import path from "node:path";
import type { StateWatcherEvent } from "../autopilot/state-watcher.js";
import type { ProgressSummary, RunRecord, SessionRecord, SpecDoc, WorkflowState } from "../types.js";
import type { WorkflowReader } from "./workflow-reader.js";

function idFromJsonPath(filePath: string): string {
  return path.basename(filePath, ".json");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class StateCache implements WorkflowReader {
  private projectRoot?: string;
  private workflow?: WorkflowState;
  private progress: ProgressSummary | null = null;
  private specs = new Map<string, SpecDoc>();
  private runs = new Map<string, RunRecord>();
  private sessions = new Map<string, SessionRecord>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly reader: WorkflowReader) {}

  async start(projectRoot: string): Promise<void> {
    this.projectRoot = projectRoot;
    await this.reader.initProject(projectRoot);
    const [workflow, specs, runs, progress, sessions] = await Promise.all([
      this.reader.loadWorkflow(projectRoot),
      this.reader.loadSpecs(projectRoot),
      this.reader.loadRuns(projectRoot),
      this.reader.loadProgress(projectRoot),
      this.reader.loadSessions(projectRoot),
    ]);
    if (!workflow) {
      throw new Error("workflow-state.json is missing after initialization");
    }
    this.workflow = clone(workflow);
    this.specs = new Map(specs.map((spec) => [spec.specId, clone(spec)]));
    this.runs = new Map(runs.map((run) => [run.runId, clone(run)]));
    this.progress = progress ? clone(progress) : null;
    this.sessions = new Map(sessions.map((session) => [session.sessionId, clone(session)]));
  }

  async initProject(projectRoot: string) {
    return this.reader.initProject(projectRoot);
  }

  async applyChange(event: StateWatcherEvent): Promise<void> {
    this.queue = this.queue.then(() => this.refresh(event));
    await this.queue;
  }

  async loadWorkflow(projectRoot: string): Promise<WorkflowState | null> {
    this.assertProject(projectRoot);
    await this.queue;
    return this.workflow ? clone(this.workflow) : null;
  }

  async loadSpecs(projectRoot: string): Promise<SpecDoc[]> {
    this.assertProject(projectRoot);
    await this.queue;
    return Array.from(this.specs.values()).map(clone);
  }

  async loadRuns(projectRoot: string): Promise<RunRecord[]> {
    this.assertProject(projectRoot);
    await this.queue;
    return Array.from(this.runs.values()).map(clone);
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
    return Array.from(this.sessions.values()).map(clone);
  }

  async onWorkflowWritten(projectRoot: string, workflow: WorkflowState): Promise<void> {
    this.assertProject(projectRoot);
    this.workflow = clone(workflow);
  }

  async onSpecWritten(projectRoot: string, spec: SpecDoc): Promise<void> {
    this.assertProject(projectRoot);
    this.specs.set(spec.specId, clone(spec));
  }

  async onRunWritten(projectRoot: string, runRecord: RunRecord): Promise<void> {
    this.assertProject(projectRoot);
    this.runs.set(runRecord.runId, clone(runRecord));
  }

  async onProgressWritten(projectRoot: string, progress: ProgressSummary): Promise<void> {
    this.assertProject(projectRoot);
    this.progress = clone(progress);
  }

  private async refresh(event: StateWatcherEvent): Promise<void> {
    if (!this.projectRoot) {
      throw new Error("StateCache has not been started");
    }
    if (event.kind === "workflow") {
      const workflow = await this.reader.loadWorkflow(this.projectRoot);
      this.workflow = workflow ? clone(workflow) : undefined;
      return;
    }
    if (event.kind === "progress") {
      const progress = await this.reader.loadProgress(this.projectRoot);
      this.progress = progress ? clone(progress) : null;
      return;
    }
    if (event.kind === "spec") {
      for (const filePath of event.paths) {
        const specId = idFromJsonPath(filePath);
        const specs = await this.reader.loadSpecs(this.projectRoot);
        const spec = specs.find((entry) => entry.specId === specId);
        if (spec) this.specs.set(specId, clone(spec));
        else this.specs.delete(specId);
      }
      return;
    }
    if (event.kind === "run") {
      for (const filePath of event.paths) {
        const runId = idFromJsonPath(filePath);
        const run = await this.reader.loadRun(this.projectRoot, runId);
        if (run) this.runs.set(runId, clone(run));
        else this.runs.delete(runId);
      }
      return;
    }
    if (event.kind === "session") {
      const sessions = await this.reader.loadSessions(this.projectRoot);
      this.sessions = new Map(sessions.map((session) => [session.sessionId, clone(session)]));
    }
  }

  private assertProject(projectRoot: string): void {
    if (!this.projectRoot) {
      throw new Error("StateCache has not been started");
    }
    if (path.resolve(projectRoot) !== path.resolve(this.projectRoot)) {
      throw new Error(`StateCache is bound to ${this.projectRoot}, not ${projectRoot}`);
    }
  }
}
```

- [ ] **Step 4: Run cache tests**

Run:

```bash
npm run test:unit -- test/unit/state/state-cache.test.ts
npm run test:unit -- test/unit/state/state-store.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/state-cache.ts test/unit/state/state-cache.test.ts
git commit -m "feat: add autopilot state cache"
```

## Task 5: Tick Source Metadata

**Files:**
- Modify: `src/autopilot/types.ts`
- Modify: `src/autopilot/controller.ts`
- Modify: `src/autopilot/metrics.ts`
- Modify: `test/unit/autopilot/controller.test.ts`
- Modify: `test/unit/autopilot/metrics.test.ts`

- [ ] **Step 1: Write failing tick source tests**

Add to `test/unit/autopilot/controller.test.ts`:

```ts
it("persists tick source metadata", async () => {
  const projectRoot = await makeTempProject();
  const stateStore = new StateStore(enabledAutopilotConfig);
  const autopilotStore = new AutopilotStore(stateStore.config);
  await seedWorkflow(projectRoot, stateStore);

  const controller = new AutopilotController(stateStore, autopilotStore);
  const result = await controller.tick({ projectRoot, source: "watcher" });

  expect(result.decision.source).toBe("watcher");
  expect(result.autopilot.metrics.tickSourceCount).toEqual({
    manual: 0,
    polling: 0,
    watcher: 1,
    safety: 0,
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm run test:unit -- test/unit/autopilot/controller.test.ts
```

Expected: FAIL because `source` and `tickSourceCount` do not exist.

- [ ] **Step 3: Add tick source types**

In `src/autopilot/types.ts`:

```ts
export type AutopilotTickSource = "manual" | "polling" | "watcher" | "safety";
```

Extend `AutopilotDecision`:

```ts
source?: AutopilotTickSource;
```

Extend `AutopilotMetrics`:

```ts
tickSourceCount: Record<AutopilotTickSource, number>;
```

Add default metrics:

```ts
tickSourceCount: {
  manual: 0,
  polling: 0,
  watcher: 0,
  safety: 0,
},
```

- [ ] **Step 4: Persist source in controller**

In `src/autopilot/controller.ts`, change input type:

```ts
export type AutopilotTickInput = {
  projectRoot: string;
  dryRun?: boolean;
  source?: AutopilotTickSource;
};
```

Set source near the top of `tick()`:

```ts
const source = input.source ?? "manual";
```

Add source to the initial decision:

```ts
source,
```

In `persistTickState()`, increment source count:

```ts
tickSourceCount: {
  ...current.metrics.tickSourceCount,
  [decision.source ?? "manual"]: current.metrics.tickSourceCount[decision.source ?? "manual"] + 1,
},
```

In `AutopilotStore.loadState()`, ensure old state files get default source counts through the existing metrics merge.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm run test:unit -- test/unit/autopilot/controller.test.ts test/unit/autopilot/metrics.test.ts
npm run build
```

Expected: PASS.

Commit:

```bash
git add src/autopilot/types.ts src/autopilot/controller.ts src/autopilot/metrics.ts test/unit/autopilot/controller.test.ts test/unit/autopilot/metrics.test.ts
git commit -m "feat: record autopilot tick source"
```

## Task 6: Reactive Service Loop

**Files:**
- Modify: `src/autopilot/service-loop.ts`
- Modify: `test/unit/autopilot/service-loop.test.ts`

- [ ] **Step 1: Write failing reactive loop tests**

Add to `test/unit/autopilot/service-loop.test.ts`:

```ts
it("runs a watcher-triggered tick after debounce without polling first", async () => {
  vi.useFakeTimers();
  const projectRoot = await makeTempProject();
  const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
  const controller = {
    tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "watcher" }),
  };
  const watcher = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(function (this: any, event: string, handler: (event: unknown) => void) {
      this.handler = handler;
      return this;
    }),
  };
  const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
    mode: "watch",
    pollingIntervalMs: 1000,
    debounceMs: 100,
    safetyTickMs: 300000,
    watcher: watcher as any,
  });

  await loop.start(projectRoot);
  expect(controller.tick).toHaveBeenCalledTimes(0);
  watcher.handler({ kind: "run", paths: [], at: "2026-05-25T00:00:00.000Z", seq: 1 });
  await vi.advanceTimersByTimeAsync(99);
  expect(controller.tick).toHaveBeenCalledTimes(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(controller.tick).toHaveBeenCalledWith({ projectRoot, source: "watcher" });

  await loop.stop();
});
```

Add a non-reentrant follow-up test:

```ts
it("queues one follow-up tick when watcher events arrive during an in-flight tick", async () => {
  vi.useFakeTimers();
  const projectRoot = await makeTempProject();
  const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
  const firstTick = createDeferred();
  const controller = {
    tick: vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstTick.promise;
        return { ok: true, action: "observe", summary: "first" };
      })
      .mockResolvedValue({ ok: true, action: "observe", summary: "next" }),
  };
  const watcher = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(function (this: any, _event: string, handler: (event: unknown) => void) {
      this.handler = handler;
      return this;
    }),
  };
  const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
    mode: "watch",
    pollingIntervalMs: 1000,
    debounceMs: 100,
    safetyTickMs: 300000,
    watcher: watcher as any,
  });

  await loop.start(projectRoot);
  watcher.handler({ kind: "run", paths: [], at: "2026-05-25T00:00:00.000Z", seq: 1 });
  await vi.advanceTimersByTimeAsync(100);
  watcher.handler({ kind: "run", paths: [], at: "2026-05-25T00:00:00.100Z", seq: 2 });
  watcher.handler({ kind: "workflow", paths: [], at: "2026-05-25T00:00:00.101Z", seq: 3 });
  await vi.advanceTimersByTimeAsync(100);
  expect(controller.tick).toHaveBeenCalledTimes(1);

  firstTick.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.tick).toHaveBeenCalledTimes(2);

  await loop.stop();
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm run test:unit -- test/unit/autopilot/service-loop.test.ts
```

Expected: FAIL because the constructor only accepts `intervalMs` and has no watcher mode.

- [ ] **Step 3: Implement loop options**

In `src/autopilot/service-loop.ts`, replace the numeric interval constructor parameter with:

```ts
export type AutopilotServiceLoopMode = "polling" | "watch" | "hybrid";

export type AutopilotServiceLoopOptions = {
  mode: AutopilotServiceLoopMode;
  pollingIntervalMs: number;
  debounceMs: number;
  safetyTickMs: number;
  watcher?: {
    start(): Promise<void>;
    stop(): Promise<void>;
    on(event: "change", handler: () => void): unknown;
    on(event: "error", handler: (error: Error, scope: string) => void): unknown;
  };
};
```

Update state:

```ts
private pollingTimer?: TimerHandle;
private safetyTimer?: TimerHandle;
private debounceTimer?: TimerHandle;
private followUpSource?: AutopilotTickSource;
```

Make start async:

```ts
async start(projectRoot: string): Promise<void> {
  if (this.running) return;
  this.running = true;
  this.projectRoot = projectRoot;
  if (this.options.mode === "polling") {
    this.schedulePolling(0);
    return;
  }
  if (!this.options.watcher) {
    throw new Error(`autopilot watcherMode=${this.options.mode} requires a StateWatcher`);
  }
  this.options.watcher.on("change", () => this.trigger("watcher"));
  this.options.watcher.on("error", (error, scope) => {
    this.logger?.warn?.(`[swarm-autopilot] watcher error scope=${scope}: ${error.message}`);
    this.trigger("safety");
  });
  await this.options.watcher.start();
  this.scheduleSafety(this.options.safetyTickMs);
  if (this.options.mode === "hybrid") {
    this.schedulePolling(this.options.pollingIntervalMs * 5);
  }
}
```

Implement trigger and run source:

```ts
private trigger(source: AutopilotTickSource): void {
  if (!this.running || !this.projectRoot) return;
  if (this.debounceTimer) return;
  this.debounceTimer = this.scheduler.setTimeout(() => {
    this.debounceTimer = undefined;
    void this.runOnce(source);
  }, this.options.debounceMs);
}

private async runOnce(source: AutopilotTickSource): Promise<void> {
  if (!this.running || !this.projectRoot) return;
  if (this.inFlight) {
    this.followUpSource = source;
    return;
  }
  const projectRoot = this.projectRoot;
  this.inFlight = this.executeTick(projectRoot, source)
    .catch(async (error) => {
      await this.recordFailure(projectRoot, error, source);
    })
    .finally(() => {
      this.inFlight = undefined;
      const followUpSource = this.followUpSource;
      this.followUpSource = undefined;
      if (this.running && followUpSource) {
        this.trigger(followUpSource);
      }
    });
  await this.inFlight;
}
```

Keep polling scheduling only for polling/hybrid:

```ts
private schedulePolling(delayMs: number): void {
  if (!this.running || !this.projectRoot) return;
  this.pollingTimer = this.scheduler.setTimeout(() => {
    void this.runOnce("polling").finally(() => {
      if (this.running && (this.options.mode === "polling" || this.options.mode === "hybrid")) {
        this.schedulePolling(this.options.mode === "hybrid" ? this.options.pollingIntervalMs * 5 : this.options.pollingIntervalMs);
      }
    });
  }, delayMs);
}

private scheduleSafety(delayMs: number): void {
  if (!this.running || !this.projectRoot || this.options.mode === "polling") return;
  this.safetyTimer = this.scheduler.setTimeout(() => {
    void this.runOnce("safety").finally(() => {
      if (this.running && this.options.mode !== "polling") {
        this.scheduleSafety(this.options.safetyTickMs);
      }
    });
  }, delayMs);
}
```

Update `executeTick()`:

```ts
private async executeTick(projectRoot: string, source: AutopilotTickSource): Promise<void> {
  const result = await this.controller.tick({ projectRoot, source });
  this.logger?.info?.(
    `[swarm-autopilot] tick source=${source} action=${result.action} project=${projectRoot} summary=${result.summary}`,
  );
}
```

Update `stop()` to clear all timers and stop watcher:

```ts
for (const timer of [this.pollingTimer, this.safetyTimer, this.debounceTimer]) {
  if (timer) this.scheduler.clearTimeout(timer);
}
this.pollingTimer = undefined;
this.safetyTimer = undefined;
this.debounceTimer = undefined;
await this.inFlight;
await this.options.watcher?.stop();
```

- [ ] **Step 4: Update existing tests**

Change existing constructor calls from:

```ts
new AutopilotServiceLoop(controller as any, autopilotStore, 1000)
```

to:

```ts
new AutopilotServiceLoop(controller as any, autopilotStore, {
  mode: "polling",
  pollingIntervalMs: 1000,
  debounceMs: 0,
  safetyTickMs: 300000,
})
```

Change `loop.start(projectRoot);` to `await loop.start(projectRoot);`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm run test:unit -- test/unit/autopilot/service-loop.test.ts
npm run build
```

Expected: PASS.

Commit:

```bash
git add src/autopilot/service-loop.ts test/unit/autopilot/service-loop.test.ts
git commit -m "feat: add reactive autopilot service loop"
```

## Task 7: Service Wiring

**Files:**
- Modify: `src/services/orchestrator.ts`
- Modify: `test/unit/services/swarm-service.test.ts`

- [ ] **Step 1: Write failing service wiring tests**

In `test/unit/services/swarm-service.test.ts`, add a test that asserts watcher config is passed to the loop:

```ts
it("creates watcher mode service loops with configured mode", async () => {
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  const createLoop = vi.fn(() => ({ start, stop }));
  const service = createSwarmService(
    {
      autopilot: {
        ...enabledAutopilotConfig.autopilot,
        watcherMode: "hybrid",
        watcher: {
          debounceMs: 50,
          safetyTickMs: 120000,
          safetyResyncMs: 3600000,
          library: "node",
          ignoreInitial: true,
          useFsEventsCoalescing: false,
        },
      },
    },
    "2026.5.3-1",
    { createLoop },
  );

  await service.start({
    workspaceDir: "<TEMP_DIR>/project",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as any);

  expect(createLoop).toHaveBeenCalledWith(expect.objectContaining({
    stateStore: expect.any(StateStore),
    autopilotStore: expect.any(AutopilotStore),
    loopOptions: expect.objectContaining({
      mode: "hybrid",
      debounceMs: 50,
      safetyTickMs: 120000,
    }),
  }));
  expect(start).toHaveBeenCalledWith("<TEMP_DIR>/project");
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm run test:unit -- test/unit/services/swarm-service.test.ts
```

Expected: FAIL because `loopOptions` is not passed and watcher/cache are not wired.

- [ ] **Step 3: Extend service deps**

In `src/services/orchestrator.ts`, change `SwarmServiceLoopLike`:

```ts
type SwarmServiceLoopLike = {
  start(projectRoot: string): Promise<void>;
  stop(): Promise<void>;
};
```

Extend `createLoop` deps:

```ts
loopOptions: AutopilotServiceLoopOptions;
```

- [ ] **Step 4: Wire cache and watcher**

Add imports:

```ts
import { StateWatcher } from "../autopilot/state-watcher.js";
import { FsWorkflowReader } from "../state/workflow-reader.js";
import { StateCache } from "../state/state-cache.js";
import { createEmptyWorkflowState } from "../state/state-store.js";
```

Inside service start, replace current store construction with:

```ts
const resolvedConfig = resolveSwarmPluginConfig(config);
const baseReader = new FsWorkflowReader(resolvedConfig, (root) =>
  createEmptyWorkflowState(root, resolvedConfig, { runtimeVersion }),
);
let stateReader: WorkflowReader | undefined;
let watcher: StateWatcher | undefined;

if (resolvedConfig.autopilot.watcherMode !== "polling") {
  const tempStore = new StateStore(resolvedConfig, { runtimeVersion });
  const paths = tempStore.resolvePaths(projectRoot);
  const cache = new StateCache(baseReader);
  await cache.start(projectRoot);
  watcher = new StateWatcher(paths, resolvedConfig.autopilot.watcher);
  watcher.on("change", (event) => void cache.applyChange(event));
  stateReader = cache;
}

const stateStore = new StateStore(resolvedConfig, { runtimeVersion }, stateReader);
const autopilotStore = new AutopilotStore(stateStore.config);
const loopOptions: AutopilotServiceLoopOptions = {
  mode: stateStore.config.autopilot.watcherMode,
  pollingIntervalMs: stateStore.config.autopilot.tickSeconds * 1000,
  debounceMs: stateStore.config.autopilot.watcher.debounceMs,
  safetyTickMs: stateStore.config.autopilot.watcher.safetyTickMs,
  watcher,
};
```

Create loop:

```ts
loop =
  deps?.createLoop?.({ stateStore, autopilotStore, logger: ctx.logger, sessionAdapter, loopOptions }) ??
  new AutopilotServiceLoop(
    new AutopilotController(stateStore, autopilotStore, createOrchestrator({ stateStore, sessionAdapter })),
    autopilotStore,
    loopOptions,
    ctx.logger,
  );
await loop.start(projectRoot);
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm run test:unit -- test/unit/services/swarm-service.test.ts test/unit/autopilot/service-loop.test.ts
npm run build
```

Expected: PASS.

Commit:

```bash
git add src/services/orchestrator.ts test/unit/services/swarm-service.test.ts
git commit -m "feat: wire watcher mode into swarm service"
```

## Task 8: End-To-End Watcher Test

**Files:**
- Create: `test/e2e/autopilot-fs-watcher.e2e.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write real filesystem e2e**

Create `test/e2e/autopilot-fs-watcher.e2e.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutopilotServiceLoop } from "../../src/autopilot/service-loop.js";
import { StateWatcher } from "../../src/autopilot/state-watcher.js";
import { AutopilotStore } from "../../src/autopilot/autopilot-store.js";
import { StateCache } from "../../src/state/state-cache.js";
import { StateStore } from "../../src/state/state-store.js";
import { FsWorkflowReader } from "../../src/state/workflow-reader.js";
import type { RunRecord } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-fs-watcher-e2e-"));
}

function makeRun(projectRoot: string, runId: string): RunRecord {
  return {
    runId,
    taskId: "task-1",
    attempt: 1,
    status: "completed",
    runner: { type: "manual" },
    workspacePath: projectRoot,
    startedAt: new Date().toISOString(),
    artifacts: [],
  };
}

describe("e2e: autopilot filesystem watcher", () => {
  it("invokes one watcher tick after a run file is written", async () => {
    const projectRoot = await makeTempProject();
    const config = {
      autopilot: {
        enabled: true,
        watcherMode: "watch" as const,
        watcher: {
          debounceMs: 50,
          safetyTickMs: 300000,
          safetyResyncMs: 3600000,
          library: "node" as const,
          ignoreInitial: true,
          useFsEventsCoalescing: false,
        },
      },
    };
    const baseStore = new StateStore(config);
    await baseStore.initProject(projectRoot);
    const cache = new StateCache(new FsWorkflowReader(baseStore.config, (root) => ({
      version: 1,
      projectRoot: root,
      lifecycle: "idle",
      tasks: [],
      reviewQueue: [],
    })));
    await cache.start(projectRoot);
    const paths = baseStore.resolvePaths(projectRoot);
    const watcher = new StateWatcher(paths, baseStore.config.autopilot.watcher);
    watcher.on("change", (event) => void cache.applyChange(event));
    const stateStore = new StateStore(baseStore.config, undefined, cache);
    const autopilotStore = new AutopilotStore(stateStore.config);
    const controller = {
      tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "watched" }),
    };
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "watch",
      pollingIntervalMs: 1000,
      debounceMs: 50,
      safetyTickMs: 300000,
      watcher,
    });

    await loop.start(projectRoot);
    const started = performance.now();
    const newRun = makeRun(projectRoot, "run-watch-1");
    await baseStore.writeRun(projectRoot, newRun);

    await vi.waitFor(() => {
      expect(controller.tick).toHaveBeenCalledWith({ projectRoot, source: "watcher" });
    }, { timeout: 1000, interval: 20 });

    expect(performance.now() - started).toBeLessThan(1000);
    await expect(stateStore.loadRuns(projectRoot)).resolves.toContainEqual(newRun);
    await loop.stop();
  });
});
```

- [ ] **Step 2: Run e2e**

Run:

```bash
npm run test:e2e -- test/e2e/autopilot-fs-watcher.e2e.test.ts
```

Expected: PASS with watcher tick within 1000 ms.

- [ ] **Step 3: Run broader safety tests**

Run:

```bash
npm run test:unit
npm run test:e2e -- test/e2e/autopilot-fs-watcher.e2e.test.ts test/e2e/autopilot-status.e2e.test.ts test/e2e/autopilot-control.e2e.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/autopilot-fs-watcher.e2e.test.ts package.json
git commit -m "test: cover autopilot watcher loop"
```

## Task 9: Smoke And Performance Harness

**Files:**
- Create: `scripts/autopilot-fs-watcher-smoke.mjs`
- Modify: `package.json`
- Modify: `docs/operator-runbook.md`

- [ ] **Step 1: Create smoke script**

Create `scripts/autopilot-fs-watcher-smoke.mjs`:

```js
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { AutopilotServiceLoop } from "../dist/src/autopilot/service-loop.js";
import { StateWatcher } from "../dist/src/autopilot/state-watcher.js";
import { AutopilotStore } from "../dist/src/autopilot/autopilot-store.js";
import { StateCache } from "../dist/src/state/state-cache.js";
import { StateStore } from "../dist/src/state/state-store.js";
import { FsWorkflowReader } from "../dist/src/state/workflow-reader.js";

const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-watcher-smoke-"));
const config = {
  autopilot: {
    enabled: true,
    watcherMode: "watch",
    watcher: {
      debounceMs: 50,
      safetyTickMs: 300000,
      safetyResyncMs: 3600000,
      library: process.env.SWARM_WATCHER_LIBRARY === "parcel" ? "parcel" : "node",
      ignoreInitial: true,
      useFsEventsCoalescing: false,
    },
  },
};

const writerStore = new StateStore(config);
await writerStore.initProject(projectRoot);

for (let i = 0; i < 1000; i += 1) {
  await writerStore.writeRun(projectRoot, {
    runId: `history-${i}`,
    taskId: `task-${i}`,
    attempt: 1,
    status: "completed",
    runner: { type: "manual" },
    workspacePath: projectRoot,
    startedAt: "2026-05-25T00:00:00.000Z",
    artifacts: [],
  });
}

const cache = new StateCache(new FsWorkflowReader(writerStore.config, (root) => ({
  version: 1,
  projectRoot: root,
  lifecycle: "idle",
  tasks: [],
  reviewQueue: [],
})));
await cache.start(projectRoot);
const paths = writerStore.resolvePaths(projectRoot);
const watcher = new StateWatcher(paths, writerStore.config.autopilot.watcher);
watcher.on("change", (event) => void cache.applyChange(event));
const stateStore = new StateStore(writerStore.config, undefined, cache);
const autopilotStore = new AutopilotStore(stateStore.config);

let tickResolve;
const ticked = new Promise((resolve) => {
  tickResolve = resolve;
});
const controller = {
  async tick(input) {
    tickResolve(input);
    return { ok: true, action: "observe", summary: "smoke tick" };
  },
};

const loop = new AutopilotServiceLoop(controller, autopilotStore, {
  mode: "watch",
  pollingIntervalMs: 1000,
  debounceMs: 50,
  safetyTickMs: 300000,
  watcher,
});

await loop.start(projectRoot);
const start = performance.now();
await writerStore.writeRun(projectRoot, {
  runId: "smoke-new-run",
  taskId: "task-smoke",
  attempt: 1,
  status: "completed",
  runner: { type: "manual" },
  workspacePath: projectRoot,
  startedAt: new Date().toISOString(),
  artifacts: [],
});

const timeout = new Promise((_, reject) => {
  setTimeout(() => reject(new Error("watcher tick timeout")), 1000);
});
const tickInput = await Promise.race([ticked, timeout]);
const latencyMs = performance.now() - start;
const runs = await stateStore.loadRuns(projectRoot);
await loop.stop();

if (tickInput.source !== "watcher") {
  throw new Error(`expected watcher source, got ${tickInput.source}`);
}
if (!runs.some((run) => run.runId === "smoke-new-run")) {
  throw new Error("cache did not observe smoke-new-run");
}
if (latencyMs > 500) {
  throw new Error(`watcher latency ${Math.round(latencyMs)}ms exceeded 500ms`);
}

console.log(JSON.stringify({
  ok: true,
  projectRoot,
  watcherLibrary: writerStore.config.autopilot.watcher.library,
  latencyMs: Math.round(latencyMs),
  runCount: runs.length,
}));
```

- [ ] **Step 2: Add package script**

In `package.json` scripts:

```json
"smoke:autopilot-watcher": "npm run build && node ./scripts/autopilot-fs-watcher-smoke.mjs"
```

- [ ] **Step 3: Run smoke locally**

Run:

```bash
npm run smoke:autopilot-watcher
SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher
```

Expected: both commands print JSON with `"ok":true` and `latencyMs <= 500`.

- [ ] **Step 4: Document operator runbook**

Add this to `docs/operator-runbook.md`:

````md
## Autopilot Watcher Smoke

Local:

```bash
npm run smoke:autopilot-watcher
SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher
```

Remote staging host:

```bash
rsync -a --exclude node_modules --exclude dist --exclude .git /path/to/openclaw-swarm-layer/ <remote-host>:/path/to/openclaw-swarm-layer-fs-watcher-smoke/
ssh <remote-host> 'export PATH=/path/to/node/bin:/usr/local/bin:/usr/bin:/bin; cd /path/to/openclaw-swarm-layer-fs-watcher-smoke && npm ci && npm run smoke:autopilot-watcher && SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher'
```

Rollback:

```jsonc
{
  "autopilot": {
    "watcherMode": "polling"
  }
}
```
````

- [ ] **Step 5: Commit**

Run:

```bash
npm run smoke:autopilot-watcher
npm run build
```

Expected: PASS.

Commit:

```bash
git add scripts/autopilot-fs-watcher-smoke.mjs package.json docs/operator-runbook.md
git commit -m "chore: add autopilot watcher smoke harness"
```

## Task 10: Remote Staging Runtime Smoke

**Files:**
- No source files unless smoke discovers a host-specific bug.

- [ ] **Step 1: Sync to remote staging**

Run from local repo:

```bash
rsync -a --exclude node_modules --exclude dist --exclude .git /path/to/openclaw-swarm-layer/ <remote-host>:/path/to/openclaw-swarm-layer-fs-watcher-smoke/
```

Expected: staging directory on the remote host mirrors the local working tree.

- [ ] **Step 2: Build and run smoke on the remote host**

Run:

```bash
ssh <remote-host> 'export PATH=/path/to/node/bin:/usr/local/bin:/usr/bin:/bin; cd /path/to/openclaw-swarm-layer-fs-watcher-smoke && npm ci && npm run build && npm run test:unit -- test/unit/autopilot/state-watcher.test.ts test/unit/state/state-cache.test.ts test/unit/autopilot/service-loop.test.ts && npm run smoke:autopilot-watcher && SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher'
```

Expected:
- Unit tests pass.
- Node watcher smoke prints `"ok":true`.
- Parcel watcher smoke prints `"ok":true`.
- Both report `latencyMs <= 500`.

- [ ] **Step 3: Optional gateway smoke in production profile**

Only run this after the staged smoke passes:

```bash
ssh <remote-host> 'export PATH=/path/to/node/bin:/usr/local/bin:/usr/bin:/bin; openclaw status --deep'
```

Record current gateway PID and CPU. Then verify that the production plugin entry points at the expected deployment checkout; if it does not, stop here and keep the staging smoke as the remote validation. If it does, sync the local branch into that repo only after making a git commit in the local repo and a backup branch on the remote host:

```bash
ssh <remote-host> 'cd /path/to/openclaw-swarm-layer && git status --short && git branch backup/autopilot-fs-watcher-before-smoke'
rsync -a --exclude node_modules --exclude dist --exclude .git /path/to/openclaw-swarm-layer/ <remote-host>:/path/to/openclaw-swarm-layer/
ssh <remote-host> 'export PATH=/path/to/node/bin:/usr/local/bin:/usr/bin:/bin; cd /path/to/openclaw-swarm-layer && npm ci && npm run build'
```

Then set:

```jsonc
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "autopilot": {
            "enabled": true,
            "watcherMode": "hybrid",
            "watcher": {
              "debounceMs": 100,
              "safetyTickMs": 300000,
              "library": "parcel"
            }
          }
        }
      }
    }
  }
}
```

Then run:

```bash
ssh <remote-host> 'export PATH=/path/to/node/bin:/usr/local/bin:/usr/bin:/bin; openclaw status --deep'
ssh <remote-host> 'export PATH=/path/to/node/bin:/usr/local/bin:/usr/bin:/bin; openclaw swarm autopilot status --project /path/to/openclaw-swarm-layer --json'
```

Expected:
- Gateway CPU remains below 1 percent while idle for 10 minutes.
- `autopilot.tick.source` or persisted decision `source` shows watcher or safety ticks.
- If any WebSocket disconnects or CPU spikes return, immediately set `watcherMode` back to `polling`.

- [ ] **Step 4: Capture smoke evidence**

Paste these into the implementation PR or release note:

```text
Local unit/build:
npm run test:unit
npm run build

Local smoke:
npm run smoke:autopilot-watcher
SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher

Remote staging:
npm run smoke:autopilot-watcher
SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher

Remote runtime:
openclaw status --deep before/after, gateway PID, idle CPU after 10 minutes
```

## Task 11: Final Verification

**Files:**
- Modify only if previous tasks found bugs.

- [ ] **Step 1: Full local gate**

Run:

```bash
npm run build
npm run test:unit
npm run test:e2e
npm run smoke:autopilot-watcher
SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher
```

Expected: PASS.

- [ ] **Step 2: Inspect bundle contents**

Run:

```bash
npm pack --dry-run
```

Expected:
- `dist/src/autopilot/state-watcher.js` is included.
- `dist/src/state/state-cache.js` is included.
- `dist/src/state/workflow-reader.js` is included.
- No smoke temp files are included.

- [ ] **Step 3: Rollback check**

Run a quick polling-mode unit check:

```bash
npm run test:unit -- test/unit/autopilot/service-loop.test.ts test/unit/services/swarm-service.test.ts
```

Expected:
- Existing polling service-loop behavior still passes.
- `watcherMode: "polling"` does not instantiate or start a watcher.

- [ ] **Step 4: Commit final docs and release note**

Create `docs/release-notes/v0.5.4.md`:

```md
# v0.5.4

## Added

- Added `autopilot.watcherMode` with `polling`, `watch`, and `hybrid`.
- Added event-driven autopilot state watching and cached workflow reads.
- Added watcher source metadata to autopilot decisions and metrics.

## Operational Notes

- Default remains `polling`.
- Set `autopilot.watcherMode = "hybrid"` for preview rollout.
- Roll back with `autopilot.watcherMode = "polling"`.
```

Commit:

```bash
git add docs/release-notes/v0.5.4.md
git commit -m "docs: document autopilot watcher release notes"
```

## Self-Review

- Spec coverage: The plan covers config flag, watcher, cache, reactive loop, snapshot path, tests, rollback, observability through tick source, local development, and remote staging smoke. Phase 2-4 default flips are intentionally not included as code tasks; they require dogfooding data after this implementation lands.
- Placeholder scan: No unresolved placeholders remain.
- Type consistency: `AutopilotTickSource`, `StateWatcherEvent`, `WorkflowReader`, `StateCache`, and `AutopilotServiceLoopOptions` are introduced before later tasks reference them.
- Risk callout: `StateCache.refresh()` for specs currently reloads all specs for one spec event. This is acceptable because the observed incident is in historical runs; if specs become large, add `loadSpec(projectRoot, specId)` in a follow-up.
