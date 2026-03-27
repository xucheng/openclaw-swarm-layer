import type { AcpSpawnParams } from "./acp-mapping.js";

export type AcpAcceptedSession = {
  sessionKey: string;
  backend?: string;
  backendSessionId?: string;
  agentSessionId?: string;
  acceptedAt?: string;
  outputText?: string;
  threadId?: string;
};

export type AcpSessionStatus = {
  sessionKey: string;
  state: "accepted" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
  backend?: string;
  backendSessionId?: string;
  agentSessionId?: string;
  checkedAt?: string;
  message?: string;
  outputText?: string;
};

export interface OpenClawSessionAdapter {
  spawnAcpSession(params: AcpSpawnParams): Promise<AcpAcceptedSession>;
  getAcpSessionStatus(sessionKey: string): Promise<AcpSessionStatus>;
  cancelAcpSession(sessionKey: string, reason?: string): Promise<{ sessionKey: string; cancelledAt?: string; message?: string }>;
  closeAcpSession(sessionKey: string, reason?: string): Promise<{ sessionKey: string; closedAt?: string; message?: string }>;
}

export class UnsupportedOpenClawSessionAdapter implements OpenClawSessionAdapter {
  async spawnAcpSession(_params: AcpSpawnParams): Promise<AcpAcceptedSession> {
    throw new Error(
      "ACP public control-plane execution is unavailable for the current OpenClaw/runtime configuration. Keep manual runner as the safe fallback or upgrade OpenClaw to a public-ACP-capable build.",
    );
  }

  async getAcpSessionStatus(_sessionKey: string): Promise<AcpSessionStatus> {
    throw new Error(
      "ACP session status is unavailable for the current OpenClaw/runtime configuration. Keep manual runner as the safe fallback or upgrade OpenClaw to a public-ACP-capable build.",
    );
  }

  async cancelAcpSession(_sessionKey: string, _reason?: string): Promise<{ sessionKey: string; cancelledAt?: string; message?: string }> {
    throw new Error(
      "ACP session cancel is unavailable for the current OpenClaw/runtime configuration. Keep manual runner as the safe fallback or upgrade OpenClaw to a public-ACP-capable build.",
    );
  }

  async closeAcpSession(_sessionKey: string, _reason?: string): Promise<{ sessionKey: string; closedAt?: string; message?: string }> {
    throw new Error(
      "ACP session close is unavailable for the current OpenClaw/runtime configuration. Keep manual runner as the safe fallback or upgrade OpenClaw to a public-ACP-capable build.",
    );
  }
}
