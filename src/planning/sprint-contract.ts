import type { AcceptanceCriterion, SprintContract } from "../types.js";

export function createContract(
  taskId: string,
  criteria: Omit<AcceptanceCriterion, "passes">[],
): SprintContract {
  return {
    taskId,
    negotiatedAt: new Date().toISOString(),
    criteria: criteria.map((c) => ({ ...c, passes: undefined })),
    frozen: false,
  };
}

export function freezeContract(contract: SprintContract): SprintContract {
  return { ...contract, frozen: true };
}

export function updateCriterionResult(
  contract: SprintContract,
  criterionId: string,
  passes: boolean,
): SprintContract {
  const criterion = contract.criteria.find((c) => c.id === criterionId);
  if (!criterion) {
    throw new Error(`Unknown criterion: ${criterionId}`);
  }
  return {
    ...contract,
    criteria: contract.criteria.map((c) =>
      c.id === criterionId ? { ...c, passes } : c,
    ),
  };
}

export function evaluateContract(contract: SprintContract): {
  allPassing: boolean;
  passing: number;
  total: number;
  failing: string[];
} {
  const total = contract.criteria.length;
  const passing = contract.criteria.filter((c) => c.passes === true).length;
  const failing = contract.criteria
    .filter((c) => c.passes !== true)
    .map((c) => c.id);
  return { allPassing: failing.length === 0 && total > 0, passing, total, failing };
}

export function contractFromSpecCriteria(
  taskId: string,
  specCriteria: string[],
): SprintContract {
  const criteria: Omit<AcceptanceCriterion, "passes">[] = specCriteria.map((description, index) => ({
    id: `ac-${index + 1}`,
    description,
    kind: "manual_check" as const,
  }));
  return createContract(taskId, criteria);
}
