export function parseMoney(value: string): number | null {
  const normalized = value.replace(/\s+/g, "").replace(",", ".").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMoney(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function formatPercent(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}
