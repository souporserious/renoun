import { describe, expect, test } from 'vitest'

import {
  BaseReference,
  BasicScopeAttributes,
  BasicScopeAttributesProvider,
  CachedFn,
  ColorMap,
  DebugFlags,
  EncodedTokenAttributes,
  ParsedThemeRule,
  RegexSource,
  RelativeReference,
  ScopeStack,
  SelfReference,
  StringCachedFn,
  StyleAttributes,
  Theme,
  TokenizeStringResult,
  TopLevelReference,
  TopLevelRepositoryReference,
  basename,
  clone,
  containsRTL,
  createMatchers,
  disposeOnigString,
  escapeRegExpCharacters,
  fontStyleToString,
  isValidHexColor,
  mergeObjects,
  parseInclude,
  parseJSON,
  parsePLIST,
  parseRawGrammar,
  parseTheme,
  parseWithLocation,
  stringArrayCompare,
  stringCompare,
  toOptionalTokenType,
} from './textmate.ts'

describe('textmate utilities', () => {
  test('clone deep clones objects and arrays', () => {
    const original = { a: 1, b: { c: 2 }, d: [3, { e: 4 }] }
    const copied = clone(original)

    expect(copied).toEqual(original)
    expect(copied).not.toBe(original)
    expect(copied.b).not.toBe(original.b)
    expect(copied.d).not.toBe(original.d)
    expect(copied.d[1]).not.toBe(original.d[1])
  })

  test('mergeObjects merges sources left-to-right', () => {
    const target = { a: 1 } as Record<string, any>
    mergeObjects(target, { b: 2 }, null, undefined, { a: 3 })
    expect(target).toEqual({ a: 3, b: 2 })
  })

  test('basename handles posix, windows, and trailing slashes', () => {
    expect(basename('foo/bar/baz.txt')).toBe('baz.txt')
    expect(basename('foo\\bar\\baz.txt')).toBe('baz.txt')
    expect(basename('foo/bar/')).toBe('bar')
    expect(basename('baz')).toBe('baz')
  })

  test('escapeRegExpCharacters escapes special characters', () => {
    expect(escapeRegExpCharacters('abc')).toBe('abc')
    expect(escapeRegExpCharacters('a.b[c]')).toBe('a\\.b\\[c\\]')

    // Ensure global regex state doesn\'t leak between calls
    expect(escapeRegExpCharacters('a.b[c]')).toBe('a\\.b\\[c\\]')
  })
})

describe('theme parsing: css var colors', () => {
  test('parseTheme accepts var(--x, #hex) for foreground/background', () => {
    const rules = parseTheme({
      name: 'Test',
      type: 'dark',
      settings: [
        {
          settings: {
            foreground: 'var(--fg, #aabbcc)',
            background: 'var(--bg, #112233)',
          },
        },
        {
          scope: 'keyword',
          settings: {
            foreground: 'var(--kw, #FF00ff)',
          },
        },
      ],
    } as any)

    expect(rules.length).toBeGreaterThan(0)
    const defaultRule = rules.find((r) => r.scope === '')
    expect(defaultRule).toBeDefined()
    expect(defaultRule!.foreground).toBe('var(--fg, #aabbcc)')
    expect(defaultRule!.background).toBe('var(--bg, #112233)')
    const kwRule = rules.find((r) => r.scope === 'keyword')
    expect(kwRule).toBeDefined()
    expect(kwRule!.foreground).toBe('var(--kw, #FF00ff)')
  })

  test('ColorMap normalizes css var fallback hex to stable uppercase id', () => {
    const cm = new ColorMap(null)
    const a = cm.getId('var(--fg, #aabbcc)')
    const b = cm.getId('var(--fg, #AABBCC)')
    const c = cm.getId('var(--fg, #AaBbCc)')
    expect(a).toBe(b)
    expect(a).toBe(c)

    const map = cm.getColorMap()
    expect(map[a]).toBe('var(--fg, #AABBCC)')
  })
})

