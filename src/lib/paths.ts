import path from "node:path";
import type { SwarmPluginConfig } from "../config.js";

export type SwarmPaths = {
  projectRoot: string;
  swarmRoot: string;
  workflowStatePath: string;
  specsDir: string;
  runsDir: string;
  sessionsDir: string;
  artifactsDir: string;
  logsDir: string;
  reportsDir: string;
  localReportPath: string;
  obsidianReportPath?: string;
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
  const reportFileName = `${path.basename(resolvedProjectRoot)}-swarm-report.md`;

  return {
    projectRoot: resolvedProjectRoot,
    swarmRoot,
    workflowStatePath: path.join(swarmRoot, "workflow-state.json"),
    specsDir: path.join(swarmRoot, "specs"),
    runsDir: path.join(swarmRoot, "runs"),
    sessionsDir: path.join(swarmRoot, "sessions"),
    artifactsDir: path.join(swarmRoot, "artifacts"),
    logsDir: path.join(swarmRoot, "logs"),
    reportsDir: localReportsDir,
    localReportPath: path.join(localReportsDir, "swarm-report.md"),
    obsidianReportPath: obsidianReportsDir ? path.join(obsidianReportsDir, reportFileName) : undefined,
  };
}
