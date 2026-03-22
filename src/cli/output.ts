export function formatOutput(payload: unknown, asJson?: boolean): string {
  if (asJson) {
    return JSON.stringify(payload, null, 2);
  }
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload, null, 2);
}