describe('RegexSource capture replacement', () => {
  test('hasCaptures detects capture templates (and handles null)', () => {
    expect(RegexSource.hasCaptures(null)).toBe(false)
    expect(RegexSource.hasCaptures('nope')).toBe(false)
    expect(RegexSource.hasCaptures('$1')).toBe(true)
    expect(RegexSource.hasCaptures('${2:/downcase}')).toBe(true)
  })

  test('replaceCaptures substitutes and transforms captures', () => {
    const sourceText = '.Hello WORLD'
    const captures: any[] = []
    captures[1] = { start: 0, end: 6 } // '.Hello' (leading dot is trimmed)
    captures[2] = { start: 7, end: 12 } // 'WORLD'

    expect(RegexSource.replaceCaptures('x$1y', sourceText, captures)).toBe(
      'xHelloy'
    )
    expect(
      RegexSource.replaceCaptures('${1:/upcase}', sourceText, captures)
    ).toBe('HELLO')
    expect(
      RegexSource.replaceCaptures('${2:/downcase}', sourceText, captures)
    ).toBe('world')
  })

  test('replaceCaptures leaves missing captures unchanged', () => {
    const sourceText = 'abc'
    const captures: any[] = []
    captures[1] = { start: 0, end: 3 }

    expect(RegexSource.replaceCaptures('x$3y', sourceText, captures)).toBe(
      'x$3y'
    )
  })
})

describe('CachedFn and StringCachedFn', () => {
  test('CachedFn memoizes and evicts oldest when maxSize is reached', () => {
    let calls = 0
    const cached = new CachedFn((n: number) => {
      calls++
      return n * 2
    }, 2)

    expect(cached.get(1)).toBe(2)
    expect(cached.get(1)).toBe(2)
    expect(calls).toBe(1)

    expect(cached.get(2)).toBe(4)
    expect(cached.get(3)).toBe(6) // should evict key 1

    expect(cached.get(1)).toBe(2) // recomputed
    expect(calls).toBe(4)
  })

  test('StringCachedFn memoizes and clears when maxSize is reached', () => {
    let calls = 0
    const cached = new StringCachedFn((s: string) => {
      calls++
      return s.toUpperCase()
    }, 2)

    expect(cached.get('a')).toBe('A')
    expect(cached.get('a')).toBe('A')
    expect(calls).toBe(1)

    expect(cached.get('b')).toBe('B')
    expect(cached.get('c')).toBe('C') // triggers clear when adding third distinct key

    expect(cached.get('a')).toBe('A') // recomputed due to clear
    expect(calls).toBe(4)
  })
})

describe('containsRTL', () => {
  test('detects right-to-left scripts', () => {
    expect(containsRTL('hello')).toBe(false)
    expect(containsRTL('שלום')).toBe(true)

    // second call exercises cached regex
    expect(containsRTL('שלום')).toBe(true)
  })
})

describe('EncodedTokenAttributes', () => {
  test('set + getters round-trip expected fields', () => {
    const encoded = EncodedTokenAttributes.set(0, 1, 2, true, 3, 4, 5)
    expect(EncodedTokenAttributes.getLanguageId(encoded)).toBe(1)
    expect(EncodedTokenAttributes.getTokenType(encoded)).toBe(2)
    expect(EncodedTokenAttributes.containsBalancedBrackets(encoded)).toBe(true)
    expect(EncodedTokenAttributes.getFontStyle(encoded)).toBe(3)
    expect(EncodedTokenAttributes.getForeground(encoded)).toBe(4)
    expect(EncodedTokenAttributes.getBackground(encoded)).toBe(5)

    // No-op values should keep existing data
    const unchanged = EncodedTokenAttributes.set(encoded, 0, 8, null, -1, 0, 0)
    expect(unchanged).toBe(encoded)
  })
})

