import { AutopilotController } from "../autopilot/controller.js";
import { createOrchestrator } from "../services/orchestrator.js";
import { resolveSessionAdapter, resolveSessionStore, resolveStateStore, type SwarmCliContext } from "./context.js";

export async function runSwarmAutopilotTick(
  options: { project: string; dryRun?: boolean },
  context?: SwarmCliContext,
): Promise<unknown> {
  const stateStore = resolveStateStore(context);
  const controller = new AutopilotController(
    stateStore,
    undefined,
    createOrchestrator({
      stateStore,
      sessionStore: resolveSessionStore(context),
      sessionAdapter: resolveSessionAdapter(context),
    }),
  );
  return controller.tick({
    projectRoot: options.project,
    dryRun: options.dryRun,
  });
}
