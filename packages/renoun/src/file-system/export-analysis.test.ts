import { describe, expect, it } from 'vitest'

import {
  scanModuleExports,
  parseExportId,
  formatExportId,
  isBarrelFile,
  getDiceSimilarity,
  buildExportComparisonMaps,
  mergeRenameHistory,
  detectCrossFileRenames,
  detectSameNameMoves,
  checkAndCollapseOscillation,
  type ExportItem,
} from './export-analysis'

describe('scanModuleExports', () => {
  describe('export default identifier resolution', () => {
    it('hashes the declaration body, not the export statement, for export default Identifier', () => {
      const contentV1 = [
        'class NodeBuilder {',
        '  constructor() {}',
        '  build() { return 1 }',
        '}',
        'export default NodeBuilder;',
      ].join('\n')

      const contentV2 = [
        'class NodeBuilder {',
        '  constructor() {}',
        '  build() { return 2 }',
        '  newMethod() {}',
        '}',
        'export default NodeBuilder;',
      ].join('\n')

      const exportsV1 = scanModuleExports('NodeBuilder.js', contentV1)
      const exportsV2 = scanModuleExports('NodeBuilder.js', contentV2)

      const defaultV1 = exportsV1.get('default')!
      const defaultV2 = exportsV2.get('default')!

      expect(defaultV1).toBeDefined()
      expect(defaultV2).toBeDefined()

      // Body hash must change because the class body changed
      expect(defaultV1.bodyHash).not.toBe(defaultV2.bodyHash)

      // Signature hash must change because new method was added
      expect(defaultV1.signatureHash).not.toBe(defaultV2.signatureHash)
    })

    it('keeps the same hash when the declaration is unchanged', () => {
      const content = [
        'function helper() { return 42 }',
        'export default helper;',
      ].join('\n')

      const exports1 = scanModuleExports('helper.js', content)
      const exports2 = scanModuleExports('helper.js', content)

      expect(exports1.get('default')!.bodyHash).toBe(
        exports2.get('default')!.bodyHash
      )
      expect(exports1.get('default')!.signatureHash).toBe(
        exports2.get('default')!.signatureHash
      )
    })

    it('falls back to the export statement when identifier is not found', () => {
      // The identifier references something not declared in the file
      // (e.g. imported from another module). Should still produce a valid export.
      const content = 'export default SomeExternalThing;'

      const exports = scanModuleExports('fallback.js', content)
      const defaultExport = exports.get('default')!

      expect(defaultExport).toBeDefined()
      expect(defaultExport.bodyHash).toBeTruthy()
    })

    it('works with export default function declaration (inline)', () => {
      const content = 'export default function greet() { return "hi" }'
      const exports = scanModuleExports('greet.js', content)

      expect(exports.get('default')).toBeDefined()
      expect(exports.get('default')!.id).toBe('__LOCAL__')
    })

    it('works with export default class declaration (inline)', () => {
      const content = 'export default class Foo { bar() {} }'
      const exports = scanModuleExports('Foo.ts', content)

      expect(exports.get('default')).toBeDefined()
      expect(exports.get('default')!.id).toBe('__LOCAL__')
    })
  })

  describe('export { X } local re-export resolution', () => {
    it('hashes the declaration body, not the export specifier', () => {
      const contentV1 = [
        'function greet() { return "hello" }',
        'export { greet }',
      ].join('\n')

      const contentV2 = [
        'function greet() { return "goodbye" }',
        'export { greet }',
      ].join('\n')

      const exportsV1 = scanModuleExports('greet.ts', contentV1)
      const exportsV2 = scanModuleExports('greet.ts', contentV2)

      const greetV1 = exportsV1.get('greet')!
      const greetV2 = exportsV2.get('greet')!

      expect(greetV1).toBeDefined()
      expect(greetV2).toBeDefined()

      // Body hash must change because the function body changed
      expect(greetV1.bodyHash).not.toBe(greetV2.bodyHash)
    })

    it('resolves renamed specifiers to the original declaration', () => {
      const contentV1 = [
        'const value = 1;',
        'export { value as myValue }',
      ].join('\n')

      const contentV2 = [
        'const value = 999;',
        'export { value as myValue }',
      ].join('\n')

      const exportsV1 = scanModuleExports('mod.ts', contentV1)
      const exportsV2 = scanModuleExports('mod.ts', contentV2)

      const v1 = exportsV1.get('myValue')!
      const v2 = exportsV2.get('myValue')!

      expect(v1).toBeDefined()
      expect(v2).toBeDefined()
      expect(v1.bodyHash).not.toBe(v2.bodyHash)
    })

    it('keeps the same hash when the declaration is unchanged', () => {
      const content = [
        'class Widget { render() {} }',
        'export { Widget }',
      ].join('\n')

      const exports1 = scanModuleExports('widget.ts', content)
      const exports2 = scanModuleExports('widget.ts', content)

      expect(exports1.get('Widget')!.bodyHash).toBe(
        exports2.get('Widget')!.bodyHash
      )
    })
  })

  describe('named exports', () => {
    it('detects exported function declarations', () => {
      const content =
        'export function doThing(x: number): string { return String(x) }'
      const exports = scanModuleExports('mod.ts', content)

      const item = exports.get('doThing')!
      expect(item).toBeDefined()
      expect(item.name).toBe('doThing')
      expect(item.id).toBe('__LOCAL__')
    })

    it('detects exported class declarations', () => {
      const content = 'export class MyClass { method() {} }'
      const exports = scanModuleExports('mod.ts', content)

      expect(exports.get('MyClass')).toBeDefined()
    })

    it('detects exported const declarations', () => {
      const content = 'export const FOO = 42;'
      const exports = scanModuleExports('mod.ts', content)

      expect(exports.get('FOO')).toBeDefined()
    })

    it('detects exported type aliases', () => {
      const content = 'export type Foo = { bar: string }'
      const exports = scanModuleExports('mod.ts', content)

      expect(exports.get('Foo')).toBeDefined()
    })

    it('detects exported interfaces', () => {
      const content = 'export interface IFoo { bar: string }'
      const exports = scanModuleExports('mod.ts', content)

      expect(exports.get('IFoo')).toBeDefined()
    })

    it('detects exported enums', () => {
      const content = 'export enum Color { Red, Green, Blue }'
      const exports = scanModuleExports('mod.ts', content)

      expect(exports.get('Color')).toBeDefined()
    })

    it('detects destructured exports', () => {
      const content = 'export const { a, b } = { a: 1, b: 2 };'
      const exports = scanModuleExports('mod.ts', content)

      expect(exports.get('a')).toBeDefined()
      expect(exports.get('b')).toBeDefined()
    })
  })

  describe('re-exports', () => {
    it('detects named re-exports from module specifier', () => {
      const content = "export { Foo, Bar as Baz } from './other'"
      const exports = scanModuleExports('index.ts', content)

      const foo = exports.get('Foo')!
      expect(foo).toBeDefined()
      expect(foo.id).toBe('__FROM__./other')

      const baz = exports.get('Baz')!
      expect(baz).toBeDefined()
      expect(baz.sourceName).toBe('Bar')
    })

    it('detects star re-exports', () => {
      const content = "export * from './utils'"
      const exports = scanModuleExports('index.ts', content)

      expect(exports.get('__STAR__./utils')).toBeDefined()
    })

    it('detects namespace re-exports', () => {
      const content = "export * as Utils from './utils'"
      const exports = scanModuleExports('index.ts', content)

      const ns = exports.get('Utils')!
      expect(ns).toBeDefined()
      expect(ns.id).toBe('__NAMESPACE__./utils')
    })
  })

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc on functions', () => {
      const content = [
        '/** @deprecated Use newThing instead */',
        'export function oldThing() {}',
      ].join('\n')

      const exports = scanModuleExports('mod.ts', content)
      const item = exports.get('oldThing')!

      expect(item.deprecated).toBe(true)
      expect(item.deprecatedMessage).toBe('Use newThing instead')
    })

    it('detects @deprecated JSDoc on classes', () => {
      const content = ['/** @deprecated */', 'export class OldClass {}'].join(
        '\n'
      )

      const exports = scanModuleExports('mod.ts', content)
      expect(exports.get('OldClass')!.deprecated).toBe(true)
    })

    it('detects @deprecated on export { X } via declaration', () => {
      const content = [
        '/** @deprecated Use something else */',
        'function oldFn() {}',
        'export { oldFn }',
      ].join('\n')

      const exports = scanModuleExports('mod.ts', content)
      const item = exports.get('oldFn')!

      expect(item.deprecated).toBe(true)
      expect(item.deprecatedMessage).toBe('Use something else')
    })

    it('preserves {@link} target name in deprecation message', () => {
      const content = [
        '/** @deprecated Use {@link NewThing} instead */',
        'export function oldThing() {}',
      ].join('\n')

      const exports = scanModuleExports('mod.ts', content)
      const item = exports.get('oldThing')!

      expect(item.deprecated).toBe(true)
      expect(item.deprecatedMessage).toBe('Use NewThing instead')
    })

    it('preserves {@link} with display text in deprecation message', () => {
      const content = [
        '/** @deprecated Use {@link NewThing the new API} instead */',
        'export function oldThing() {}',
      ].join('\n')

      const exports = scanModuleExports('mod.ts', content)
      const item = exports.get('oldThing')!

      expect(item.deprecated).toBe(true)
      expect(item.deprecatedMessage).toBe('Use NewThing the new API instead')
    })
  })

  describe('line numbers', () => {
    it('provides start and end line numbers for exports', () => {
      const content = [
        'export function foo() {', // line 1
        '  return 1', // line 2
        '}', // line 3
        '', // line 4
        'export const bar = 2;', // line 5
      ].join('\n')

      const exports = scanModuleExports('mod.ts', content)

      expect(exports.get('foo')!.startLine).toBe(1)
      expect(exports.get('foo')!.endLine).toBe(3)

      expect(exports.get('bar')!.startLine).toBe(5)
      expect(exports.get('bar')!.endLine).toBe(5)
    })
  })
})

