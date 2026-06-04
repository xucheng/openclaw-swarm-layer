#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "reports",
]);

const rules = [
  {
    name: "macOS user home path",
    pattern: /\/Users\/[A-Za-z0-9._-]+(?:\/[^\s`)"']*)?/g,
    replacement: "<USER_HOME>/...",
  },
  {
    name: "Linux user home path",
    pattern: /\/home\/[A-Za-z0-9._-]+(?:\/[^\s`)"']*)?/g,
    replacement: "<USER_HOME>/...",
  },
  {
    name: "shell home-relative path",
    pattern: /~\/[^\s`)"']+/g,
    replacement: "<USER_HOME>/...",
  },
  {
    name: "temporary local path",
    pattern: /\/tmp\/[^\s`)"']+/g,
    replacement: "<TEMP_DIR>/...",
  },
];

async function collectMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function findViolations(filePath, content) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(line)) !== null) {
        violations.push({
          filePath,
          line: index + 1,
          rule: rule.name,
          match: match[0],
          replacement: rule.replacement,
        });
      }
    }
  });
  return violations;
}

const markdownFiles = await collectMarkdownFiles(repoRoot);
const violations = [];

for (const filePath of markdownFiles) {
  const content = await fs.readFile(filePath, "utf8");
  violations.push(...findViolations(filePath, content));
}

if (violations.length > 0) {
  console.error("Documentation redaction check failed. Replace local machine paths with placeholders.");
  for (const violation of violations) {
    const relativePath = path.relative(repoRoot, violation.filePath);
    console.error(
      `${relativePath}:${violation.line}: ${violation.rule}: ${violation.match} -> ${violation.replacement}`,
    );
  }
  process.exit(1);
}

console.log(`Documentation redaction check passed for ${markdownFiles.length} markdown file(s).`);
