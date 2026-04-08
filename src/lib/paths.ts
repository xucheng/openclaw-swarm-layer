import path from "node:path";
import type { SwarmPluginConfig } from "../config.js";

export type SwarmPaths = {
  projectRoot: string;
  swarmRoot: string;
  workflowStatePath: string;
  autopilotStatePath: string;
  specsDir: string;
  runsDir: string;
  sessionsDir: string;
  artifactsDir: string;
  logsDir: string;
  autopilotDecisionLogPath: string;
  reportsDir: string;
  localReportPath: string;
  localRunLogPath: string;
  localReviewLogPath: string;
  localSpecsArchiveDir: string;
  localCompletionPath: string;
  progressFilePath: string;
  obsidianReportPath?: string;
  obsidianProjectDir?: string;
  obsidianRunLogPath?: string;
  obsidianReviewLogPath?: string;
  obsidianSpecsDir?: string;
  obsidianCompletionPath?: string;
};

export function resolveProjectRoot(projectRoot: string, config?: Pick<SwarmPluginConfig, "defaultProjectRoot">): string {
  const source = projectRoot || config?.defaultProjectRoot;
  if (!source) {
    throw new Error("projectRoot is required");
  }
  return path.resolve(source);
}

export function resolveSwarmPaths(projectRoot: string, config?: Partial<SwarmPluginConfig>): SwarmPaths {
  const resolvedProjectRoot = resolveProjectRoot(projectRoot, config);
  const swarmRoot = config?.stateRoot
    ? path.resolve(config.stateRoot, path.basename(resolvedProjectRoot))
    : path.join(resolvedProjectRoot, ".openclaw", "swarm");
  const obsidianReportsDir = config?.obsidianRoot ? path.resolve(config.obsidianRoot) : undefined;
  const localReportsDir = path.join(swarmRoot, "reports");
  const projectName = path.basename(resolvedProjectRoot);
  const reportFileName = `${projectName}-swarm-report.md`;
  const obsidianProjectDir = obsidianReportsDir ? path.join(obsidianReportsDir, projectName) : undefined;

  return {
    projectRoot: resolvedProjectRoot,
    swarmRoot,
    workflowStatePath: path.join(swarmRoot, "workflow-state.json"),
    autopilotStatePath: path.join(swarmRoot, "autopilot-state.json"),
    specsDir: path.join(swarmRoot, "specs"),
    runsDir: path.join(swarmRoot, "runs"),
    sessionsDir: path.join(swarmRoot, "sessions"),
    artifactsDir: path.join(swarmRoot, "artifacts"),
    logsDir: path.join(swarmRoot, "logs"),
    autopilotDecisionLogPath: path.join(swarmRoot, "logs", "autopilot-decisions.ndjson"),
    reportsDir: localReportsDir,
    localReportPath: path.join(localReportsDir, "swarm-report.md"),
    localRunLogPath: path.join(localReportsDir, "run-log.md"),
    localReviewLogPath: path.join(localReportsDir, "review-log.md"),
    localSpecsArchiveDir: path.join(localReportsDir, "specs"),
    localCompletionPath: path.join(localReportsDir, "completion-summary.md"),
    progressFilePath: path.join(swarmRoot, "progress.json"),
    obsidianReportPath: obsidianReportsDir ? path.join(obsidianReportsDir, reportFileName) : undefined,
    obsidianProjectDir,
    obsidianRunLogPath: obsidianProjectDir ? path.join(obsidianProjectDir, "run-log.md") : undefined,
    obsidianReviewLogPath: obsidianProjectDir ? path.join(obsidianProjectDir, "review-log.md") : undefined,
    obsidianSpecsDir: obsidianProjectDir ? path.join(obsidianProjectDir, "specs") : undefined,
    obsidianCompletionPath: obsidianProjectDir ? path.join(obsidianProjectDir, "completion-summary.md") : undefined,
  };
}