describe('parseExportId', () => {
  it('parses a valid export ID', () => {
    expect(parseExportId('src/foo.ts::MyExport')).toEqual({
      file: 'src/foo.ts',
      name: 'MyExport',
    })
  })

  it('returns null for invalid ID', () => {
    expect(parseExportId('no-separator')).toBeNull()
  })

  it('handles default export', () => {
    expect(parseExportId('src/bar.js::default')).toEqual({
      file: 'src/bar.js',
      name: 'default',
    })
  })
})

describe('formatExportId', () => {
  it('formats a file and name into an export ID', () => {
    expect(formatExportId('src/foo.ts', 'MyExport')).toBe(
      'src/foo.ts::MyExport'
    )
  })

  it('roundtrips with parseExportId', () => {
    const id = formatExportId('path/to/file.ts', 'Thing')
    const parsed = parseExportId(id)
    expect(parsed).toEqual({ file: 'path/to/file.ts', name: 'Thing' })
  })
})

describe('isBarrelFile', () => {
  it('returns true for a module with only relative re-exports', () => {
    const exports = new Map<string, ExportItem>([
      [
        'Foo',
        {
          name: 'Foo',
          id: '__FROM__./foo',
          bodyHash: 'a',
          signatureHash: 'b',
          signatureText: '',
        },
      ],
      [
        '__STAR__./bar',
        {
          name: '*',
          id: '__STAR__./bar',
          bodyHash: 'c',
          signatureHash: 'd',
          signatureText: '',
        },
      ],
    ])

    expect(isBarrelFile(exports)).toBe(true)
  })

  it('returns false when there are local exports', () => {
    const exports = new Map<string, ExportItem>([
      [
        'local',
        {
          name: 'local',
          id: '__LOCAL__',
          bodyHash: 'a',
          signatureHash: 'b',
          signatureText: '',
        },
      ],
      [
        'Foo',
        {
          name: 'Foo',
          id: '__FROM__./foo',
          bodyHash: 'c',
          signatureHash: 'd',
          signatureText: '',
        },
      ],
    ])

    expect(isBarrelFile(exports)).toBe(false)
  })

  it('returns false when there are non-relative re-exports', () => {
    const exports = new Map<string, ExportItem>([
      [
        'React',
        {
          name: 'React',
          id: '__FROM__react',
          bodyHash: 'a',
          signatureHash: 'b',
          signatureText: '',
        },
      ],
    ])

    expect(isBarrelFile(exports)).toBe(false)
  })

  it('returns false for an empty export map', () => {
    expect(isBarrelFile(new Map())).toBe(false)
  })
})