describe('Grammar parsing helpers', () => {
  test('parseJSON optionally attaches $textmateLocation', () => {
    const sourceText = '{"name":"x","arr":[{"n":1}]}'

    const withLoc: any = parseJSON(sourceText, 'test.json', true)
    expect(withLoc.$textmateLocation).toBeDefined()
    expect(withLoc.$textmateLocation.filename).toBe('test.json')
    expect(withLoc.arr[0].$textmateLocation.filename).toBe('test.json')

    const withoutLoc: any = parseJSON(sourceText, 'test.json', false)
    expect(withoutLoc.$textmateLocation).toBeUndefined()
    expect(withoutLoc.arr[0].$textmateLocation).toBeUndefined()
  })

  test('parsePLIST parses basic dicts', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>name</key>
    <string>foo</string>
    <key>count</key>
    <integer>2</integer>
    <key>ok</key>
    <true/>
  </dict>
</plist>`

    expect(parsePLIST(plist)).toEqual({ name: 'foo', count: 2, ok: true })
  })

  test('parseWithLocation attaches a configurable location key', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>nested</key>
    <dict>
      <key>x</key>
      <string>y</string>
    </dict>
  </dict>
</plist>`

    const result: any = parseWithLocation(plist, 'theme.tmTheme', '$loc')
    expect(result.$loc).toBeDefined()
    expect(result.$loc.filename).toBe('theme.tmTheme')

    expect(result.nested.$loc).toBeDefined()
    expect(result.nested.$loc.filename).toBe('theme.tmTheme')
  })

  test('parseRawGrammar uses JSON.parse for .json files in non-debug mode', () => {
    const raw = '{"scopeName":"source.test"}'
    expect(parseRawGrammar(raw, 'grammar.json')).toEqual({
      scopeName: 'source.test',
    })
  })
})

describe('strcmp and strArrCmp', () => {
  test('strcmp returns -1, 0, or 1', () => {
    expect(stringCompare('a', 'b')).toBe(-1)
    expect(stringCompare('b', 'a')).toBe(1)
    expect(stringCompare('x', 'x')).toBe(0)
  })

  test('strArrCmp compares arrays lexicographically', () => {
    expect(stringArrayCompare(null, null)).toBe(0)
    expect(stringArrayCompare(null, ['a'])).toBe(-1)
    expect(stringArrayCompare(['a'], null)).toBe(1)
    expect(stringArrayCompare(['a'], ['a'])).toBe(0)
    expect(stringArrayCompare(['a'], ['b'])).toBe(-1)
    expect(stringArrayCompare(['a', 'b'], ['a'])).toBe(1)
    expect(stringArrayCompare(['a'], ['a', 'b'])).toBe(-1)
  })
})

describe('isValidHexColor', () => {
  test('accepts 3, 4, 6, and 8 digit hex colors', () => {
    expect(isValidHexColor('#abc')).toBe(true)
    expect(isValidHexColor('#abcd')).toBe(true)
    expect(isValidHexColor('#aabbcc')).toBe(true)
    expect(isValidHexColor('#aabbccdd')).toBe(true)
  })

  test('rejects invalid formats', () => {
    expect(isValidHexColor('abc')).toBe(false)
    expect(isValidHexColor('#ab')).toBe(false)
    expect(isValidHexColor('#abcde')).toBe(false)
    expect(isValidHexColor('#gggggg')).toBe(false)
  })
})

describe('fontStyleToString', () => {
  test('converts font style bitmask to string', () => {
    expect(fontStyleToString(-1)).toBe('not set')
    expect(fontStyleToString(0)).toBe('none')
    expect(fontStyleToString(1)).toBe('italic')
    expect(fontStyleToString(2)).toBe('bold')
    expect(fontStyleToString(3)).toBe('italic bold')
    expect(fontStyleToString(4)).toBe('underline')
    expect(fontStyleToString(8)).toBe('strikethrough')
    expect(fontStyleToString(15)).toBe('italic bold underline strikethrough')
  })
})

describe('ScopeStack', () => {
  test('from builds stack from scope names', () => {
    const stack = ScopeStack.from('source.ts', 'meta.block')
    expect(stack?.toString()).toBe('source.ts meta.block')
  })

  test('push adds scope to stack', () => {
    const base = ScopeStack.from('source.ts')!
    const pushed = base.push('meta.block')
    expect(pushed.toString()).toBe('source.ts meta.block')
    expect(base.toString()).toBe('source.ts')
  })

  test('getSegments returns scopes in order', () => {
    const stack = ScopeStack.from('a', 'b', 'c')
    expect(stack?.getSegments()).toEqual(['a', 'b', 'c'])
  })

  test('extends checks ancestry', () => {
    const parent = ScopeStack.from('source.ts')!
    const child = parent.push('meta.block')
    expect(child.extends(parent)).toBe(true)
    expect(parent.extends(child)).toBe(false)
    expect(parent.extends(parent)).toBe(true)
  })

  test('getExtensionIfDefined returns extension scopes or undefined', () => {
    const base = ScopeStack.from('source.ts')!
    const extended = base.push('meta.block').push('entity.name')
    expect(extended.getExtensionIfDefined(base)).toEqual([
      'meta.block',
      'entity.name',
    ])

    const unrelated = ScopeStack.from('source.js')!
    expect(extended.getExtensionIfDefined(unrelated)).toBeUndefined()
  })

  test('static push chains scopes onto existing stack', () => {
    const base = ScopeStack.from('source.ts')
    const result = ScopeStack.push(base, ['a', 'b'])
    expect(result?.getSegments()).toEqual(['source.ts', 'a', 'b'])
  })
})

