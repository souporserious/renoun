import { describe, expect, it } from 'vitest'

import {
  coerceSemVer,
  compareSemVer,
  formatSemVer,
  parseSemVer,
  satisfiesRange,
  type SemVer,
} from './semver'

describe('parseSemVer', () => {
  it('parses standard semantic versions', () => {
    expect(parseSemVer('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    })
  })

  it('parses versions prefixed with v and prerelease identifiers', () => {
    expect(parseSemVer('v1.0.0-alpha.1')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ['alpha', 1],
    })
  })

  it('returns null for invalid versions', () => {
    expect(parseSemVer('invalid')).toBeNull()
  })
})

describe('coerceSemVer', () => {
  it('returns parsed version when possible', () => {
    const parsed = coerceSemVer('  v2.3.4 ')
    expect(parsed).toEqual({
      major: 2,
      minor: 3,
      patch: 4,
      prerelease: [],
    })
  })

  it('coerces from embedded version strings', () => {
    const coerced = coerceSemVer('release-1.2.3+build')
    expect(coerced).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    })
  })

  it('returns null when no version can be found', () => {
    expect(coerceSemVer('no-version-here')).toBeNull()
  })
})

describe('compareSemVer', () => {
  const create = (value: string): SemVer =>
    coerceSemVer(value) ?? { major: 0, minor: 0, patch: 0, prerelease: [] }

  it('orders by major, minor, and patch', () => {
    expect(compareSemVer(create('1.0.0'), create('2.0.0'))).toBeLessThan(0)
    expect(compareSemVer(create('2.1.0'), create('2.1.5'))).toBeLessThan(0)
    expect(compareSemVer(create('2.1.5'), create('2.1.5'))).toBe(0)
  })

  it('treats prereleases as lower precedence than releases', () => {
    expect(compareSemVer(create('1.0.0-beta'), create('1.0.0'))).toBeLessThan(0)
    expect(
      compareSemVer(create('1.0.0'), create('1.0.0-beta'))
    ).toBeGreaterThan(0)
  })

  it('compares prerelease identifiers lexically and numerically', () => {
    expect(
      compareSemVer(create('1.0.0-alpha.1'), create('1.0.0-alpha.beta'))
    ).toBeLessThan(0)
    expect(
      compareSemVer(create('1.0.0-alpha.beta'), create('1.0.0-beta'))
    ).toBeLessThan(0)
    expect(
      compareSemVer(create('1.0.0-beta'), create('1.0.0-beta.2'))
    ).toBeLessThan(0)
  })
})

describe('satisfiesRange', () => {
  const version = (value: string): SemVer =>
    coerceSemVer(value) ?? { major: 0, minor: 0, patch: 0, prerelease: [] }

  it('supports basic comparison operators', () => {
    expect(satisfiesRange(version('1.2.3'), '>=1.0.0 <2.0.0')).toBe(true)
    expect(satisfiesRange(version('2.0.0'), '>=1.0.0 <2.0.0')).toBe(false)
  })

  it('supports wildcard ranges', () => {
    expect(satisfiesRange(version('1.2.3'), '1.x')).toBe(true)
    expect(satisfiesRange(version('2.0.0'), '1.x')).toBe(false)
  })

  it('supports caret and tilde ranges', () => {
    expect(satisfiesRange(version('1.2.3'), '^1.0.0')).toBe(true)
    expect(satisfiesRange(version('2.0.0'), '^1.0.0')).toBe(false)
    expect(satisfiesRange(version('1.4.0'), '~1.3.0')).toBe(false)
    expect(satisfiesRange(version('1.3.5'), '~1.3.0')).toBe(true)
  })

  it('handles hyphen ranges', () => {
    expect(satisfiesRange(version('1.5.0'), '1.0.0 - 2.0.0')).toBe(true)
    expect(satisfiesRange(version('2.1.0'), '1.0.0 - 2.0.0')).toBe(false)
  })

  it('excludes prereleases without explicit equality when includePrerelease is false', () => {
    expect(satisfiesRange(version('1.2.3-beta.1'), '>=1.2.3 <2.0.0')).toBe(
      false
    )
  })

  it('includes prereleases when includePrerelease is true', () => {
    expect(
      satisfiesRange(version('1.2.3-beta.1'), '>=1.2.3-beta.1 <2.0.0', {
        includePrerelease: true,
      })
    ).toBe(true)
  })
})

describe('formatSemVer', () => {
  it('formats release versions without prerelease', () => {
    expect(formatSemVer({ major: 1, minor: 2, patch: 3, prerelease: [] })).toBe(
      '1.2.3'
    )
  })

  it('formats prerelease versions', () => {
    expect(
      formatSemVer({ major: 1, minor: 2, patch: 3, prerelease: ['alpha', 1] })
    ).toBe('1.2.3-alpha.1')
  })
})