describe('getDiceSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(getDiceSimilarity('hello', 'hello')).toBe(1.0)
  })

  it('returns 0.0 for completely different strings', () => {
    expect(getDiceSimilarity('ab', 'yz')).toBe(0.0)
  })

  it('returns 0.0 for single-character strings', () => {
    expect(getDiceSimilarity('a', 'b')).toBe(0.0)
  })

  it('returns a value between 0 and 1 for similar strings', () => {
    const score = getDiceSimilarity('NodeBuilder', 'NodeParser')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })
})

describe('buildExportComparisonMaps', () => {
  function makeItem(name: string, id: string): ExportItem {
    return {
      name,
      id,
      bodyHash: 'h1',
      signatureHash: 's1',
      signatureText: '',
    }
  }

  it('builds previousById and currentById correctly', () => {
    const previous = new Map([
      ['Foo', new Map([['a::Foo', makeItem('Foo', 'a::Foo')]])],
    ])
    const current = new Map([
      ['Bar', new Map([['b::Bar', makeItem('Bar', 'b::Bar')]])],
    ])

    const result = buildExportComparisonMaps(previous, current)

    expect(result.previousById.has('a::Foo')).toBe(true)
    expect(result.currentById.has('b::Bar')).toBe(true)
  })

  it('builds previousNamesById mapping', () => {
    const previous = new Map([
      ['Foo', new Map([['a::Foo', makeItem('Foo', 'a::Foo')]])],
      ['AliasFoo', new Map([['a::Foo', makeItem('AliasFoo', 'a::Foo')]])],
    ])
    const current = new Map<string, Map<string, ExportItem>>()

    const result = buildExportComparisonMaps(previous, current)
    const names = result.previousNamesById.get('a::Foo')

    expect(names).toBeDefined()
    expect(names!.has('Foo')).toBe(true)
    expect(names!.has('AliasFoo')).toBe(true)
  })
})