describe('ColorMap', () => {
  test('assigns IDs to new colors', () => {
    const map = new ColorMap(null)
    expect(map.getId('#FF0000')).toBe(1)
    expect(map.getId('#00FF00')).toBe(2)
    expect(map.getId('#FF0000')).toBe(1) // cached
  })

  test('normalizes colors to uppercase', () => {
    const map = new ColorMap(null)
    expect(map.getId('#ff0000')).toBe(1)
    expect(map.getId('#FF0000')).toBe(1)
  })

  test('getColorMap returns array of colors by ID', () => {
    const map = new ColorMap(null)
    map.getId('#FF0000')
    map.getId('#00FF00')
    const colors = map.getColorMap()
    expect(colors[1]).toBe('#FF0000')
    expect(colors[2]).toBe('#00FF00')
  })

  test('frozen map throws on unknown color', () => {
    const map = new ColorMap(['#000', '#FFF'])
    expect(map.getId('#000')).toBe(0)
    expect(map.getId('#FFF')).toBe(1)
    expect(() => map.getId('#ABC')).toThrow('Missing color in color map')
  })
})

describe('parseInclude', () => {
  test('parses $base reference', () => {
    expect(parseInclude('$base')).toBeInstanceOf(BaseReference)
  })

  test('parses $self reference', () => {
    expect(parseInclude('$self')).toBeInstanceOf(SelfReference)
  })

  test('parses top-level scope reference', () => {
    const ref = parseInclude('source.json')
    expect(ref).toBeInstanceOf(TopLevelReference)
    expect((ref as TopLevelReference).scopeName).toBe('source.json')
  })

  test('parses relative repository reference', () => {
    const ref = parseInclude('#comment')
    expect(ref).toBeInstanceOf(RelativeReference)
    expect((ref as RelativeReference).ruleName).toBe('comment')
  })

  test('parses top-level repository reference', () => {
    const ref = parseInclude('source.json#array')
    expect(ref).toBeInstanceOf(TopLevelRepositoryReference)
    expect((ref as TopLevelRepositoryReference).scopeName).toBe('source.json')
    expect((ref as TopLevelRepositoryReference).ruleName).toBe('array')
  })
})

