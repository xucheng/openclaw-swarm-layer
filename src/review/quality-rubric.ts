import type { ReviewDecision } from "./review-gate.js";
import type { QualityRubric, RubricResult, RubricScore } from "../types.js";

export function createDefaultRubric(): QualityRubric {
  return {
    dimensions: [
      { name: "functionality", weight: 0.3, description: "Core features work correctly" },
      { name: "correctness", weight: 0.3, description: "Logic is sound, no bugs" },
      { name: "design", weight: 0.2, description: "Clean architecture, good abstractions" },
      { name: "craft", weight: 0.2, description: "Code quality, naming, consistency" },
    ],
    passingThreshold: 6.0,
  };
}

export function validateRubric(rubric: QualityRubric): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (rubric.dimensions.length === 0) {
    errors.push("Rubric must have at least one dimension");
  }

  const weightSum = rubric.dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (Math.abs(weightSum - 1.0) > 0.001) {
    errors.push(`Dimension weights must sum to 1.0, got ${weightSum.toFixed(3)}`);
  }

  for (const dim of rubric.dimensions) {
    if (dim.weight < 0) {
      errors.push(`Dimension "${dim.name}" has negative weight: ${dim.weight}`);
    }
    if (!dim.name || dim.name.trim().length === 0) {
      errors.push("Dimension name is required");
    }
  }

  if (rubric.passingThreshold < 0 || rubric.passingThreshold > 10) {
    errors.push(`Passing threshold must be between 0 and 10, got ${rubric.passingThreshold}`);
  }

  return { ok: errors.length === 0, errors };
}

export function scoreRubric(rubric: QualityRubric, scores: RubricScore[]): RubricResult {
  let weightedTotal = 0;

  for (const dim of rubric.dimensions) {
    const score = scores.find((s) => s.dimension === dim.name);
    if (score) {
      weightedTotal += score.score * dim.weight;
    }
  }

  // Round to 2 decimal places
  weightedTotal = Math.round(weightedTotal * 100) / 100;

  return {
    scores,
    weightedTotal,
    passing: weightedTotal >= rubric.passingThreshold,
    evaluatedAt: new Date().toISOString(),
  };
}

export function rubricToDecision(result: RubricResult): ReviewDecision {
  return result.passing ? "approve" : "reject";
}
