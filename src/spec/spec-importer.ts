import fs from "node:fs/promises";
import path from "node:path";
import type { SwarmPluginConfig } from "../config.js";
import type { SpecDoc } from "../types.js";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeLine(line: string): string {
  return line.replace(/^[-*+]\s+/, "").trim();
}

function readSection(lines: string[], heading: string): string[] {
  const normalizedHeading = heading.toLowerCase();
  const start = lines.findIndex((line) => /^##\s+/.test(line) && line.replace(/^##\s+/, "").trim().toLowerCase() === normalizedHeading);
  if (start === -1) {
    return [];
  }
  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) {
      break;
    }
    if (/^[-*+]\s+/.test(line)) {
      section.push(normalizeLine(line));
    }
  }
  return section;
}

function readPhases(lines: string[]): SpecDoc["phases"] {
  const phasesStart = lines.findIndex((line) => /^##\s+phases/i.test(line) || /^##\s+阶段/.test(line));
  if (phasesStart === -1) {
    return [];
  }

  const phases: SpecDoc["phases"] = [];
  let current: SpecDoc["phases"][number] | null = null;

  for (let index = phasesStart + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) {
      break;
    }
    if (/^###\s+/.test(line)) {
      const title = line.replace(/^###\s+/, "").trim();
      current = {
        phaseId: slugify(title) || `phase-${phases.length + 1}`,
        title,
        tasks: [],
      };
      phases.push(current);
      continue;
    }
    if (current && /^[-*+]\s+/.test(line)) {
      current.tasks.push(normalizeLine(line));
    }
  }

  return phases;
}

export async function importSpecFromMarkdown(
  specPath: string,
  config?: Pick<SwarmPluginConfig, "defaultProjectRoot">,
): Promise<SpecDoc> {
  const markdown = await fs.readFile(specPath, "utf8");
  return importSpecFromContent(markdown, specPath, config);
}

export function importSpecFromContent(
  markdown: string,
  specPath: string,
  config?: Pick<SwarmPluginConfig, "defaultProjectRoot">,
): SpecDoc {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => /^#\s+/.test(line));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : path.basename(specPath, path.extname(specPath));
  const projectRoot = config?.defaultProjectRoot ? path.resolve(config.defaultProjectRoot) : path.dirname(path.resolve(specPath));
  const specId = slugify(title) || path.basename(specPath, path.extname(specPath));

  return {
    specId,
    title,
    sourcePath: path.resolve(specPath),
    projectRoot,
    goals: readSection(lines, "goals"),
    constraints: readSection(lines, "constraints"),
    acceptanceCriteria: readSection(lines, "acceptance criteria"),
    phases: readPhases(lines),
  };
}
