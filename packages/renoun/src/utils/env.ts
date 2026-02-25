export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') {
    return true
  }

  if (normalized === '0' || normalized === 'false') {
    return false
  }

  return undefined
}
