import type { AutopilotState } from "./types.js";

export type AutopilotLeaseResult = {
  acquired: boolean;
  ownerId: string;
  state: AutopilotState;
  reason?: string;
};

export function acquireAutopilotLease(
  state: AutopilotState,
  ownerId: string,
  now: string,
  leaseSeconds: number,
): AutopilotLeaseResult {
  const nowMs = new Date(now).getTime();
  const existingLease = state.lease;
  if (existingLease && existingLease.ownerId !== ownerId && new Date(existingLease.expiresAt).getTime() > nowMs) {
    return {
      acquired: false,
      ownerId,
      state,
      reason: `lease held by ${existingLease.ownerId} until ${existingLease.expiresAt}`,
    };
  }

  return {
    acquired: true,
    ownerId,
    state: {
      ...state,
      runtimeState: "ticking",
      lease: {
        ownerId,
        acquiredAt: now,
        expiresAt: new Date(nowMs + leaseSeconds * 1000).toISOString(),
      },
    },
  };
}

export function releaseAutopilotLease(
  state: AutopilotState,
  ownerId: string,
): AutopilotState {
  if (!state.lease || state.lease.ownerId !== ownerId) {
    return state;
  }
  return {
    ...state,
    runtimeState: "idle",
    lease: undefined,
  };
}

