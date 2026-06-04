import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { runSwarmPlan } from "../cli/swarm-plan.js";
import { runSwarmReview } from "../cli/swarm-review.js";
import { runSwarmRun } from "../cli/swarm-run.js";
import { runSwarmSessionCancel } from "../cli/swarm-session-cancel.js";
import { runSwarmSessionClose } from "../cli/swarm-session-close.js";
import { runSwarmSessionStatus } from "../cli/swarm-session-status.js";
import { runSwarmStatus } from "../cli/swarm-status.js";
import { runSwarmAutopilotStatus } from "../cli/swarm-autopilot-status.js";
import { resolvePluginConfigFromApi } from "../config.js";
import { StateStore } from "../state/state-store.js";

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

type ProjectParams = { project: string };
type StatusParams = ProjectParams & { sync?: boolean };
type PlanParams = ProjectParams & { spec: string };
type RunParams = ProjectParams & {
  task?: string;
  dryRun?: boolean;
  parallel?: number;
  allReady?: boolean;
  syncActive?: boolean;
};
type ReviewParams = ProjectParams & {
  task: string;
  approve?: boolean;
  reject?: boolean;
  note?: string;
};
type SessionRunParams = ProjectParams & { run: string; reason?: string };

function toolParams<T>(params: unknown): T {
  return params as T;
}

export function registerSwarmTools(api: OpenClawPluginApi): void {
  const config = resolvePluginConfigFromApi(api);
  const stateStore = new StateStore(config, { runtimeVersion: api.runtime?.version });
  const toolContext = { config, stateStore, runtime: api.runtime };

  api.registerTool(
    {
      name: "swarm_status",
      label: "Swarm Status",
      description: "Show current swarm workflow status for a project.",
      parameters: Type.Object({
        project: Type.String(),
        sync: Type.Optional(Type.Boolean()),
      }),
      async execute(_toolCallId, params) {
        const input = toolParams<StatusParams>(params);
        return jsonResult(await runSwarmStatus({ project: input.project, sync: input.sync }, toolContext));
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "swarm_autopilot_status",
      label: "Swarm Autopilot Status",
      description: "Show current autopilot control-plane status for a project.",
      parameters: Type.Object({
        project: Type.String(),
      }),
      async execute(_toolCallId, params) {
        const input = toolParams<ProjectParams>(params);
        return jsonResult(await runSwarmAutopilotStatus({ project: input.project }, toolContext));
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "swarm_task_plan",
      label: "Swarm Plan",
      description: "Import a spec and build a swarm task plan.",
      parameters: Type.Object({
        project: Type.String(),
        spec: Type.String(),
      }),
      async execute(_toolCallId, params) {
        const input = toolParams<PlanParams>(params);
        return jsonResult(await runSwarmPlan({ project: input.project, spec: input.spec }, toolContext));
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "swarm_run",
      label: "Swarm Run",
      description: "Dispatch the next runnable swarm task. Use --parallel or --allReady for batch dispatch.",
      parameters: Type.Object({
        project: Type.String(),
        task: Type.Optional(Type.String()),
        dryRun: Type.Optional(Type.Boolean()),
        parallel: Type.Optional(Type.Integer({ minimum: 1 })),
        allReady: Type.Optional(Type.Boolean()),
        syncActive: Type.Optional(Type.Boolean()),
      }),
      async execute(_toolCallId, params) {
        const input = toolParams<RunParams>(params);
        return jsonResult(
          await runSwarmRun(
            {
              project: input.project,
              task: input.task,
              dryRun: input.dryRun,
              parallel: input.parallel,
              allReady: input.allReady,
              syncActive: input.syncActive,
            },
            toolContext,
          ),
        );
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "swarm_review_gate",
      label: "Swarm Review Gate",
      description: "Approve or reject a swarm review task.",
      parameters: Type.Object({
        project: Type.String(),
        task: Type.String(),
        approve: Type.Optional(Type.Boolean()),
        reject: Type.Optional(Type.Boolean()),
        note: Type.Optional(Type.String()),
      }),
      async execute(_toolCallId, params) {
        const input = toolParams<ReviewParams>(params);
        return jsonResult(
          await runSwarmReview(
            {
              project: input.project,
              task: input.task,
              approve: input.approve,
              reject: input.reject,
              note: input.note,
            },
            toolContext,
          ),
        );
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "swarm_session_status",
      label: "Swarm Session Status",
      description: "Show the latest ACP session status for a run.",
      parameters: Type.Object({
        project: Type.String(),
        run: Type.String(),
      }),
      async execute(_toolCallId, params) {
        const input = toolParams<SessionRunParams>(params);
        return jsonResult(await runSwarmSessionStatus({ project: input.project, run: input.run }, toolContext));
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "swarm_session_cancel",
      label: "Swarm Session Cancel",
      description: "Cancel an ACP session for a run.",
      parameters: Type.Object({
        project: Type.String(),
        run: Type.String(),
        reason: Type.Optional(Type.String()),
      }),
      async execute(_toolCallId, params) {
        const input = toolParams<SessionRunParams>(params);
        return jsonResult(
          await runSwarmSessionCancel({ project: input.project, run: input.run, reason: input.reason }, toolContext),
        );
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "swarm_session_close",
      label: "Swarm Session Close",
      description: "Close an ACP session for a run.",
      parameters: Type.Object({
        project: Type.String(),
        run: Type.String(),
        reason: Type.Optional(Type.String()),
      }),
      async execute(_toolCallId, params) {
        const input = toolParams<SessionRunParams>(params);
        return jsonResult(
          await runSwarmSessionClose({ project: input.project, run: input.run, reason: input.reason }, toolContext),
        );
      },
    },
    { optional: true },
  );
}
