import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { runSwarmPlan } from "../cli/swarm-plan.js";
import { runSwarmReview } from "../cli/swarm-review.js";
import { runSwarmRun } from "../cli/swarm-run.js";
import { runSwarmSessionCancel } from "../cli/swarm-session-cancel.js";
import { runSwarmSessionClose } from "../cli/swarm-session-close.js";
import { runSwarmSessionStatus } from "../cli/swarm-session-status.js";
import { runSwarmStatus } from "../cli/swarm-status.js";
import { resolvePluginConfigFromApi } from "../config.js";
import { StateStore } from "../state/state-store.js";

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

export function registerSwarmTools(api: OpenClawPluginApi): void {
  const config = resolvePluginConfigFromApi(api);
  const stateStore = new StateStore(config);
  const toolContext = { config, stateStore, runtime: api.runtime };

  api.registerTool(
    {
      name: "swarm_status",
      label: "Swarm Status",
      description: "Show current swarm workflow status for a project.",
      parameters: Type.Object({
        project: Type.String(),
      }),
      async execute(_toolCallId, params) {
        return jsonResult(await runSwarmStatus({ project: params.project }, toolContext));
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
        return jsonResult(await runSwarmPlan({ project: params.project, spec: params.spec }, toolContext));
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "swarm_run",
      label: "Swarm Run",
      description: "Dispatch the next runnable swarm task.",
      parameters: Type.Object({
        project: Type.String(),
        task: Type.Optional(Type.String()),
        dryRun: Type.Optional(Type.Boolean()),
      }),
      async execute(_toolCallId, params) {
        return jsonResult(
          await runSwarmRun({ project: params.project, task: params.task, dryRun: params.dryRun }, toolContext),
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
        return jsonResult(
          await runSwarmReview(
            {
              project: params.project,
              task: params.task,
              approve: params.approve,
              reject: params.reject,
              note: params.note,
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
        return jsonResult(await runSwarmSessionStatus({ project: params.project, run: params.run }, toolContext));
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
        return jsonResult(
          await runSwarmSessionCancel({ project: params.project, run: params.run, reason: params.reason }, toolContext),
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
        return jsonResult(
          await runSwarmSessionClose({ project: params.project, run: params.run, reason: params.reason }, toolContext),
        );
      },
    },
    { optional: true },
  );
}
