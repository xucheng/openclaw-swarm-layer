import { writeWorkflowReport } from "../reporting/reporter.js";
import { resolveStateStore, type SwarmCliContext } from "./context.js";

export async function runSwarmReport(
  options: { project: string },
  context?: SwarmCliContext,
): Promise<{ ok: true; report: string; localReportPath: string; obsidianReportPath?: string }> {
  const stateStore = resolveStateStore(context);
  const reportConfig = context?.config ?? stateStore.config;
  const workflow = await stateStore.loadWorkflow(options.project);
  const written = await writeWorkflowReport(options.project, workflow, reportConfig);

  return {
    ok: true,
    report: written.report,
    localReportPath: written.localReportPath,
    obsidianReportPath: written.obsidianReportPath,
  };
}
