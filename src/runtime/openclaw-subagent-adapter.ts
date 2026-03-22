export type SubagentAcceptedRun = {
  childSessionKey: string;
  runId: string;
  mode: "run" | "session";
  acceptedAt?: string;
  note?: string;
  outputText?: string;
};

export type SubagentRunStatus = {
  childSessionKey: string;
  runId?: string;
  state: "accepted" | "running" | "completed" | "failed" | "cancelled";
  checkedAt?: string;
  message?: string;
  outputText?: string;
};

export type SubagentSpawnParams = {
  task: string;
  label?: string;
  agentId?: string;
  mode: "run" | "session";
  thread: boolean;
  runTimeoutSeconds?: number;
};

export interface OpenClawSubagentAdapter {
  spawnSubagent(params: SubagentSpawnParams): Promise<SubagentAcceptedRun>;
  getSubagentRunStatus(childSessionKey: string): Promise<SubagentRunStatus>;
  killSubagentRun(childSessionKey: string, reason?: string): Promise<{ childSessionKey: string; killedAt?: string; message?: string }>;
}

export class UnsupportedOpenClawSubagentAdapter implements OpenClawSubagentAdapter {
  async spawnSubagent(_params: SubagentSpawnParams): Promise<SubagentAcceptedRun> {
    throw new Error(
      "OpenClaw public plugin SDK does not expose a stable subagent spawn surface for plugins yet. A real subagent runner would require a future public export or an intentional private deep-import experiment.",
    );
  }

  async getSubagentRunStatus(_childSessionKey: string): Promise<SubagentRunStatus> {
    throw new Error(
      "OpenClaw public plugin SDK does not expose a stable subagent status surface for plugins yet. A real subagent runner would require a future public export or an intentional private deep-import experiment.",
    );
  }

  async killSubagentRun(_childSessionKey: string, _reason?: string): Promise<{ childSessionKey: string; killedAt?: string; message?: string }> {
    throw new Error(
      "OpenClaw public plugin SDK does not expose a stable subagent kill surface for plugins yet. A real subagent runner would require a future public export or an intentional private deep-import experiment.",
    );
  }
}
