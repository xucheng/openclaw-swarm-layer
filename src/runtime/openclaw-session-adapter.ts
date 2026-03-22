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
      "ACP execution is not wired to a public OpenClaw session adapter yet. Finish M2.0 T2 before enabling real ACP runs.",
    );
  }

  async getAcpSessionStatus(_sessionKey: string): Promise<AcpSessionStatus> {
    throw new Error(
      "ACP session status is not wired to a public OpenClaw session adapter yet. Finish M2.0 T5 before enabling operator status sync.",
    );
  }

  async cancelAcpSession(_sessionKey: string, _reason?: string): Promise<{ sessionKey: string; cancelledAt?: string; message?: string }> {
    throw new Error(
      "ACP session cancel is not wired to a public OpenClaw session adapter yet. Finish M2.0 T7 before enabling operator cancel.",
    );
  }

  async closeAcpSession(_sessionKey: string, _reason?: string): Promise<{ sessionKey: string; closedAt?: string; message?: string }> {
    throw new Error(
      "ACP session close is not wired to a public OpenClaw session adapter yet. Finish M2.0 T7 before enabling operator close.",
    );
  }
}