describe('parseTheme', () => {
  test('returns empty array for undefined or invalid input', () => {
    expect(parseTheme(undefined)).toEqual([])
    expect(parseTheme({} as any)).toEqual([])
    expect(parseTheme({ settings: 'not an array' } as any)).toEqual([])
  })

  test('parses theme rules from settings', () => {
    const theme = {
      settings: [
        {
          settings: { foreground: '#FF0000' },
        },
        {
          scope: 'comment',
          settings: { foreground: '#008000', fontStyle: 'italic' },
        },
        {
          scope: ['string', 'constant'],
          settings: { foreground: '#0000FF' },
        },
      ],
    }

    const rules = parseTheme(theme)
    expect(rules.length).toBeGreaterThan(0)
    expect(
      rules.every((r: ParsedThemeRule) => r instanceof ParsedThemeRule)
    ).toBe(true)

    const commentRule = rules.find(
      (r: ParsedThemeRule) => r.scope === 'comment'
    )
    expect(commentRule?.foreground).toBe('#008000')
  })

  test('parses fontStyle combinations', () => {
    const theme = {
      settings: [
        {
          scope: 'test',
          settings: { fontStyle: 'italic bold underline strikethrough' },
        },
      ],
    }

    const rules = parseTheme(theme)
    const testRule = rules.find((r: ParsedThemeRule) => r.scope === 'test')
    expect(testRule?.fontStyle).toBe(15) // 1 + 2 + 4 + 8
  })

  test('parses scope with comma separation', () => {
    const theme = {
      settings: [
        {
          scope: 'comment, string',
          settings: { foreground: '#888888' },
        },
      ],
    }

    const rules = parseTheme(theme)
    expect(rules.length).toBe(2)
    expect(rules.some((r: ParsedThemeRule) => r.scope === 'comment')).toBe(true)
    expect(rules.some((r: ParsedThemeRule) => r.scope === 'string')).toBe(true)
  })

  test('parses parent scopes from space-separated scope', () => {
    const theme = {
      settings: [
        {
          scope: 'source.js meta.function entity.name',
          settings: { foreground: '#00FF00' },
        },
      ],
    }

    const rules = parseTheme(theme)
    const rule = rules[0]
    expect(rule.scope).toBe('entity.name')
    expect(rule.parentScopes).toEqual(['meta.function', 'source.js'])
  })

  test('parses background, fontFamily, fontSize, lineHeight', () => {
    const theme = {
      settings: [
        {
          scope: 'test',
          settings: {
            foreground: '#FFFFFF',
            background: '#000000',
            fontFamily: 'Fira Code',
            fontSize: '14px',
            lineHeight: 1.5,
          },
        },
      ],
    }

    const rules = parseTheme(theme)
    const rule = rules[0]
    expect(rule.foreground).toBe('#FFFFFF')
    expect(rule.background).toBe('#000000')
    expect(rule.fontFamily).toBe('Fira Code')
    expect(rule.fontSize).toBe('14px')
    expect(rule.lineHeight).toBe(1.5)
  })

  test('skips invalid hex colors', () => {
    const theme = {
      settings: [
        {
          scope: 'test',
          settings: {
            foreground: 'not-a-color',
            background: 'rgb(0,0,0)',
          },
        },
      ],
    }

    const rules = parseTheme(theme)
    expect(rules[0].foreground).toBe(null)
    expect(rules[0].background).toBe(null)
  })
})

describe('disposeOnigString', () => {
  test('calls dispose if available', () => {
    const disposed = { disposed: false }
    const onigString = {
      dispose: () => {
        disposed.disposed = true
      },
    }
    disposeOnigString(onigString)
    expect(disposed.disposed).toBe(true)
  })

  test('does nothing if dispose is not a function', () => {
    expect(() => disposeOnigString(null)).not.toThrow()
    expect(() => disposeOnigString(undefined)).not.toThrow()
    expect(() => disposeOnigString({ dispose: 'not a function' })).not.toThrow()
  })
})

describe('toOptionalTokenType', () => {
  test('returns the value unchanged', () => {
    expect(toOptionalTokenType(42)).toBe(42)
    expect(toOptionalTokenType('test')).toBe('test')
    expect(toOptionalTokenType(null)).toBe(null)
  })
})

describe('StyleAttributes', () => {
  test('constructor stores all properties', () => {
    const attrs = new StyleAttributes(3, 1, 2, 'Monaco', '12px', 1.5)
    expect(attrs.fontStyle).toBe(3)
    expect(attrs.foregroundId).toBe(1)
    expect(attrs.backgroundId).toBe(2)
    expect(attrs.fontFamily).toBe('Monaco')
    expect(attrs.fontSize).toBe('12px')
    expect(attrs.lineHeight).toBe(1.5)
  })

  test('allows null values for optional properties', () => {
    const attrs = new StyleAttributes(0, 1, 2, null, null, null)
    expect(attrs.fontFamily).toBe(null)
    expect(attrs.fontSize).toBe(null)
    expect(attrs.lineHeight).toBe(null)
  })
})

describe('BasicScopeAttributes', () => {
  test('constructor stores languageId and tokenType', () => {
    const attrs = new BasicScopeAttributes(1, 2)
    expect(attrs.languageId).toBe(1)
    expect(attrs.tokenType).toBe(2)
  })
})

