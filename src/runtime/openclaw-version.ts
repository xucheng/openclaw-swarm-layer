const PUBLIC_ACP_RUNTIME_VERSION = "2026.3.22";

type ParsedVersion = [number, number, number] | null;

function parseOpenClawVersion(version?: string | null): ParsedVersion {
  if (!version) {
    return null;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareOpenClawVersions(left?: string | null, right?: string | null): number | null {
  const leftParsed = parseOpenClawVersion(left);
  const rightParsed = parseOpenClawVersion(right);
  if (!leftParsed || !rightParsed) {
    return null;
  }
  for (let index = 0; index < leftParsed.length; index += 1) {
    if (leftParsed[index] !== rightParsed[index]) {
      return leftParsed[index] - rightParsed[index];
    }
  }
  return 0;
}

export function supportsPublicAcpRuntime(version?: string | null): boolean {
  const compared = compareOpenClawVersions(version, PUBLIC_ACP_RUNTIME_VERSION);
  return compared !== null && compared >= 0;
}
