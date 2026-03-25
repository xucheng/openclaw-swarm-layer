import type { HarnessAssumption } from "../types.js";

export function createAssumption(
  params: Pick<HarnessAssumption, "id" | "category" | "description">,
): HarnessAssumption {
  return {
    ...params,
    createdAt: new Date().toISOString(),
  };
}

export function validateAssumption(
  assumption: HarnessAssumption,
  valid: boolean,
  reason?: string,
): HarnessAssumption {
  return {
    ...assumption,
    validatedAt: new Date().toISOString(),
    valid,
    invalidationReason: valid ? undefined : reason,
  };
}

export function getStaleAssumptions(
  assumptions: HarnessAssumption[],
  maxAgeMs: number,
): HarnessAssumption[] {
  const now = Date.now();
  return assumptions.filter((a) => {
    if (a.validatedAt) return false;
    const age = now - new Date(a.createdAt).getTime();
    return age > maxAgeMs;
  });
}

export function defaultAssumptions(): HarnessAssumption[] {
  const now = new Date().toISOString();
  return [
    {
      id: "model-tool-calling",
      category: "model_capability",
      description: "Model supports structured tool calling with JSON schema",
      createdAt: now,
    },
    {
      id: "git-available",
      category: "environment",
      description: "Git is installed and available in PATH",
      createdAt: now,
    },
    {
      id: "node-available",
      category: "environment",
      description: "Node.js runtime is available for task execution",
      createdAt: now,
    },
    {
      id: "filesystem-writable",
      category: "environment",
      description: "Project workspace directory is writable",
      createdAt: now,
    },
    {
      id: "task-graph-acyclic",
      category: "workflow_structure",
      description: "Task dependency graph has no cycles",
      createdAt: now,
    },
  ];
}

export function summarizeAssumptions(
  assumptions: HarnessAssumption[],
): { total: number; validated: number; invalid: number; stale: number } {
  let validated = 0;
  let invalid = 0;

  for (const a of assumptions) {
    if (a.validatedAt) {
      if (a.valid) {
        validated++;
      } else {
        invalid++;
      }
    }
  }

  return {
    total: assumptions.length,
    validated,
    invalid,
    stale: assumptions.length - validated - invalid,
  };
}