describe('BasicScopeAttributesProvider', () => {
  test('returns default attributes', () => {
    const provider = new BasicScopeAttributesProvider(1, {})
    const defaults = provider.getDefaultAttributes()
    expect(defaults.languageId).toBe(1)
    expect(defaults.tokenType).toBe(8) // default token type
  })

  test('returns null scope metadata for null scopeName', () => {
    const provider = new BasicScopeAttributesProvider(1, {})
    const attrs = provider.getBasicScopeAttributes(null)
    expect(attrs.languageId).toBe(0)
    expect(attrs.tokenType).toBe(0)
  })

  test('detects standard token types from scope name', () => {
    const provider = new BasicScopeAttributesProvider(1, {})

    const commentAttrs = provider.getBasicScopeAttributes('comment.line')
    expect(commentAttrs.tokenType).toBe(1)

    const stringAttrs = provider.getBasicScopeAttributes('string.quoted')
    expect(stringAttrs.tokenType).toBe(2)

    // Note: 'string.regex' matches 'string' first in the regex, so it's tokenType 2
    const regexAttrs = provider.getBasicScopeAttributes('string.regexp.other')
    expect(regexAttrs.tokenType).toBe(2)

    // To get tokenType 3, the scope must match 'regex' specifically
    const pureRegexAttrs = provider.getBasicScopeAttributes(
      'constant.other.regex'
    )
    expect(pureRegexAttrs.tokenType).toBe(3)

    const embeddedAttrs = provider.getBasicScopeAttributes(
      'meta.embedded.block'
    )
    expect(embeddedAttrs.tokenType).toBe(0)
  })

  test('uses embedded languages matcher', () => {
    const provider = new BasicScopeAttributesProvider(1, {
      'source.css': 2,
      'source.js': 3,
    })

    const cssAttrs = provider.getBasicScopeAttributes('source.css')
    expect(cssAttrs.languageId).toBe(2)

    const jsAttrs = provider.getBasicScopeAttributes('source.js.embedded')
    expect(jsAttrs.languageId).toBe(3)
  })
})

describe('TokenizeStringResult', () => {
  test('constructor stores stack and stoppedEarly', () => {
    const mockStack = {} as any
    const result = new TokenizeStringResult(mockStack, true)
    expect(result.stack).toBe(mockStack)
    expect(result.stoppedEarly).toBe(true)
  })
})

describe('Theme', () => {
  // Note: Theme.createFromRawTheme requires a pre-populated colorMap with all colors used
  // When an empty array is passed, the ColorMap is frozen and will throw on unknown colors
  // Pass null or provide all colors in the array to avoid this

  test('createFromRawTheme creates theme with pre-populated colors', () => {
    const rawTheme = {
      settings: [
        { settings: { foreground: '#FFFFFF', background: '#000000' } },
        { scope: 'comment', settings: { foreground: '#888888' } },
      ],
    }

    // Pass the colors that the theme uses
    const colorMap = ['#000000', '#FFFFFF', '#888888']
    const theme = Theme.createFromRawTheme(rawTheme, colorMap)
    expect(theme).toBeInstanceOf(Theme)
    expect(theme.getColorMap()).toBeDefined()
  })

  test('getDefaults returns default style attributes', () => {
    const rawTheme = {
      settings: [
        {
          settings: {
            foreground: '#FFFFFF',
            background: '#1E1E1E',
            fontStyle: 'italic',
          },
        },
      ],
    }

    const colorMap = ['#FFFFFF', '#1E1E1E']
    const theme = Theme.createFromRawTheme(rawTheme, colorMap)
    const defaults = theme.getDefaults()
    expect(defaults).toBeInstanceOf(StyleAttributes)
  })

  test('match returns defaults for null scope', () => {
    const rawTheme = {
      settings: [
        { settings: { foreground: '#FFFFFF', background: '#000000' } },
      ],
    }
    const colorMap = ['#000000', '#FFFFFF']
    const theme = Theme.createFromRawTheme(rawTheme, colorMap)
    const result = theme.match(null as any)
    expect(result).toBeInstanceOf(StyleAttributes)
  })

  test('match finds matching theme rule', () => {
    const rawTheme = {
      settings: [
        { settings: { foreground: '#FFFFFF', background: '#000000' } },
        { scope: 'comment', settings: { foreground: '#888888' } },
      ],
    }

    const colorMap = ['#000000', '#FFFFFF', '#888888']
    const theme = Theme.createFromRawTheme(rawTheme, colorMap)
    const scope = ScopeStack.from('source.js', 'comment.line')
    const match = theme.match(scope!)
    expect(match).toBeDefined()
  })

  test('getColorMap returns the color array', () => {
    const rawTheme = {
      settings: [
        { settings: { foreground: '#FF0000', background: '#00FF00' } },
      ],
    }
    const colorMap = ['#FF0000', '#00FF00']
    const theme = Theme.createFromRawTheme(rawTheme, colorMap)
    const colors = theme.getColorMap()
    expect(colors).toContain('#FF0000')
    expect(colors).toContain('#00FF00')
  })
})