describe('mergeRenameHistory', () => {
  it('moves old history to new ID when new history is empty', () => {
    const exports: Record<string, string[]> = {
      'old::Foo': ['event1', 'event2'],
    }

    const result = mergeRenameHistory(exports, 'new::Foo', 'old::Foo')

    expect(result).toEqual(['event1', 'event2'])
    expect(exports['new::Foo']).toBe(result)
    expect(exports['old::Foo']).toBeUndefined()
  })

  it('concatenates when both have history', () => {
    const exports: Record<string, string[]> = {
      'old::Foo': ['event1'],
      'new::Foo': ['event2'],
    }

    const result = mergeRenameHistory(exports, 'new::Foo', 'old::Foo')

    expect(result).toEqual(['event1', 'event2'])
    expect(exports['old::Foo']).toBeUndefined()
  })

  it('creates new history when neither exists', () => {
    const exports: Record<string, string[]> = {}

    const result = mergeRenameHistory(exports, 'new::Foo', 'old::Foo')

    expect(result).toEqual([])
    expect(exports['new::Foo']).toBe(result)
  })
})

describe('detectSameNameMoves', () => {
  function makeItem(
    name: string,
    id: string,
    bodyHash: string,
    signatureHash: string,
    signatureText: string = ''
  ): ExportItem {
    return { name, id, bodyHash, signatureHash, signatureText }
  }

  it('detects re-export move when same name resolves to different file', () => {
    // timerGlobal was in TimerNode.js, now in Timer.js
    const previousExports = new Map([
      [
        'timerGlobal',
        new Map([
          [
            'src/utils/TimerNode.js::timerGlobal',
            makeItem(
              'timerGlobal',
              'src/utils/TimerNode.js::timerGlobal',
              'h1',
              's1'
            ),
          ],
        ]),
      ],
    ])
    const currentExports = new Map([
      [
        'timerGlobal',
        new Map([
          [
            'src/utils/Timer.js::timerGlobal',
            makeItem(
              'timerGlobal',
              'src/utils/Timer.js::timerGlobal',
              'h1',
              's1'
            ),
          ],
        ]),
      ],
    ])
    const { previousById, currentById } = buildExportComparisonMaps(
      previousExports,
      currentExports
    )
    const removedIds = ['src/utils/TimerNode.js::timerGlobal']
    const usedRemovedIds = new Set<string>()
    const renamePairs = new Map<string, { oldId: string }>()

    detectSameNameMoves(
      previousExports,
      currentExports,
      previousById,
      currentById,
      removedIds,
      usedRemovedIds,
      renamePairs
    )

    expect(renamePairs.get('src/utils/Timer.js::timerGlobal')).toEqual({
      oldId: 'src/utils/TimerNode.js::timerGlobal',
    })
    expect(usedRemovedIds.has('src/utils/TimerNode.js::timerGlobal')).toBe(true)
  })

  it('detects move even when signatures differ', () => {
    // Same public name, same underlying name, but different signature
    const previousExports = new Map([
      [
        'foo',
        new Map([
          [
            'a.js::foo',
            makeItem('foo', 'a.js::foo', 'h1', 's1', 'function foo(): void'),
          ],
        ]),
      ],
    ])
    const currentExports = new Map([
      [
        'foo',
        new Map([
          [
            'b.js::foo',
            makeItem('foo', 'b.js::foo', 'h2', 's2', 'function foo(): string'),
          ],
        ]),
      ],
    ])
    const { previousById, currentById } = buildExportComparisonMaps(
      previousExports,
      currentExports
    )
    const removedIds = ['a.js::foo']
    const usedRemovedIds = new Set<string>()
    const renamePairs = new Map<string, { oldId: string }>()

    detectSameNameMoves(
      previousExports,
      currentExports,
      previousById,
      currentById,
      removedIds,
      usedRemovedIds,
      renamePairs
    )

    // Should still match because the underlying name (foo) matches
    expect(renamePairs.get('b.js::foo')).toEqual({ oldId: 'a.js::foo' })
  })

  it('skips IDs already claimed by earlier rename passes', () => {
    const previousExports = new Map([
      [
        'foo',
        new Map([['a.js::foo', makeItem('foo', 'a.js::foo', 'h1', 's1')]]),
      ],
    ])
    const currentExports = new Map([
      [
        'foo',
        new Map([['b.js::foo', makeItem('foo', 'b.js::foo', 'h1', 's1')]]),
      ],
    ])
    const { previousById, currentById } = buildExportComparisonMaps(
      previousExports,
      currentExports
    )
    const removedIds = ['a.js::foo']
    // Already claimed by a previous pass
    const usedRemovedIds = new Set<string>(['a.js::foo'])
    const renamePairs = new Map<string, { oldId: string }>()

    detectSameNameMoves(
      previousExports,
      currentExports,
      previousById,
      currentById,
      removedIds,
      usedRemovedIds,
      renamePairs
    )

    expect(renamePairs.size).toBe(0)
  })

  it('does not match when no IDs are removed under the name', () => {
    const previousExports = new Map([
      [
        'foo',
        new Map([['a.js::foo', makeItem('foo', 'a.js::foo', 'h1', 's1')]]),
      ],
    ])
    const currentExports = new Map([
      [
        'foo',
        new Map([
          // a.js::foo still exists, b.js::foo is genuinely new
          ['a.js::foo', makeItem('foo', 'a.js::foo', 'h1', 's1')],
          ['b.js::foo', makeItem('foo', 'b.js::foo', 'h2', 's2')],
        ]),
      ],
    ])
    const { previousById, currentById } = buildExportComparisonMaps(
      previousExports,
      currentExports
    )
    const removedIds: string[] = [] // nothing removed
    const usedRemovedIds = new Set<string>()
    const renamePairs = new Map<string, { oldId: string }>()

    detectSameNameMoves(
      previousExports,
      currentExports,
      previousById,
      currentById,
      removedIds,
      usedRemovedIds,
      renamePairs
    )

    expect(renamePairs.size).toBe(0)
  })

  it('handles many-to-one merge (picks best match)', () => {
    // Two sources merged into one: match the one with same underlying name
    const previousExports = new Map([
      [
        'foo',
        new Map([
          ['a.js::foo', makeItem('foo', 'a.js::foo', 'h1', 's1')],
          ['b.js::bar', makeItem('foo', 'b.js::bar', 'h2', 's2')],
        ]),
      ],
    ])
    const currentExports = new Map([
      [
        'foo',
        new Map([['c.js::foo', makeItem('foo', 'c.js::foo', 'h1', 's1')]]),
      ],
    ])
    const { previousById, currentById } = buildExportComparisonMaps(
      previousExports,
      currentExports
    )
    const removedIds = ['a.js::foo', 'b.js::bar']
    const usedRemovedIds = new Set<string>()
    const renamePairs = new Map<string, { oldId: string }>()

    detectSameNameMoves(
      previousExports,
      currentExports,
      previousById,
      currentById,
      removedIds,
      usedRemovedIds,
      renamePairs
    )

    // Should prefer a.js::foo because the underlying name matches (foo == foo)
    // and signatures also match, giving score = 2 vs score at most 1 for b.js::bar
    expect(renamePairs.get('c.js::foo')).toEqual({ oldId: 'a.js::foo' })
    expect(usedRemovedIds.has('a.js::foo')).toBe(true)
    // b.js::bar remains unmatched (will be a Removed event)
    expect(usedRemovedIds.has('b.js::bar')).toBe(false)
  })
})

