const PUBLIC_ACP_RUNTIME_VERSION = "2026.3.22";
const VERSION_RULE_PATTERN = /^(<=|>=|<|>|=)\s*(\S+)\s*$/;

type ParsedVersion = [number, number, number] | null;

export function normalizeOpenClawVersion(version?: string | null): string | null {
  if (!version) {
    return null;
  }
  const trimmed = version.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^(\d+\.\d+\.\d+)(?:-[A-Za-z0-9._-]+)?$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  return match[1]!;
}

function parseOpenClawVersion(version?: string | null): ParsedVersion {
  const normalized = normalizeOpenClawVersion(version);
  if (!normalized) {
    return null;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(normalized);
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

export function matchesOpenClawVersionRule(version?: string | null, rule?: string | null): boolean {
  const trimmedRule = rule?.trim();
  if (!trimmedRule) {
    return false;
  }

  const versionText = version?.trim();
  const normalizedVersion = normalizeOpenClawVersion(versionText) ?? versionText;
  const exactRuleMatch = VERSION_RULE_PATTERN.exec(trimmedRule);
  if (!exactRuleMatch) {
    const normalizedRule = normalizeOpenClawVersion(trimmedRule) ?? trimmedRule;
    return versionText === trimmedRule || normalizedVersion === normalizedRule;
  }

  const [, operator, rightVersion] = exactRuleMatch;
  const compared = compareOpenClawVersions(normalizedVersion, rightVersion);
  if (compared === null) {
    return false;
  }

  switch (operator) {
    case "=":
      return compared === 0;
    case ">":
      return compared > 0;
    case ">=":
      return compared >= 0;
    case "<":
      return compared < 0;
    case "<=":
      return compared <= 0;
    default:
      return false;
  }
}

export function matchesOpenClawVersionAllowlist(version?: string | null, rules?: string[] | null): boolean {
  if (!rules || rules.length === 0) {
    return true;
  }
  return rules.some((rule) => matchesOpenClawVersionRule(version, rule));
}

export function supportsPublicAcpRuntime(version?: string | null): boolean {
  const compared = compareOpenClawVersions(version, PUBLIC_ACP_RUNTIME_VERSION);
  return compared !== null && compared >= 0;
}