describe('createMatchers', () => {
  const matchesName = (names: string[], scopeSegments: string[]) =>
    names.some((name) =>
      scopeSegments.some((seg) => seg === name || seg.startsWith(name + '.'))
    )

  test('parses simple selector', () => {
    const matchers = createMatchers('comment', matchesName)
    expect(matchers.length).toBe(1)
    expect(matchers[0].priority).toBe(0)
    expect(matchers[0].matcher(['comment'])).toBe(true)
    expect(matchers[0].matcher(['string'])).toBe(false)
  })

  test('parses selector with negation', () => {
    const matchers = createMatchers('-comment', matchesName)
    expect(matchers.length).toBe(1)
    expect(matchers[0].matcher(['comment'])).toBe(false)
    expect(matchers[0].matcher(['string'])).toBe(true)
  })

  test('parses selector with grouping', () => {
    const matchers = createMatchers('(comment | string)', matchesName)
    expect(matchers.length).toBe(1)
    expect(matchers[0].matcher(['comment'])).toBe(true)
    expect(matchers[0].matcher(['string'])).toBe(true)
    expect(matchers[0].matcher(['keyword'])).toBe(false)
  })

  test('parses multiple selectors with comma', () => {
    const matchers = createMatchers('comment, string', matchesName)
    expect(matchers.length).toBe(2)
  })

  test('parses priority prefixes', () => {
    const rightMatchers = createMatchers('R:comment', matchesName)
    expect(rightMatchers[0].priority).toBe(1)

    const leftMatchers = createMatchers('L:comment', matchesName)
    expect(leftMatchers[0].priority).toBe(-1)
  })

  test('parses conjunction - space-separated scopes passed as single matcher', () => {
    // In this implementation, space-separated scope selectors like 'source.js comment'
    // are collected into a single 'parts' array and passed to matchesName at once.
    // The matchesName function determines if ALL parts must match or ANY part.
    // Our test matchesName checks if any part matches any scope.
    const matchers = createMatchers('source.js comment', matchesName)
    expect(matchers.length).toBe(1)
    // Both scopes present - the parts ['source.js', 'comment'] are checked against ['source.js', 'comment']
    expect(matchers[0].matcher(['source.js', 'comment'])).toBe(true)
    // With our matchesName, even a single match returns true (checks if any part matches any scope)
    expect(matchers[0].matcher(['comment'])).toBe(true) // 'comment' in parts matches 'comment' in scopes
  })
})

describe('EncodedTokenAttributes extended', () => {
  test('toBinaryStr returns 32-bit binary string', () => {
    const str = EncodedTokenAttributes.toBinaryStr(0)
    expect(str).toBe('00000000000000000000000000000000')
    expect(str.length).toBe(32)
  })

  test('round-trip all fields', () => {
    const encoded = EncodedTokenAttributes.set(
      0,
      255, // max languageId (8 bits)
      3, // tokenType (2 bits, max 3)
      true, // containsBalancedBrackets
      15, // fontStyle (4 bits, max 15)
      511, // foreground (9 bits, max 511)
      255 // background (8 bits, max 255)
    )

    expect(EncodedTokenAttributes.getLanguageId(encoded)).toBe(255)
    expect(EncodedTokenAttributes.getTokenType(encoded)).toBe(3)
    expect(EncodedTokenAttributes.containsBalancedBrackets(encoded)).toBe(true)
    expect(EncodedTokenAttributes.getFontStyle(encoded)).toBe(15)
    expect(EncodedTokenAttributes.getForeground(encoded)).toBe(511)
    expect(EncodedTokenAttributes.getBackground(encoded)).toBe(255)
  })

  test('set preserves existing values when using no-op values', () => {
    const original = EncodedTokenAttributes.set(0, 5, 2, false, 3, 10, 20)
    const modified = EncodedTokenAttributes.set(
      original,
      0, // no-op for languageId
      8, // no-op for tokenType
      null, // no-op for balanced brackets
      -1, // no-op for fontStyle
      0, // no-op for foreground
      0 // no-op for background
    )

    expect(EncodedTokenAttributes.getLanguageId(modified)).toBe(5)
    expect(EncodedTokenAttributes.getTokenType(modified)).toBe(2)
    expect(EncodedTokenAttributes.containsBalancedBrackets(modified)).toBe(
      false
    )
    expect(EncodedTokenAttributes.getFontStyle(modified)).toBe(3)
    expect(EncodedTokenAttributes.getForeground(modified)).toBe(10)
    expect(EncodedTokenAttributes.getBackground(modified)).toBe(20)
  })
})

