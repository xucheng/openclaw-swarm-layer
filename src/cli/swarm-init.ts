import { resolveStateStore, type SwarmCliContext } from "./context.js";

export type SwarmInitResult = {
  ok: true;
  projectRoot: string;
  swarmRoot: string;
};

export async function runSwarmInit(
  options: { project: string },
  context?: SwarmCliContext,
): Promise<SwarmInitResult> {
  const stateStore = resolveStateStore(context);
  const paths = await stateStore.initProject(options.project);
  return {
    ok: true,
    projectRoot: paths.projectRoot,
    swarmRoot: paths.swarmRoot,
  };
}
