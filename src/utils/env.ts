export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

export function getBooleanEnv(name: string, defaultValue = false): boolean {
  const value = getEnv(name);
  if (!value) return defaultValue;
  return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
}