describe('Reference classes', () => {
  test('BaseReference has kind 0', () => {
    const ref = new BaseReference()
    expect(ref.kind).toBe(0)
  })

  test('SelfReference has kind 1', () => {
    const ref = new SelfReference()
    expect(ref.kind).toBe(1)
  })

  test('RelativeReference has kind 2 and stores ruleName', () => {
    const ref = new RelativeReference('myRule')
    expect(ref.kind).toBe(2)
    expect(ref.ruleName).toBe('myRule')
  })

  test('TopLevelReference has kind 3 and stores scopeName', () => {
    const ref = new TopLevelReference('source.js')
    expect(ref.kind).toBe(3)
    expect(ref.scopeName).toBe('source.js')
  })

  test('TopLevelRepositoryReference has kind 4 and stores both names', () => {
    const ref = new TopLevelRepositoryReference('source.js', 'comment')
    expect(ref.kind).toBe(4)
    expect(ref.scopeName).toBe('source.js')
    expect(ref.ruleName).toBe('comment')
  })
})

describe('clone edge cases', () => {
  test('clone handles primitives', () => {
    expect(clone(42)).toBe(42)
    expect(clone('test')).toBe('test')
    expect(clone(null)).toBe(null)
    expect(clone(undefined)).toBe(undefined)
    expect(clone(true)).toBe(true)
  })

  test('clone handles nested arrays', () => {
    const original = [
      [1, 2],
      [3, [4, 5]],
    ]
    const copied = clone(original)
    expect(copied).toEqual(original)
    expect(copied[1]).not.toBe(original[1])
    expect((copied[1] as any)[1]).not.toBe((original[1] as any)[1])
  })
})

describe('parseJSON edge cases', () => {
  test('parses arrays', () => {
    const result = parseJSON('[1, "two", true, null]', 'test.json', false)
    expect(result).toEqual([1, 'two', true, null])
  })

  test('parses nested structures', () => {
    const json = '{"arr": [{"x": 1}, {"y": 2}], "obj": {"nested": true}}'
    const result = parseJSON(json, 'test.json', false)
    expect(result.arr[0].x).toBe(1)
    expect(result.obj.nested).toBe(true)
  })

  test('handles numbers including negatives and decimals', () => {
    const json = '{"int": 42, "neg": -10, "float": 3.14}'
    const result = parseJSON(json, 'test.json', false)
    expect(result.int).toBe(42)
    expect(result.neg).toBe(-10)
    expect(result.float).toBe(3.14)
  })
})

describe('parsePLIST edge cases', () => {
  test('parses arrays', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <array>
    <string>one</string>
    <string>two</string>
  </array>
</plist>`
    expect(parsePLIST(plist)).toEqual(['one', 'two'])
  })

  test('parses false and real values', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>enabled</key>
    <false/>
    <key>value</key>
    <real>3.14</real>
  </dict>
</plist>`
    const result = parsePLIST(plist)
    expect(result.enabled).toBe(false)
    expect(result.value).toBe(3.14)
  })
})

describe('parseRawGrammar', () => {
  test('parses PLIST format without filename', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>scopeName</key>
    <string>source.test</string>
  </dict>
</plist>`
    expect(parseRawGrammar(plist)).toEqual({ scopeName: 'source.test' })
  })

  test('parses JSON format with .json extension', () => {
    const json = '{"scopeName": "source.json"}'
    expect(parseRawGrammar(json, 'grammar.json')).toEqual({
      scopeName: 'source.json',
    })
  })

  test('parses PLIST format with .tmLanguage extension', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>scopeName</key>
    <string>source.plist</string>
  </dict>
</plist>`
    expect(parseRawGrammar(plist, 'grammar.tmLanguage')).toEqual({
      scopeName: 'source.plist',
    })
  })
})
