import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function readDirectoryJsonFiles<T>(dirPath: string): Promise<T[]> {
  if (!(await pathExists(dirPath))) {
    return [];
  }
  const names = await fs.readdir(dirPath);
  const jsonNames = names.filter((name) => name.endsWith(".json")).sort();
  const items = await Promise.all(jsonNames.map(async (name) => readJsonFile<T>(path.join(dirPath, name))));
  const results: T[] = [];
  for (const item of items) {
    if (item !== null) {
      results.push(item);
    }
  }
  return results;
}