describe('detectCrossFileRenames', () => {
  function makeItem(
    name: string,
    id: string,
    bodyHash: string,
    signatureHash: string
  ): ExportItem {
    return { name, id, bodyHash, signatureHash, signatureText: '' }
  }

  it('detects rename when body+signature hashes match', () => {
    const previousById = new Map([
      ['old/file.ts::Foo', makeItem('Foo', 'old/file.ts::Foo', 'h1', 's1')],
    ])
    const currentById = new Map([
      ['new/file.ts::Foo', makeItem('Foo', 'new/file.ts::Foo', 'h1', 's1')],
    ])
    const removedIds = ['old/file.ts::Foo']
    const usedRemovedIds = new Set<string>()
    const renamePairs = new Map<string, { oldId: string }>()

    detectCrossFileRenames(
      previousById,
      currentById,
      removedIds,
      usedRemovedIds,
      renamePairs
    )

    expect(renamePairs.get('new/file.ts::Foo')).toEqual({
      oldId: 'old/file.ts::Foo',
    })
  })

  it('does not match when hashes differ', () => {
    const previousById = new Map([
      ['old/file.ts::Foo', makeItem('Foo', 'old/file.ts::Foo', 'h1', 's1')],
    ])
    const currentById = new Map([
      [
        'new/file.ts::Foo',
        makeItem('Foo', 'new/file.ts::Foo', 'different', 'different'),
      ],
    ])
    const removedIds = ['old/file.ts::Foo']
    const usedRemovedIds = new Set<string>()
    const renamePairs = new Map<string, { oldId: string }>()

    detectCrossFileRenames(
      previousById,
      currentById,
      removedIds,
      usedRemovedIds,
      renamePairs
    )

    expect(renamePairs.size).toBe(0)
  })
})

