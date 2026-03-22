import path from "node:path";
import { importSpecFromContent } from "../../../src/spec/spec-importer.js";

describe("spec importer", () => {
  it("extracts title, sections, and phases from markdown", () => {
    const spec = importSpecFromContent(
      `# Sample Spec\n\n## Goals\n- Ship V1\n- Keep it simple\n\n## Constraints\n- No ACP\n\n## Acceptance Criteria\n- Status works\n\n## Phases\n### Bootstrap\n- Init repo\n- Add manifest\n### CLI\n- Implement status\n`,
      "/tmp/SPEC-001.md",
    );

    expect(spec.title).toBe("Sample Spec");
    expect(spec.specId).toBe("sample-spec");
    expect(spec.goals).toEqual(["Ship V1", "Keep it simple"]);
    expect(spec.constraints).toEqual(["No ACP"]);
    expect(spec.acceptanceCriteria).toEqual(["Status works"]);
    expect(spec.phases).toEqual([
      { phaseId: "bootstrap", title: "Bootstrap", tasks: ["Init repo", "Add manifest"] },
      { phaseId: "cli", title: "CLI", tasks: ["Implement status"] },
    ]);
  });

  it("uses default project root override when provided", () => {
    const spec = importSpecFromContent("# My Spec\n", "/tmp/spec.md", {
      defaultProjectRoot: path.join("/tmp", "project-root"),
    });

    expect(spec.projectRoot).toBe(path.join("/tmp", "project-root"));
  });
});
