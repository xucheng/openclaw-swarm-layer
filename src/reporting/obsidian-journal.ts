import fs from "node:fs/promises";
import path from "node:path";
import type { ObsidianJournalConfig } from "../config.js";
import { ensureDir } from "../lib/json-file.js";
import type { SwarmPaths } from "../lib/paths.js";
import type { RunRecord, SpecDoc, WorkflowState } from "../types.js";

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function ensureTableFile(filePath: string, header: string, columns: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, `# ${header}\n\n${columns}\n`, "utf8");
  }
}

async function appendToFile(filePath: string, line: string): Promise<void> {
  await fs.appendFile(filePath, `${line}\n`, "utf8");
}

/**
 * Write to local path first, then async-mirror to Obsidian if configured.
 * Local write is synchronous (awaited). Obsidian write is fire-and-forget.
 */
async function dualWrite(
  localPath: string,
  obsidianPath: string | undefined,
  content: string,
  init: { header: string; columns: string },
): Promise<void> {
  // Local: always write
  await ensureTableFile(localPath, init.header, init.columns);
  await appendToFile(localPath, content);

  // Obsidian: async mirror (fire-and-forget)
  if (obsidianPath) {
    ensureTableFile(obsidianPath, init.header, init.columns)
      .then(() => appendToFile(obsidianPath, content))
      .catch(() => {});
  }
}

async function dualWriteFile(
  localPath: string,
  obsidianPath: string | undefined,
  content: string,
): Promise<void> {
  await ensureDir(path.dirname(localPath));
  await fs.writeFile(localPath, content, "utf8");

  if (obsidianPath) {
    ensureDir(path.dirname(obsidianPath))
      .then(() => fs.writeFile(obsidianPath, content, "utf8"))
      .catch(() => {});
  }
}

// --- Run Log ---

export async function journalRunEntry(
  paths: SwarmPaths,
  journal: ObsidianJournalConfig,
  runRecord: RunRecord,
): Promise<void> {
  if (!journal.enableRunLog) return;

  const line = `| ${timestamp()} | \`${runRecord.runId}\` | ${runRecord.taskId} | ${runRecord.runner.type} | ${runRecord.status} | ${runRecord.resultSummary?.slice(0, 80) ?? ""} |`;
  const init = {
    header: "Run Log",
    columns: "| Time | Run ID | Task | Runner | Status | Summary |\n|------|--------|------|--------|--------|---------|",
  };

  await dualWrite(paths.localRunLogPath, paths.obsidianRunLogPath, line, init);
}

// --- Review Log ---

export async function journalReviewEntry(
  paths: SwarmPaths,
  journal: ObsidianJournalConfig,
  taskId: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<void> {
  if (!journal.enableReviewLog) return;

  const noteText = note ?? "";
  const line = `| ${timestamp()} | ${taskId} | **${decision}** | ${noteText} |`;
  const init = {
    header: "Review Log",
    columns: "| Time | Task | Decision | Note |\n|------|------|----------|------|",
  };

  await dualWrite(paths.localReviewLogPath, paths.obsidianReviewLogPath, line, init);
}

// --- Spec Archive ---

export async function journalSpecArchive(
  paths: SwarmPaths,
  journal: ObsidianJournalConfig,
  spec: SpecDoc,
): Promise<void> {
  if (!journal.enableSpecArchive) return;

  const content = [
    `# ${spec.title}`,
    ``,
    `> Archived from \`${path.basename(spec.sourcePath)}\` at ${timestamp()}`,
    ``,
    `## Goals`,
    ...spec.goals.map((g) => `- ${g}`),
    ``,
    ...(spec.constraints.length > 0
      ? [`## Constraints`, ...spec.constraints.map((c) => `- ${c}`), ``]
      : []),
    ...(spec.acceptanceCriteria.length > 0
      ? [`## Acceptance Criteria`, ...spec.acceptanceCriteria.map((a) => `- ${a}`), ``]
      : []),
    `## Phases`,
    ...spec.phases.flatMap((p) => [`### ${p.title}`, ...p.tasks.map((t) => `- ${t}`), ``]),
  ].join("\n");

  const localPath = path.join(paths.localSpecsArchiveDir, `${spec.specId}.md`);
  const obsidianPath = paths.obsidianSpecsDir ? path.join(paths.obsidianSpecsDir, `${spec.specId}.md`) : undefined;
  await dualWriteFile(localPath, obsidianPath, content);
}

// --- Completion Summary ---

export async function journalCompletionSummary(
  paths: SwarmPaths,
  journal: ObsidianJournalConfig,
  workflow: WorkflowState,
  runs: RunRecord[],
): Promise<void> {
  if (!journal.enableCompletionSummary) return;

  const doneTasks = workflow.tasks.filter((t) => t.status === "done").length;
  const totalTasks = workflow.tasks.length;
  const deadLetterTasks = workflow.tasks.filter((t) => t.status === "dead_letter").length;
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const failedRuns = runs.filter((r) => r.status === "failed" || r.status === "timed_out").length;

  const content = [
    `# Completion Summary`,
    ``,
    `> Generated at ${timestamp()}`,
    ``,
    `## Workflow`,
    `- Spec: ${workflow.activeSpecId ?? "(none)"}`,
    `- Lifecycle: ${workflow.lifecycle}`,
    `- Tasks: ${doneTasks}/${totalTasks} done${deadLetterTasks > 0 ? `, ${deadLetterTasks} dead letter` : ""}`,
    ``,
    `## Execution`,
    `- Total runs: ${totalRuns}`,
    `- Completed: ${completedRuns}`,
    `- Failed/Timed out: ${failedRuns}`,
    ``,
    `## Tasks`,
    ...workflow.tasks.map((t) => `- **${t.title}** — \`${t.status}\` (${t.runner.type})`),
    ``,
    `## Timeline`,
    ...runs
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((r) => `- ${r.startedAt.slice(0, 19)} — \`${r.runId}\` ${r.runner.type} [${r.status}]${r.resultSummary ? ` — ${r.resultSummary.slice(0, 60)}` : ""}`),
    ``,
  ].join("\n");

  await dualWriteFile(paths.localCompletionPath, paths.obsidianCompletionPath, content);
}
