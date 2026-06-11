import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkExpectedArtifacts } from "../../../src/runtime/artifact-acceptance.js";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-artifacts-"));
}

describe("checkExpectedArtifacts", () => {
  it("matches existing literal paths", async () => {
    const dir = await makeTempDir();
    const file = path.join(dir, "note.md");
    await fs.writeFile(file, "# note", "utf8");

    const result = await checkExpectedArtifacts([file], dir);

    expect(result.ok).toBe(true);
    expect(result.matched).toEqual([file]);
    expect(result.missing).toEqual([]);
  });

  it("reports missing literal paths", async () => {
    const dir = await makeTempDir();

    const result = await checkExpectedArtifacts([path.join(dir, "missing.md")], dir);

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([path.join(dir, "missing.md")]);
  });

  it("resolves relative patterns against the project root", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, "report.json"), "{}", "utf8");

    const result = await checkExpectedArtifacts(["report.json"], dir);

    expect(result.ok).toBe(true);
    expect(result.matched).toEqual([path.join(dir, "report.json")]);
  });

  it("matches deep glob patterns like the Daily Papers note layout", async () => {
    const dir = await makeTempDir();
    const noteDir = path.join(dir, "Research", "01-论文分析", "2026-06");
    await fs.mkdir(noteDir, { recursive: true });
    const note = path.join(noteDir, "2606.11722-ica-lens.md");
    await fs.writeFile(note, "# paper", "utf8");

    const result = await checkExpectedArtifacts([path.join(dir, "**", "2606.11722-*.md")], dir);

    expect(result.ok).toBe(true);
    expect(result.matched).toEqual([note]);
  });

  it("fails glob patterns with no matching files", async () => {
    const dir = await makeTempDir();
    await fs.mkdir(path.join(dir, "Research"), { recursive: true });

    const result = await checkExpectedArtifacts([path.join(dir, "**", "2606.11722-*.md")], dir);

    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(1);
  });

  it("matches single-star globs only within one segment", async () => {
    const dir = await makeTempDir();
    await fs.mkdir(path.join(dir, "a"), { recursive: true });
    await fs.writeFile(path.join(dir, "a", "x.md"), "x", "utf8");

    const flat = await checkExpectedArtifacts([path.join(dir, "*.md")], dir);
    const nested = await checkExpectedArtifacts([path.join(dir, "a", "*.md")], dir);

    expect(flat.ok).toBe(false);
    expect(nested.ok).toBe(true);
  });
});
