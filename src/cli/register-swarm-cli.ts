import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolvePluginConfigFromApi } from "../config.js";
import { StateStore } from "../state/state-store.js";
import { type SwarmCliContext } from "./context.js";
import { runSwarmInit } from "./swarm-init.js";
import { formatOutput } from "./output.js";
import { runSwarmPlan } from "./swarm-plan.js";
import { runSwarmDoctor } from "./swarm-doctor.js";
import { runSwarmReport } from "./swarm-report.js";
import { runSwarmReview } from "./swarm-review.js";
import { runSwarmSessionCancel } from "./swarm-session-cancel.js";
import { runSwarmSessionCleanup } from "./swarm-session-cleanup.js";
import { runSwarmSessionClose } from "./swarm-session-close.js";
import { runSwarmSessionFollowup } from "./swarm-session-followup.js";
import { runSwarmSessionInspect } from "./swarm-session-inspect.js";
import { runSwarmSessionList } from "./swarm-session-list.js";
import { runSwarmRun } from "./swarm-run.js";
import { runSwarmSessionStatus } from "./swarm-session-status.js";
import { runSwarmSessionSteer } from "./swarm-session-steer.js";
import { runSwarmStatus } from "./swarm-status.js";
import { runSwarmAutopilotControl } from "./swarm-autopilot-control.js";
import { runSwarmAutopilotStatus } from "./swarm-autopilot-status.js";
import { runSwarmAutopilotTick } from "./swarm-autopilot-tick.js";

type CommandAction = (options: any) => Promise<unknown>;

function bindCommand(command: any, action: CommandAction): void {
  command.action(async (options: any) => {
    const output = await action(options);
    if (output !== undefined) {
      process.stdout.write(`${formatOutput(output, Boolean(options?.json))}\n`);
    }
  });
}

export function registerSwarmCli(api: OpenClawPluginApi): void {
  api.registerCli((ctx) => {
    registerSwarmCliCommands(ctx, {
      config: resolvePluginConfigFromApi(api),
      stateStore: new StateStore(resolvePluginConfigFromApi(api), { runtimeVersion: api.runtime?.version }),
      runtime: api.runtime,
    });
  }, { commands: ["swarm"] });
}

