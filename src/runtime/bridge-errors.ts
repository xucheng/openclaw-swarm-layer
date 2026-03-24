export type BridgeFailureKind =
  | "version-drift"
  | "backend-unavailable"
  | "timeout"
  | "rejected"
  | "close-race"
  | "unknown";

export type BridgeFailure = {
  kind: BridgeFailureKind;
  message: string;
  remediation: string[];
};

export function classifyBridgeFailure(message: string): BridgeFailure {
  const trimmed = message.trim();

  if (/not in bridge allowlist|No internal bridge mapping|mapping is stale/i.test(trimmed)) {
    return {
      kind: "version-drift",
      message: trimmed,
      remediation: [
        "Align bridge.versionAllow with the installed OpenClaw version or a compatible range such as >=2026.3.22.",
        "Refresh the internal bridge mapping if the installed OpenClaw build changed.",
      ],
    };
  }

  if (/ACP runtime backend is currently unavailable|backend unavailable|backend not configured/i.test(trimmed)) {
    return {
      kind: "backend-unavailable",
      message: trimmed,
      remediation: [
        "Check that acpx is enabled and healthy.",
        "Run `openclaw swarm doctor --json` before retrying the run.",
      ],
    };
  }

  if (/timed out|timeout/i.test(trimmed)) {
    return {
      kind: "timeout",
      message: trimmed,
      remediation: [
        "Retry after increasing bridge or run timeout settings if the task is expected to run longer.",
      ],
    };
  }

  if (/forbidden|rejected|spawn failed with status forbidden/i.test(trimmed)) {
    return {
      kind: "rejected",
      message: trimmed,
      remediation: [
        "Check policy, agent ownership, and caller permissions before retrying.",
      ],
    };
  }

  if (/metadata is missing|session metadata missing after close|run not found/i.test(trimmed)) {
    return {
      kind: "close-race",
      message: trimmed,
      remediation: [
        "Treat the local run ledger as source of truth if the session was just closed.",
      ],
    };
  }

  return {
    kind: "unknown",
    message: trimmed,
    remediation: ["Inspect the bridge stderr/stdout and rerun `openclaw swarm doctor --json`."],
  };
}

export function formatBridgeFailure(command: string, message: string): string {
  const classified = classifyBridgeFailure(message);
  return `Bridge command failed (${command}) [${classified.kind}]: ${classified.message} | Remediation: ${classified.remediation.join(" ")}`;
}
