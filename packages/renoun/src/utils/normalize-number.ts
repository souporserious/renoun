export function normalizePositiveInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  const parsed = Math.floor(value)
  return parsed > 0 ? parsed : fallback
}

export function normalizeNonNegativeInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  const parsed = Math.floor(value)
  return parsed >= 0 ? parsed : fallback
}
