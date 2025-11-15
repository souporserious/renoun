export interface SemVer {
  major: number
  minor: number
  patch: number
  prerelease: (string | number)[]
}

function createSemVer(
  major: number,
  minor: number,
  patch: number,
  prerelease: (string | number)[] = []
): SemVer {
  return { major, minor, patch, prerelease }
}

function parsePrerelease(input: string | undefined): (string | number)[] {
  if (!input) {
    return []
  }

  return input
    .split('.')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const numeric = Number(segment)
      return Number.isNaN(numeric) ? segment : numeric
    })
}

function normalizeVersionParts(
  major: string | undefined,
  minor: string | undefined,
  patch: string | undefined
): [number, number, number] {
  const majorNumber = Number(major ?? 0)
  const minorNumber = Number(minor ?? 0)
  const patchNumber = Number(patch ?? 0)

  return [majorNumber, minorNumber, patchNumber]
}

export function parseSemVer(input: string): SemVer | null {
  const trimmed = input.trim()
  const match = trimmed.match(
    /^v?(?<major>\d+)(?:\.(?<minor>\d+))?(?:\.(?<patch>\d+))?(?:-(?<prerelease>[0-9A-Za-z-.]+))?$/
  )

  if (!match || !match.groups?.['major']) {
    return null
  }

  const [major, minor, patch] = normalizeVersionParts(
    match.groups['major'],
    match.groups['minor'],
    match.groups['patch']
  )

  return createSemVer(
    major,
    minor,
    patch,
    parsePrerelease(match.groups['prerelease'])
  )
}

export function coerceSemVer(input: string): SemVer | null {
  const direct = parseSemVer(input)
  if (direct) {
    return direct
  }

  const regex = /v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input))) {
    if (!match[1]) {
      continue
    }
    const [major, minor, patch] = normalizeVersionParts(
      match[1],
      match[2],
      match[3]
    )
    return createSemVer(major, minor, patch, parsePrerelease(match[4]))
  }

  return null
}

export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) {
    return a.major - b.major
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor
  }
  if (a.patch !== b.patch) {
    return a.patch - b.patch
  }

  const aPrerelease = a.prerelease
  const bPrerelease = b.prerelease

  if (aPrerelease.length === 0 && bPrerelease.length === 0) {
    return 0
  }
  if (aPrerelease.length === 0) {
    return 1
  }
  if (bPrerelease.length === 0) {
    return -1
  }

  const length = Math.max(aPrerelease.length, bPrerelease.length)

  for (let index = 0; index < length; index++) {
    const aId = aPrerelease[index]
    const bId = bPrerelease[index]

    if (aId === undefined) {
      return -1
    }
    if (bId === undefined) {
      return 1
    }
    if (aId === bId) {
      continue
    }

    const aIsNumber = typeof aId === 'number'
    const bIsNumber = typeof bId === 'number'

    if (aIsNumber && bIsNumber) {
      return (aId as number) - (bId as number)
    }
    if (aIsNumber) {
      return -1
    }
    if (bIsNumber) {
      return 1
    }

    return String(aId).localeCompare(String(bId))
  }

  return 0
}

type ComparatorOperator = '>' | '>=' | '<' | '<=' | '='

interface Comparator {
  operator: ComparatorOperator
  version: SemVer
}

function incrementForCaret(version: SemVer): SemVer {
  if (version.major > 0) {
    return createSemVer(version.major + 1, 0, 0)
  }
  if (version.minor > 0) {
    return createSemVer(0, version.minor + 1, 0)
  }
  return createSemVer(0, 0, version.patch + 1)
}

function expandWildcard(token: string): Comparator[] | null {
  const parts = token.split('.')
  if (parts.length === 0) {
    return []
  }

  const [majorPart, minorPart, patchPart] = parts
  const major = Number(majorPart)
  if (Number.isNaN(major)) {
    return null
  }

  const minorWildcard =
    minorPart === undefined || /^(x|\*)$/i.test(minorPart ?? '')
  const patchWildcard =
    patchPart === undefined || /^(x|\*)$/i.test(patchPart ?? '')

  if (minorWildcard) {
    const lower = createSemVer(major, 0, 0)
    const upper = createSemVer(major + 1, 0, 0)
    return [
      { operator: '>=', version: lower },
      { operator: '<', version: upper },
    ]
  }

  const minor = Number(minorPart)
  if (Number.isNaN(minor)) {
    return null
  }

  if (patchWildcard) {
    const lower = createSemVer(major, minor, 0)
    const upper = createSemVer(major, minor + 1, 0)
    return [
      { operator: '>=', version: lower },
      { operator: '<', version: upper },
    ]
  }

  return null
}