export function registerSwarmCliCommands(
  ctx: { program: any },
  cliContext?: SwarmCliContext,
): void {
  const swarm = ctx.program.command("swarm").description("Swarm workflow commands");

  const init = swarm.command("init").requiredOption("--project <path>").option("--json");
  bindCommand(init, (options) => runSwarmInit({ project: options.project }, cliContext));

  const status = swarm.command("status").requiredOption("--project <path>").option("--json");
  bindCommand(status, (options) => runSwarmStatus({ project: options.project }, cliContext));

  const plan = swarm
    .command("plan")
    .requiredOption("--project <path>")
    .requiredOption("--spec <path>")
    .option("--json");
  bindCommand(plan, (options) => runSwarmPlan({ project: options.project, spec: options.spec }, cliContext));

  const run = swarm
    .command("run")
    .requiredOption("--project <path>")
    .option("--task <taskId>")
    .option("--dry-run")
    .option("--runner <kind>")
    .option("--parallel <N>")
    .option("--all-ready")
    .option("--json");
  bindCommand(run, (options) =>
    runSwarmRun(
      {
        project: options.project,
        task: options.task,
        dryRun: options.dryRun,
        runner: options.runner,
        parallel: options.parallel ? Number(options.parallel) : undefined,
        allReady: options.allReady,
      },
      cliContext,
    ),
  );

  const review = swarm
    .command("review")
    .requiredOption("--project <path>")
    .requiredOption("--task <taskId>")
    .option("--approve")
    .option("--reject")
    .option("--retry-now")
    .option("--note <text>")
    .option("--json");
  bindCommand(review, (options) =>
    runSwarmReview(
      {
        project: options.project,
        task: options.task,
        approve: options.approve,
        reject: options.reject,
        retryNow: options.retryNow,
        note: options.note,
      },
      cliContext,
    ),
  );

  const report = swarm.command("report").requiredOption("--project <path>").option("--json");
  bindCommand(report, (options) => runSwarmReport({ project: options.project }, cliContext));

  const doctor = swarm.command("doctor").option("--json");
  bindCommand(doctor, () => runSwarmDoctor({}, cliContext));

  const autopilot = swarm.command("autopilot").description("Autopilot control-plane commands");
  const autopilotStatus = autopilot.command("status").requiredOption("--project <path>").option("--json");
  bindCommand(autopilotStatus, (options) => runSwarmAutopilotStatus({ project: options.project }, cliContext));

  const autopilotStart = autopilot
    .command("start")
    .requiredOption("--project <path>")
    .option("--reason <text>")
    .option("--json");
  bindCommand(autopilotStart, (options) =>
    runSwarmAutopilotControl({ project: options.project, command: "start", reason: options.reason }, cliContext),
  );

  const autopilotPause = autopilot
    .command("pause")
    .requiredOption("--project <path>")
    .option("--reason <text>")
    .option("--json");
  bindCommand(autopilotPause, (options) =>
    runSwarmAutopilotControl({ project: options.project, command: "pause", reason: options.reason }, cliContext),
  );

  const autopilotResume = autopilot
    .command("resume")
    .requiredOption("--project <path>")
    .option("--reason <text>")
    .option("--json");
  bindCommand(autopilotResume, (options) =>
    runSwarmAutopilotControl({ project: options.project, command: "resume", reason: options.reason }, cliContext),
  );

  const autopilotStop = autopilot
    .command("stop")
    .requiredOption("--project <path>")
    .option("--mode <mode>", "stop mode", "safe")
    .option("--reason <text>")
    .option("--json");
  bindCommand(autopilotStop, (options) =>
    runSwarmAutopilotControl(
      { project: options.project, command: "stop", mode: options.mode, reason: options.reason },
      cliContext,
    ),
  );

  const autopilotTick = autopilot
    .command("tick")
    .requiredOption("--project <path>")
    .option("--dry-run")
    .option("--json");
  bindCommand(autopilotTick, (options) => runSwarmAutopilotTick({ project: options.project, dryRun: options.dryRun }, cliContext));

  const session = swarm.command("session").description("ACP session operator commands");
  const sessionList = session.command("list").requiredOption("--project <path>").option("--json");
  bindCommand(sessionList, (options) => runSwarmSessionList({ project: options.project }, cliContext));

  const sessionInspect = session
    .command("inspect")
    .requiredOption("--project <path>")
    .requiredOption("--session <sessionId>")
    .option("--json");
  bindCommand(sessionInspect, (options) =>
    runSwarmSessionInspect({ project: options.project, session: options.session }, cliContext),
  );

  const sessionStatus = session
    .command("status")
    .requiredOption("--project <path>")
    .requiredOption("--run <runId>")
    .option("--json");
  bindCommand(sessionStatus, (options) =>
    runSwarmSessionStatus({ project: options.project, run: options.run }, cliContext),
  );

  const sessionCancel = session
    .command("cancel")
    .requiredOption("--project <path>")
    .requiredOption("--run <runId>")
    .option("--reason <text>")
    .option("--json");
  bindCommand(sessionCancel, (options) =>
    runSwarmSessionCancel({ project: options.project, run: options.run, reason: options.reason }, cliContext),
  );

  const sessionClose = session
    .command("close")
    .requiredOption("--project <path>")
    .requiredOption("--run <runId>")
    .option("--reason <text>")
    .option("--json");
  bindCommand(sessionClose, (options) =>
    runSwarmSessionClose({ project: options.project, run: options.run, reason: options.reason }, cliContext),
  );

  const sessionFollowup = session
    .command("follow-up")
    .requiredOption("--project <path>")
    .requiredOption("--session <sessionId>")
    .requiredOption("--task <description>")
    .option("--runner <kind>")
    .option("--json");
  bindCommand(sessionFollowup, (options) =>
    runSwarmSessionFollowup(
      { project: options.project, session: options.session, task: options.task, runner: options.runner },
      cliContext,
    ),
  );

  const sessionCleanup = session
    .command("cleanup")
    .requiredOption("--project <path>")
    .option("--stale-minutes <minutes>")
    .option("--json");
  bindCommand(sessionCleanup, (options) =>
    runSwarmSessionCleanup(
      { project: options.project, staleMinutes: options.staleMinutes ? Number(options.staleMinutes) : undefined },
      cliContext,
    ),
  );

  const sessionSteer = session
    .command("steer")
    .requiredOption("--project <path>")
    .requiredOption("--session <sessionId>")
    .requiredOption("--message <text>")
    .option("--json");
  bindCommand(sessionSteer, (options) =>
    runSwarmSessionSteer({ project: options.project, session: options.session, message: options.message }, cliContext),
  );
}
