import {
  createContract,
  freezeContract,
  updateCriterionResult,
  evaluateContract,
  contractFromSpecCriteria,
} from "../../../src/planning/sprint-contract.js";

describe("sprint-contract", () => {
  it("createContract produces correct initial state", () => {
    const contract = createContract("task-1", [
      { id: "c1", description: "Tests pass", kind: "test_passes" },
      { id: "c2", description: "File exists", kind: "file_exists", targetPath: "/out" },
    ]);

    expect(contract.taskId).toBe("task-1");
    expect(contract.frozen).toBe(false);
    expect(contract.criteria).toHaveLength(2);
    expect(contract.criteria[0].passes).toBeUndefined();
    expect(contract.criteria[1].passes).toBeUndefined();
    expect(contract.negotiatedAt).toBeTruthy();
  });

  it("freezeContract sets frozen to true", () => {
    const contract = createContract("task-1", [
      { id: "c1", description: "OK", kind: "manual_check" },
    ]);
    const frozen = freezeContract(contract);

    expect(frozen.frozen).toBe(true);
    expect(contract.frozen).toBe(false); // immutable
  });

  it("updateCriterionResult only modifies passes field", () => {
    const contract = createContract("task-1", [
      { id: "c1", description: "Tests pass", kind: "test_passes" },
      { id: "c2", description: "File exists", kind: "file_exists" },
    ]);

    const updated = updateCriterionResult(contract, "c1", true);

    expect(updated.criteria[0].passes).toBe(true);
    expect(updated.criteria[0].description).toBe("Tests pass");
    expect(updated.criteria[1].passes).toBeUndefined();
  });

  it("updateCriterionResult throws for unknown criterionId", () => {
    const contract = createContract("task-1", [
      { id: "c1", description: "OK", kind: "manual_check" },
    ]);

    expect(() => updateCriterionResult(contract, "nonexistent", true)).toThrow("Unknown criterion");
  });

  it("evaluateContract correctly counts passing and failing", () => {
    let contract = createContract("task-1", [
      { id: "c1", description: "A", kind: "manual_check" },
      { id: "c2", description: "B", kind: "manual_check" },
      { id: "c3", description: "C", kind: "manual_check" },
    ]);

    contract = updateCriterionResult(contract, "c1", true);
    contract = updateCriterionResult(contract, "c3", true);

    const result = evaluateContract(contract);

    expect(result.total).toBe(3);
    expect(result.passing).toBe(2);
    expect(result.allPassing).toBe(false);
    expect(result.failing).toEqual(["c2"]);
  });

  it("evaluateContract returns allPassing when all pass", () => {
    let contract = createContract("task-1", [
      { id: "c1", description: "A", kind: "manual_check" },
    ]);
    contract = updateCriterionResult(contract, "c1", true);

    const result = evaluateContract(contract);
    expect(result.allPassing).toBe(true);
    expect(result.failing).toEqual([]);
  });

  it("contractFromSpecCriteria converts strings to manual_check criteria", () => {
    const contract = contractFromSpecCriteria("task-1", [
      "All tests pass",
      "Feature X works",
    ]);

    expect(contract.taskId).toBe("task-1");
    expect(contract.criteria).toHaveLength(2);
    expect(contract.criteria[0].id).toBe("ac-1");
    expect(contract.criteria[0].kind).toBe("manual_check");
    expect(contract.criteria[0].description).toBe("All tests pass");
    expect(contract.criteria[1].id).toBe("ac-2");
    expect(contract.criteria[1].description).toBe("Feature X works");
    expect(contract.frozen).toBe(false);
  });
});