function expandCaret(token: string): Comparator[] | null {
  const version = coerceSemVer(token)
  if (!version) {
    return null
  }

  return [
    { operator: '>=', version },
    { operator: '<', version: incrementForCaret(version) },
  ]
}

function expandTilde(token: string): Comparator[] | null {
  const version = coerceSemVer(token)
  if (!version) {
    return null
  }

  const parts = token.split('.')
  const hasMinor = parts.length > 1 && parts[1] !== ''

  const upper = hasMinor
    ? createSemVer(version.major, version.minor + 1, 0)
    : createSemVer(version.major + 1, 0, 0)

  return [
    { operator: '>=', version },
    { operator: '<', version: upper },
  ]
}

function expandComparatorToken(token: string): Comparator[] | null {
  if (!token || token === '*') {
    return []
  }

  if (token.toLowerCase() === 'x') {
    return []
  }

  if (token.startsWith('^')) {
    return expandCaret(token.slice(1))
  }

  if (token.startsWith('~')) {
    return expandTilde(token.slice(1))
  }

  const wildcardComparators = expandWildcard(token)
  if (wildcardComparators) {
    return wildcardComparators
  }

  const comparatorMatch = token.match(/^(>=|<=|>|<|=)?(.*)$/)
  if (!comparatorMatch) {
    return null
  }

  const operator = (comparatorMatch[1] as ComparatorOperator | undefined) ?? '='
  const versionToken = comparatorMatch[2]

  if (!versionToken) {
    return []
  }

  const version = coerceSemVer(versionToken)
  if (!version) {
    return null
  }

  return [{ operator, version }]
}

function parseComparatorSet(range: string): {
  comparators: Comparator[]
  invalid: boolean
} {
  const comparators: Comparator[] = []
  const trimmed = range.trim()
  if (!trimmed) {
    return { comparators, invalid: false }
  }

  const hyphenMatch = trimmed.match(/^(.*)\s-\s(.*)$/)
  if (hyphenMatch) {
    const lower = coerceSemVer(hyphenMatch[1])
    const upper = coerceSemVer(hyphenMatch[2])
    if (!lower || !upper) {
      return { comparators: [], invalid: true }
    }

    comparators.push({ operator: '>=', version: lower })
    comparators.push({ operator: '<=', version: upper })
    return { comparators, invalid: false }
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    const expanded = expandComparatorToken(token)
    if (expanded === null) {
      return { comparators: [], invalid: true }
    }
    comparators.push(...expanded)
  }

  return { comparators, invalid: false }
}

function compareWithOperator(version: SemVer, comparator: Comparator): boolean {
  const result = compareSemVer(version, comparator.version)

  switch (comparator.operator) {
    case '>':
      return result > 0
    case '>=':
      return result >= 0
    case '<':
      return result < 0
    case '<=':
      return result <= 0
    case '=':
    default:
      return result === 0
  }
}

export function satisfiesRange(
  version: SemVer,
  range: string,
  options?: { includePrerelease?: boolean }
): boolean {
  const includePrerelease = options?.includePrerelease ?? false
  const sets = range
    .split('||')
    .map((set) => set.trim())
    .filter((set) => set.length > 0)

  if (sets.length === 0) {
    return true
  }

  for (const set of sets) {
    const { comparators, invalid } = parseComparatorSet(set)
    if (invalid) {
      continue
    }

    if (!includePrerelease && version.prerelease.length > 0) {
      const hasExplicitEquality = comparators.some(
        (comparator) =>
          comparator.operator === '=' &&
          compareSemVer(version, comparator.version) === 0
      )

      if (!hasExplicitEquality) {
        continue
      }
    }

    if (
      comparators.every((comparator) =>
        compareWithOperator(version, comparator)
      )
    ) {
      return true
    }
  }

  return false
}

export function formatSemVer(version: SemVer): string {
  const base = `${version.major}.${version.minor}.${version.patch}`
  if (version.prerelease.length === 0) {
    return base
  }
  return `${base}-${version.prerelease.join('.')}`
}