describe('checkAndCollapseOscillation', () => {
  it('collapses Added after Removed in the same release', () => {
    const history = [{ kind: 'Removed', release: 'v1.0' }]
    const collapsed = checkAndCollapseOscillation(history, 'Added', 'v1.0')

    expect(collapsed).toBe(true)
    expect(history).toHaveLength(0)
  })

  it('collapses Removed after Added in the same release', () => {
    const history = [{ kind: 'Added', release: 'v1.0' }]
    const collapsed = checkAndCollapseOscillation(history, 'Removed', 'v1.0')

    expect(collapsed).toBe(true)
    expect(history).toHaveLength(0)
  })

  it('does not collapse across different releases', () => {
    const history = [{ kind: 'Removed', release: 'v1.0' }]
    const collapsed = checkAndCollapseOscillation(history, 'Added', 'v2.0')

    expect(collapsed).toBe(false)
    expect(history).toHaveLength(1)
  })

  it('does not collapse when release is undefined', () => {
    const history = [{ kind: 'Removed', release: undefined }]
    const collapsed = checkAndCollapseOscillation(history, 'Added', undefined)

    expect(collapsed).toBe(false)
    expect(history).toHaveLength(1)
  })

  it('does not collapse on empty history', () => {
    const history: { kind: string; release?: string }[] = []
    const collapsed = checkAndCollapseOscillation(history, 'Added', 'v1.0')

    expect(collapsed).toBe(false)
  })
})
