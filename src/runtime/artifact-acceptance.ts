import fs from "node:fs/promises";
import path from "node:path";

export type ArtifactAcceptanceResult = {
  ok: boolean;
  matched: string[];
  missing: string[];
};

const GLOB_CHARS = /[*?]/;
const MAX_GLOB_SCAN_ENTRIES = 20_000;

function globSegmentToRegExp(segment: string): string {
  let pattern = "";
  for (const char of segment) {
    if (char === "*") {
      pattern += "[^/]*";
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return pattern;
}

function globToRegExp(glob: string): RegExp {
  const segments = glob.split("/");
  const parts = segments.map((segment, index) => {
    if (segment === "**") {
      return index === segments.length - 1 ? "(?:[^/]+/)*[^/]+/" : "(?:[^/]+/)*";
    }
    return `${globSegmentToRegExp(segment)}/`;
  });
  const body = parts.join("").replace(/\/$/, "");
  return new RegExp(`^${body}$`);
}

function splitGlobBase(pattern: string): { baseDir: string; relativeGlob: string } {
  const segments = pattern.split("/");
  const firstGlobIndex = segments.findIndex((segment) => GLOB_CHARS.test(segment) || segment === "**");
  const baseSegments = segments.slice(0, firstGlobIndex);
  return {
    baseDir: baseSegments.join("/") || "/",
    relativeGlob: segments.slice(firstGlobIndex).join("/"),
  };
}

async function collectFiles(baseDir: string, budget: { remaining: number }): Promise<string[]> {
  if (budget.remaining <= 0) {
    return [];
  }
  let entries;
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (budget.remaining <= 0) {
      break;
    }
    budget.remaining -= 1;
    const entryPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, budget)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function resolveGlobPattern(pattern: string): Promise<string[]> {
  const { baseDir, relativeGlob } = splitGlobBase(pattern);
  const matcher = globToRegExp(relativeGlob);
  const files = await collectFiles(baseDir, { remaining: MAX_GLOB_SCAN_ENTRIES });
  return files.filter((file) => matcher.test(path.relative(baseDir, file).split(path.sep).join("/")));
}

async function resolveLiteralPath(target: string): Promise<string[]> {
  try {
    const stat = await fs.stat(target);
    return stat.isFile() || stat.isDirectory() ? [target] : [];
  } catch {
    return [];
  }
}

/**
 * Checks each expected artifact pattern (absolute path or glob; relative
 * patterns resolve against projectRoot) and reports which patterns matched
 * at least one existing file.
 */
export async function checkExpectedArtifacts(
  expectedArtifacts: string[],
  projectRoot: string,
): Promise<ArtifactAcceptanceResult> {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const rawPattern of expectedArtifacts) {
    const pattern = path.isAbsolute(rawPattern) ? rawPattern : path.join(projectRoot, rawPattern);
    const normalized = pattern.split(path.sep).join("/");
    const matches = GLOB_CHARS.test(normalized) || normalized.includes("**")
      ? await resolveGlobPattern(normalized)
      : await resolveLiteralPath(pattern);
    if (matches.length === 0) {
      missing.push(rawPattern);
    } else {
      for (const file of matches) {
        if (!matched.includes(file)) {
          matched.push(file);
        }
      }
    }
  }

  return { ok: missing.length === 0, matched, missing };
}
