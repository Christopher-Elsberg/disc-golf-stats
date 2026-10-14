export function roundTo(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function populationSd(values: number[]): number | null {
  if (values.length === 0) return null;
  const m = mean(values)!;
  const variance = values.reduce((sum, x) => sum + (x - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function newestFirst<T extends { date: string; round_number: number }>(a: T, b: T) {
  const roundCompare = b.round_number - a.round_number;
  if (roundCompare !== 0) return roundCompare;
  return b.date.localeCompare(a.date);
}

export function oldestFirst<T extends { date: string; round_number: number }>(a: T, b: T) {
  const roundCompare = a.round_number - b.round_number;
  if (roundCompare !== 0) return roundCompare;
  return a.date.localeCompare(b.date);
}

export function courseLayoutKey(courseId: string, layoutVersion: number) {
  return `${courseId}:${layoutVersion}`;
}

