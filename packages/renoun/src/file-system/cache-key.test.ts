import { describe, expect, test } from 'vitest'

import { serializeTypeFilterForCache } from './cache-key.ts'

describe('serializeTypeFilterForCache', () => {
  test('normalizes module/type ordering for deterministic output', () => {
    const first = [
      {
        moduleSpecifier: 'pkg-b',
        types: [
          {
            name: 'z',
            properties: ['z', 'a', 'm'],
          },
          {
            name: 'a',
            properties: ['q'],
          },
        ],
      },
      {
        moduleSpecifier: 'pkg-a',
        types: [
          {
            name: 'beta',
          },
          {
            name: 'alpha',
            properties: ['value', 'id'],
          },
        ],
      },
    ]

    const second = [
      {
        moduleSpecifier: 'pkg-a',
        types: [
          {
            name: 'alpha',
            properties: ['id', 'value'],
          },
          {
            name: 'beta',
            // missing properties should normalize the same as an explicit `undefined`.
            // Intentionally left unconfigured.
          },
        ],
      },
      {
        moduleSpecifier: 'pkg-b',
        types: [
          {
            name: 'a',
            properties: ['q'],
          },
          {
            name: 'z',
            properties: ['m', 'a', 'z'],
          },
        ],
      },
    ]

    expect(serializeTypeFilterForCache(first)).toBe(
      serializeTypeFilterForCache(second)
    )
  })

  test('normalizes array and object form equivalently', () => {
    const asArray = [
      { moduleSpecifier: 'a', types: [{ name: 'Beta' }, { name: 'Alpha' }] },
    ]
    const asSingle = {
      moduleSpecifier: 'a',
      types: [{ name: 'Alpha' }, { name: 'Beta' }],
    } as const

    expect(serializeTypeFilterForCache(asArray)).toBe(
      serializeTypeFilterForCache(asSingle)
    )
  })
})
