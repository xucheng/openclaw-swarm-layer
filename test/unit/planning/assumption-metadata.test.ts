import {
  createAssumption,
  validateAssumption,
  getStaleAssumptions,
  defaultAssumptions,
  summarizeAssumptions,
} from "../../../src/planning/assumption-metadata.js";

describe("assumption-metadata", () => {
  it("createAssumption sets createdAt and leaves valid undefined", () => {
    const a = createAssumption({
      id: "test-1",
      category: "model_capability",
      description: "Model can do X",
    });
    expect(a.id).toBe("test-1");
    expect(a.category).toBe("model_capability");
    expect(a.createdAt).toBeDefined();
    expect(a.valid).toBeUndefined();
    expect(a.validatedAt).toBeUndefined();
  });

  it("validateAssumption with valid=true sets validatedAt", () => {
    const a = createAssumption({
      id: "test-1",
      category: "environment",
      description: "Git available",
    });
    const validated = validateAssumption(a, true);
    expect(validated.valid).toBe(true);
    expect(validated.validatedAt).toBeDefined();
    expect(validated.invalidationReason).toBeUndefined();
  });

  it("validateAssumption with valid=false sets invalidationReason", () => {
    const a = createAssumption({
      id: "test-1",
      category: "tooling",
      description: "Tool X available",
    });
    const invalidated = validateAssumption(a, false, "Tool X not installed");
    expect(invalidated.valid).toBe(false);
    expect(invalidated.validatedAt).toBeDefined();
    expect(invalidated.invalidationReason).toBe("Tool X not installed");
  });

  it("getStaleAssumptions filters by age correctly", () => {
    const old = createAssumption({
      id: "old",
      category: "environment",
      description: "Old assumption",
    });
    // Backdate the createdAt
    old.createdAt = new Date(Date.now() - 10_000).toISOString();

    const fresh = createAssumption({
      id: "fresh",
      category: "environment",
      description: "Fresh assumption",
    });

    const validated = validateAssumption(
      createAssumption({
        id: "validated",
        category: "environment",
        description: "Already checked",
      }),
      true,
    );
    // Backdate createdAt but it's validated, so shouldn't be stale
    validated.createdAt = new Date(Date.now() - 10_000).toISOString();

    const stale = getStaleAssumptions([old, fresh, validated], 5_000);
    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe("old");
  });

  it("defaultAssumptions returns non-empty array", () => {
    const defaults = defaultAssumptions();
    expect(defaults.length).toBeGreaterThan(0);
    for (const a of defaults) {
      expect(a.id).toBeDefined();
      expect(a.category).toBeDefined();
      expect(a.description).toBeDefined();
      expect(a.createdAt).toBeDefined();
    }
  });

  it("summarizeAssumptions counts correctly", () => {
    const assumptions = [
      createAssumption({ id: "a1", category: "environment", description: "d1" }),
      validateAssumption(
        createAssumption({ id: "a2", category: "environment", description: "d2" }),
        true,
      ),
      validateAssumption(
        createAssumption({ id: "a3", category: "tooling", description: "d3" }),
        false,
        "missing",
      ),
      createAssumption({ id: "a4", category: "model_capability", description: "d4" }),
    ];

    const summary = summarizeAssumptions(assumptions);
    expect(summary.total).toBe(4);
    expect(summary.validated).toBe(1);
    expect(summary.invalid).toBe(1);
    expect(summary.stale).toBe(2);
  });
});
