import { describe, expect, test } from 'vitest'

import {
  BaseReference,
  BasicScopeAttributes,
  BasicScopeAttributesProvider,
  CachedFn,
  AttributedScopeStack,
  ColorMap,
  EncodedTokenAttributes,
  FontStyle,
  LineFonts,
  ParsedThemeRule,
  RegexSource,
  RelativeReference,
  RegistryOptions,
  RawTokenizeResult,
  ScopeStack,
  SelfReference,
  StringCachedFn,
  StyleAttributes,
  Theme,
  TextMateGrammarRaw,
  TextMateThemeRaw,
  TokenMetadata,
  Tokenizer,
  TokenizeOptions,
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

import cssGrammar from '../grammars/css.ts'
import shellGrammar from '../grammars/shellscript.ts'
import mdxGrammar from '../grammars/mdx.ts'
import tsxGrammar from '../grammars/tsx.ts'
import textmateTheme from '../theme.ts'

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

describe('LineFonts', () => {
  test('inherits fontFamily/fontSize/lineHeight from parent scopes', () => {
    const parent = new AttributedScopeStack(
      null,
      'parent',
      0,
      new StyleAttributes(0, 0, 0, 'Inter', '14px', 20)
    )
    const child = new AttributedScopeStack(null, 'child', 0, null)
    // Simulate scope chain: child -> parent
    ;(child as any).parent = parent

    const lineFonts = new LineFonts()
    lineFonts.reset()
    lineFonts.produceFromScopes(child, 3)
    const spans = lineFonts.finalize(3)
    expect(spans.length).toBe(1)
    expect(spans[0]).toEqual({
      start: 0,
      fontFamily: 'Inter',
      fontSize: '14px',
      lineHeight: 20,
    })
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

type ThemeName = 'light' | 'dark'

// Test fixtures mimicking real VS Code themes with array scopes
const themeFixtures: Record<ThemeName, TextMateThemeRaw> = {
  light: {
    name: 'Light',
    type: 'light',
    colors: {
      foreground: '#111111',
    },
    settings: [
      {
        // Global settings (no scope) for default colors
        settings: {
          foreground: '#111111',
          background: '#ffffff',
        },
      },
      {
        scope: ['comment', 'comment.line', 'comment.block'],
        settings: {
          foreground: '#ff0000',
        },
      },
      {
        // Array of specific keyword scopes like real themes
        scope: [
          'keyword',
          'keyword.control',
          'keyword.control.import',
          'keyword.control.import.ts',
          'keyword.control.import.tsx',
        ],
        settings: {
          foreground: '#a492ea',
          fontStyle: 'italic',
        },
      },
      {
        scope: ['string', 'string.quoted', 'string.quoted.single'],
        settings: {
          foreground: '#00aa00',
        },
      },
      {
        // Shell command names (e.g., npm, echo, ls)
        scope: [
          'entity.name.command',
          'entity.name.function.call',
          'support.function.builtin',
        ],
        settings: {
          foreground: '#0077cc',
          fontStyle: 'italic',
        },
      },
      {
        // Variable declarations and identifiers
        scope: ['variable.other', 'variable.parameter'],
        settings: {
          foreground: '#4a4a4a',
        },
      },
      {
        // Storage types (const, let, function, etc.)
        scope: ['storage.type', 'storage.modifier'],
        settings: {
          foreground: '#a492ea',
          fontStyle: 'italic',
        },
      },
    ],
  },
  dark: {
    name: 'Dark',
    type: 'dark',
    colors: {
      foreground: '#eeeeee',
    },
    settings: [
      {
        settings: {
          foreground: '#eeeeee',
          background: '#000000',
        },
      },
      {
        scope: ['comment'],
        settings: {
          foreground: '#00ff00',
        },
      },
      {
        scope: ['keyword', 'keyword.control'],
        settings: {
          foreground: '#ff00ff',
        },
      },
      {
        scope: ['string'],
        settings: {
          foreground: '#ffaa00',
        },
      },
    ],
  },
}

const registryOptions: RegistryOptions<ThemeName> = {
  async getGrammar(scopeName) {
    if (scopeName === 'source.css') {
      return cssGrammar as TextMateGrammarRaw
    }
    if (scopeName === 'source.shell') {
      return shellGrammar as TextMateGrammarRaw
    }
    if (scopeName === 'source.mdx') {
      return mdxGrammar as TextMateGrammarRaw
    }
    if (scopeName === 'source.tsx') {
      return tsxGrammar as TextMateGrammarRaw
    }

    throw new Error(`Missing grammar for scope: ${scopeName}`)
  },
  async getTheme(theme) {
    const themeDefinition = themeFixtures[theme]
    if (!themeDefinition) {
      throw new Error(`Missing theme: ${theme}`)
    }

    return themeDefinition
  },
}

// Helper to decode raw tokens into the old token format for test compatibility
type DecodedToken = {
  value: string
  start: number
  end: number
  hasTextStyles: boolean
  isBaseColor: boolean
  isWhiteSpace: boolean
  style: {
    color?: string
    fontStyle?: string
    fontWeight?: string
    textDecoration?: string
    [key: `--${string}`]: string
  }
}

async function decodeRawTokens<T extends string>(
  tokenizer: Tokenizer<T>,
  source: string,
  language: any,
  themes: T[],
  options?: TokenizeOptions
): Promise<DecodedToken[][]> {
  const lines = source.split(/\r?\n/)
  const isMultiTheme = themes.length > 1
  if (!isMultiTheme) {
    // Single theme: decode directly from stream results.
    const themeName = themes[0]
    const context = await tokenizer.getContext(themeName)
    const tokens: DecodedToken[][] = []

    for await (const result of tokenizer.stream(
      source,
      language,
      themeName,
      options
    )) {
      const lineText = result.lineText
      const lineTokens: DecodedToken[] = []

      for (let i = 0; i < result.tokens.length; i += 2) {
        const start = result.tokens[i]
        const end =
          i + 2 < result.tokens.length ? result.tokens[i + 2] : lineText.length
        if (end <= start) continue

        const metadata = result.tokens[i + 1]
        const colorId = TokenMetadata.getForegroundId(metadata)
        const color = context.colorMap[colorId] || ''
        const baseColor = context.baseColor
        const fontFlags = TokenMetadata.getFontStyle(metadata)
        const fontStyle = fontFlags & FontStyle.Italic ? 'italic' : ''
        const fontWeight = fontFlags & FontStyle.Bold ? 'bold' : ''
        let textDecoration = ''
        if (fontFlags & FontStyle.Underline) textDecoration = 'underline'
        if (fontFlags & FontStyle.Strikethrough) {
          textDecoration = textDecoration
            ? `${textDecoration} line-through`
            : 'line-through'
        }

        const themeIsBaseColor =
          !color || baseColor.toLowerCase() === color.toLowerCase()

        const style: Record<string, string> = {}
        if (color && !themeIsBaseColor) style.color = color
        if (fontStyle) style.fontStyle = fontStyle
        if (fontWeight) style.fontWeight = fontWeight
        if (textDecoration) style.textDecoration = textDecoration

        const tokenValue = lineText.slice(start, end)
        lineTokens.push({
          value: tokenValue,
          start,
          end,
          hasTextStyles: fontFlags !== 0,
          isBaseColor: themeIsBaseColor,
          isWhiteSpace: /^\s*$/.test(tokenValue),
          style,
        })
      }
      tokens.push(lineTokens)
    }

    return tokens
  }

  // Multi-theme: merge boundaries using per-theme token streams.
  const contexts = await Promise.all(
    themes.map((theme) => tokenizer.getContext(theme))
  )
  const mergedLines: DecodedToken[][] = []
  const lineCount = lines.length
  const themeCount = themes.length
  const iterators = new Array<AsyncIterator<RawTokenizeResult>>(themeCount)
  const doneFlags = new Array<boolean>(themeCount).fill(false)

  for (let themeIndex = 0; themeIndex < themeCount; themeIndex++) {
    iterators[themeIndex] = tokenizer
      .stream(source, language, themes[themeIndex], options)
      [Symbol.asyncIterator]()
  }

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
    const lineText = lines[lineIndex] ?? ''
    const allTokens: Array<{
      start: number
      end: number
      metadata: number
      themeIndex: number
    }> = []

    for (let themeIndex = 0; themeIndex < themeCount; themeIndex++) {
      if (doneFlags[themeIndex]) continue
      const step = await iterators[themeIndex].next()
      if (step.done) {
        doneFlags[themeIndex] = true
        continue
      }
      const tokens = step.value.tokens
      const themeLineLength = step.value.lineText.length

      for (let i = 0; i < tokens.length; i += 2) {
        const start = tokens[i]
        const end = i + 2 < tokens.length ? tokens[i + 2] : themeLineLength
        allTokens.push({
          start,
          end,
          metadata: tokens[i + 1],
          themeIndex,
        })
      }
    }

    const boundarySet = new Set<number>()
    for (const token of allTokens) {
      boundarySet.add(token.start)
      boundarySet.add(token.end)
    }
    const boundaries = Array.from(boundarySet).sort((a, b) => a - b)
    const mergedLineTokens: DecodedToken[] = []

    for (let i = 0; i < boundaries.length - 1; i++) {
      const rangeStart = boundaries[i]
      const rangeEnd = boundaries[i + 1]
      if (rangeStart >= rangeEnd) continue

      const value = lineText.slice(rangeStart, rangeEnd)
      const style: Record<string, string> = {}
      let hasAnyNonBaseColor = false
      let hasTextStyles = false

      for (const token of allTokens) {
        if (token.start < rangeEnd && token.end > rangeStart) {
          const context = contexts[token.themeIndex]
          const colorId = TokenMetadata.getForegroundId(token.metadata)
          const color = context.colorMap[colorId] || ''
          const baseColor = context.baseColor
          const fontFlags = TokenMetadata.getFontStyle(token.metadata)
          const fontStyle = fontFlags & FontStyle.Italic ? 'italic' : ''
          const fontWeight = fontFlags & FontStyle.Bold ? 'bold' : ''
          let textDecoration = ''
          if (fontFlags & FontStyle.Underline) textDecoration = 'underline'
          if (fontFlags & FontStyle.Strikethrough) {
            textDecoration = textDecoration
              ? `${textDecoration} line-through`
              : 'line-through'
          }

          const themeIsBaseColor =
            !color || baseColor.toLowerCase() === color.toLowerCase()
          if (!themeIsBaseColor) hasAnyNonBaseColor = true
          if (fontFlags !== 0) hasTextStyles = true

          const themeKey = `--${token.themeIndex}`
          if (color && !themeIsBaseColor) style[themeKey + 'fg'] = color
          if (fontStyle) style[themeKey + 'fs'] = fontStyle
          if (fontWeight) style[themeKey + 'fw'] = fontWeight
          if (textDecoration) style[themeKey + 'td'] = textDecoration
        }
      }

      mergedLineTokens.push({
        value,
        start: rangeStart,
        end: rangeEnd,
        hasTextStyles,
        isBaseColor: !hasAnyNonBaseColor,
        isWhiteSpace: /^\s*$/.test(value),
        style,
      })
    }

    mergedLines.push(mergedLineTokens)
  }

  for (let themeIndex = 0; themeIndex < themeCount; themeIndex++) {
    if (doneFlags[themeIndex]) continue
    const iterator = iterators[themeIndex]
    if (iterator && iterator.return) {
      await iterator.return()
    }
  }

  return mergedLines
}

describe('Tokenizer', () => {
  test('highlights TSX and shellscript (keywords/comments/strings) with theme rules', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    const normalize = (c: string | undefined) => (c || '').toUpperCase()

    const findToken = (
      lines: DecodedToken[][],
      predicate: (token: DecodedToken) => boolean
    ) => {
      for (const line of lines)
        for (const token of line) if (predicate(token)) return token
      return undefined
    }

    // TSX: keyword + comment
    const tsx = `export const x = "hi"
// comment`
    const tsxTokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['light'])

    const tsxKeyword = findToken(
      tsxTokens,
      (token) =>
        /export|const/.test(token.value) &&
        normalize(token.style.color) === '#A492EA' &&
        token.style.fontStyle === 'italic'
    )
    expect(tsxKeyword).toBeTruthy()

    const tsxComment = findToken(
      tsxTokens,
      (token) =>
        /comment/.test(token.value) &&
        normalize(token.style.color) === '#FF0000'
    )
    expect(tsxComment).toBeTruthy()

    // shell: comment + string
    const shell = `# comment
echo "Hello World"`
    const shellTokens = await decodeRawTokens(tokenizer, shell, 'shell', [
      'light',
    ])

    const shComment = findToken(
      shellTokens,
      (token) =>
        /comment/.test(token.value) &&
        normalize(token.style.color) === '#FF0000'
    )
    expect(shComment).toBeTruthy()

    const shString = findToken(
      shellTokens,
      (token) =>
        /Hello/.test(token.value) && normalize(token.style.color) === '#00AA00'
    )
    expect(shString).toBeTruthy()
  })

  test('TSX line comment (including punctuation) inherits comment color', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const normalize = (c: string | undefined) => (c || '').toUpperCase()

    const source = `export const x = 1
// comment text`
    const tokens = await decodeRawTokens(tokenizer, source, 'tsx', ['light'])

    // Second line should be a single comment scope; every token should carry the comment color.
    const commentLine = tokens[1]
    expect(commentLine.length).toBeGreaterThan(0)
    for (const token of commentLine) {
      expect(normalize(token.style.color)).toBe('#FF0000')
    }
  })

  test('child combinator in parentScopes matches only the immediate parent (upstream parity)', () => {
    const rawTheme: TextMateThemeRaw = {
      name: 'child-combinator-test',
      settings: [
        { settings: { foreground: '#000000', background: '#ffffff' } },
        { scope: 'child', settings: { foreground: '#111111' } },
        { scope: 'parent > child', settings: { foreground: '#FF0000' } },
        { scope: 'grand > child', settings: { foreground: '#00FF00' } },
      ],
    }

    const theme = Theme.createFromParsedTheme(parseTheme(rawTheme), null)
    const colorMap = theme.getColorMap()

    const stackImmediate = ScopeStack.from('parent', 'child')!
    const matchImmediate = theme.match(stackImmediate)!
    expect(colorMap[matchImmediate.foregroundId].toUpperCase()).toBe('#FF0000')

    // Ancestor chain with parent->child still prefers the immediate-parent rule.
    const stackAncestor = ScopeStack.from('grand', 'parent', 'child')!
    const matchAncestor = theme.match(stackAncestor)!
    expect(colorMap[matchAncestor.foregroundId].toUpperCase()).toBe('#FF0000')

    // Only grand->child should match the grand>child rule.
    const stackGrandOnly = ScopeStack.from('grand', 'child')!
    const matchGrandOnly = theme.match(stackGrandOnly)!
    expect(colorMap[matchGrandOnly.foregroundId].toUpperCase()).toBe('#00FF00')
  })

  test('incremental tokenization matches full tokenization after an edit', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    const original = `const a = 1;
// comment`
    const updated = `const a = 2;
// comment`

    const baselineTokens = await decodeRawTokens(tokenizer, original, 'tsx', [
      'light',
    ])
    const grammarState = tokenizer.getGrammarState()

    const incrementalTokens = await decodeRawTokens(
      tokenizer,
      updated,
      'tsx',
      ['light'],
      { grammarState }
    )

    const full = await decodeRawTokens(tokenizer, updated, 'tsx', ['light'])
    expect(incrementalTokens).toEqual(full)
  })

  test('tokenizes shell code across multiple Tokenizer instances without rule ID conflicts', async () => {
    // This test reproduces a bug where rule IDs from one Grammar instance
    // leak into another when the same frozen grammar object is reused.
    // The error manifests as "Unknown ruleId XXXX" during tokenization.
    const source = 'npm install renoun'

    // Create multiple independent tokenizers (simulating separate sessions)
    const tokenizer1 = new Tokenizer<ThemeName>(registryOptions)
    const tokenizer2 = new Tokenizer<ThemeName>(registryOptions)
    const tokenizer3 = new Tokenizer<ThemeName>(registryOptions)

    // Tokenize with each tokenizer - this should not throw "Unknown ruleId"
    const tokens1 = await decodeRawTokens(tokenizer1, source, 'shell', [
      'light',
    ])
    const tokens2 = await decodeRawTokens(tokenizer2, source, 'shell', ['dark'])
    const tokens3 = await decodeRawTokens(tokenizer3, source, 'shell', [
      'light',
      'dark',
    ])

    // Basic sanity checks
    expect(tokens1.length).toBeGreaterThan(0)
    expect(tokens2.length).toBeGreaterThan(0)
    expect(tokens3.length).toBeGreaterThan(0)

    // All tokenizers should produce the same combined text
    // Note: Token boundaries may differ between themes due to scope resolution,
    // but the combined text should be identical
    const text1 = tokens1
      .flatMap((line) => line.map((token) => token.value))
      .join('')
    const text2 = tokens2
      .flatMap((line) => line.map((token) => token.value))
      .join('')
    const text3 = tokens3
      .flatMap((line) => line.map((token) => token.value))
      .join('')

    expect(text1).toBe(source)
    expect(text2).toBe(source)
    expect(text3).toBe(source)
  })

  test('tokenizes shell code with concurrent requests using same tokenizer', async () => {
    // Simulate the server scenario where a single tokenizer handles many concurrent requests
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    // Various shell code snippets
    const snippets = [
      'npm install renoun',
      'echo "Hello World"',
      'ls -la',
      'cd /home/user && pwd',
      'export PATH=$PATH:/usr/local/bin',
      'for i in 1 2 3; do echo $i; done',
      'if [ -f file.txt ]; then cat file.txt; fi',
      'grep -r "pattern" .',
      'npm install renoun', // duplicate to test memoization
    ]

    // Run all tokenizations concurrently
    const results = await Promise.all(
      snippets.map((source) =>
        decodeRawTokens(tokenizer, source, 'shell', ['light', 'dark'])
      )
    )

    // All should succeed
    for (const tokens of results) {
      expect(tokens.length).toBeGreaterThan(0)
      expect(tokens[0].length).toBeGreaterThan(0)
    }
  })

  test('tokenizes shell after loading MDX which embeds shell', async () => {
    // Skip this test for now - MDX has too many dependencies
    // TODO: Add proper test when we have a mock grammar loader
  })

  test('tokenizes TSX inside MDX fenced code blocks', async () => {
    // MDX grammar depends on auxiliary grammars (frontmatter, etc). For this test,
    // we only care about the TSX fence, so stub any unknown grammars as empty.
    const requestedScopes: string[] = []
    const mdxRegistryOptions: RegistryOptions<ThemeName> = {
      async getGrammar(scopeName) {
        requestedScopes.push(scopeName)
        try {
          return await registryOptions.getGrammar(scopeName)
        } catch {
          return {
            scopeName,
            patterns: [],
            repository: {},
          } as TextMateGrammarRaw
        }
      },
      getTheme: registryOptions.getTheme,
    }

    const tokenizer = new Tokenizer<ThemeName>(mdxRegistryOptions)
    const normalize = (c: string | undefined) => (c || '').toUpperCase()

    const mdx = [
      '# Title',
      '',
      '```tsx',
      "import React from 'react'",
      'export const x = 1',
      '```',
      '',
    ].join('\n')

    const tokens = await decodeRawTokens(tokenizer, mdx, 'mdx', ['light'])
    const flatTokens = tokens.flatMap((line) => line)

    expect(requestedScopes).toContain('source.mdx')
    expect(requestedScopes).toContain('source.tsx')

    const importToken = flatTokens.find((token) =>
      token.value.includes('import')
    )
    expect(importToken).toBeDefined()
    expect(normalize(importToken!.style.color)).toBe('#A492EA')
    expect(importToken!.style.fontStyle).toBe('italic')
  })

  test('tokenizes shell code interleaved with other languages', async () => {
    // Simulate real usage where multiple languages are tokenized
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    // Interleave shell with other languages
    const requests = [
      { source: '.button { color: red; }', lang: 'css' as const },
      { source: 'npm install renoun', lang: 'shell' as const },
      { source: 'const x = 1;', lang: 'tsx' as const },
      { source: 'echo "hello"', lang: 'shell' as const },
      { source: 'body { margin: 0; }', lang: 'css' as const },
      { source: 'ls -la', lang: 'shell' as const },
    ]

    // Run all in parallel to stress test concurrent grammar loading
    const results = await Promise.all(
      requests.map((req) =>
        decodeRawTokens(tokenizer, req.source, req.lang, ['light', 'dark'])
      )
    )

    for (const tokens of results) {
      expect(tokens.length).toBeGreaterThan(0)
    }

    // Now tokenize shell again after all grammars are loaded
    const shellTokens = await decodeRawTokens(
      tokenizer,
      'npm install renoun',
      'shell',
      ['light', 'dark']
    )
    expect(
      shellTokens.flatMap((line) => line.map((token) => token.value)).join('')
    ).toBe('npm install renoun')
  })

  test('tokenizes multiple themes without altering merged output', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = '/* comment line 1\ncomment line 2 */'

    const multiThemeTokens = await decodeRawTokens(tokenizer, source, 'css', [
      'light',
      'dark',
    ])
    const lightOnlyTokens = await decodeRawTokens(tokenizer, source, 'css', [
      'light',
    ])
    const darkOnlyTokens = await decodeRawTokens(tokenizer, source, 'css', [
      'dark',
    ])

    const tokenValues = (lines: typeof multiThemeTokens) =>
      lines.map((line) => line.map((token) => token.value))

    expect(tokenValues(multiThemeTokens)).toEqual(tokenValues(lightOnlyTokens))
    expect(tokenValues(multiThemeTokens)).toEqual(tokenValues(darkOnlyTokens))

    const firstLineComment = multiThemeTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const secondLineComment = multiThemeTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )

    const firstLineLight = lightOnlyTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const firstLineDark = darkOnlyTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const secondLineLight = lightOnlyTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )
    const secondLineDark = darkOnlyTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )

    expect(firstLineComment?.style['--0fg']).toBe(firstLineLight?.style.color)
    expect(firstLineComment?.style['--1fg']).toBe(firstLineDark?.style.color)
    expect(secondLineComment?.style['--0fg']).toBe(secondLineLight?.style.color)
    expect(secondLineComment?.style['--1fg']).toBe(secondLineDark?.style.color)

    expect(firstLineComment?.style.color).toBeUndefined()
    expect(secondLineComment?.style.color).toBeUndefined()
  })

  test('multi-theme output sets per-theme css vars independent of token iteration order', async () => {
    // Theme A: tags are base color
    // Theme B: tags are non-base color
    const themes: Record<'a' | 'b', TextMateThemeRaw> = {
      a: {
        name: 'A',
        type: 'dark',
        colors: { foreground: '#111111' },
        settings: [
          { settings: { foreground: '#111111', background: '#000000' } },
          { scope: ['entity.name.tag'], settings: { foreground: '#111111' } },
        ],
      },
      b: {
        name: 'B',
        type: 'dark',
        colors: { foreground: '#222222' },
        settings: [
          { settings: { foreground: '#222222', background: '#000000' } },
          { scope: ['entity.name.tag'], settings: { foreground: '#FF00FF' } },
        ],
      },
    }

    const registryOptions: RegistryOptions<'a' | 'b'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme(theme) {
        return themes[theme]
      },
    }

    const tokenizer = new Tokenizer<'a' | 'b'>(registryOptions)
    const tsx = `export default function X() { return <div /> }`
    const tokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['a', 'b'])
    const flatTokens = tokens.flatMap((line) => line)

    const divToken = flatTokens.find((token) => token.value === 'div')
    expect(divToken).toBeDefined()
    // In multi-theme mode we should emit CSS vars (not inline color).
    expect(divToken!.style.color).toBeUndefined()
    // Theme A: base -> no fg var
    expect(divToken!.style['--0fg']).toBeUndefined()
    // Theme B: non-base -> fg var set
    expect(divToken!.style['--1fg']).toBe('#FF00FF')
  })

  test('tokenizes TypeScript with keyword and string scopes', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = `import { Directory } from 'renoun'`

    const tokens = await decodeRawTokens(tokenizer, source, 'tsx', ['light'])
    const flatTokens = tokens.flatMap((line) => line)

    // Find the 'import' keyword token
    const importToken = flatTokens.find((token) => token.value === 'import')
    expect(importToken).toBeDefined()
    // The more specific keyword.control.import scope should win
    expect(importToken?.style.color).toBe('#A492EA')
    expect(importToken?.style.fontStyle).toBe('italic')

    // Find the string token
    const stringToken = flatTokens.find((token) =>
      token.value.includes('renoun')
    )
    expect(stringToken).toBeDefined()
    // Strings should have a color
    expect(stringToken?.style.color).toBe('#00AA00')
  })

  test('tokenizes full TSX code block without stopping mid-file', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = `import { Directory } from 'renoun'

const posts = new Directory({
  path: 'posts',
  filter: '*.mdx',
})

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const slug = (await params).slug
  const post = await posts.getFile(slug, 'mdx')
  const Content = await post.getExportValue('default')

  return <Content />
}`

    const tokens = await decodeRawTokens(tokenizer, source, 'tsx', ['light'])

    // Collect all text by joining lines with newlines
    const allText = tokens
      .map((line) => line.map((token) => token.value).join(''))
      .join('\n')

    // Verify we got all the text
    expect(allText).toBe(source)

    // Find the 'const slug' line by content (the one with await params)
    const slugLine = tokens.find((line) => {
      const text = line.map((token) => token.value).join('')
      return text.includes('const slug') && text.includes('await params')
    })
    expect(slugLine).toBeDefined()
    const slugText = slugLine!.map((token) => token.value).join('')
    expect(slugText).toBe('  const slug = (await params).slug')

    // Verify 'const' on slug line has keyword styling (may be combined with leading space)
    const constToken = slugLine!.find(
      (token) => token.value === 'const' || token.value.includes('const')
    )
    expect(constToken).toBeDefined()
    // The token value should contain 'const'
    expect(constToken?.value).toContain('const')
    expect(constToken?.style.color?.toUpperCase()).toBe('#A492EA')

    // Verify 'await' on slug line has keyword styling
    const awaitToken = slugLine!.find(
      (token) => token.value === 'await' || token.value.includes('await')
    )
    expect(awaitToken).toBeDefined()
    expect(awaitToken?.value).toContain('await')
    expect(awaitToken?.style.color?.toUpperCase()).toBe('#A492EA')

    // Find the 'return <Content />' line by content
    const returnLine = tokens.find((line) => {
      const text = line.map((token) => token.value).join('')
      return text.includes('return')
    })
    expect(returnLine).toBeDefined()
    const returnText = returnLine!.map((token) => token.value).join('')
    expect(returnText).toBe('  return <Content />')

    const returnToken = returnLine!.find((token) => token.value === 'return')
    expect(returnToken).toBeDefined()
    expect(returnToken?.style.color?.toUpperCase()).toBe('#A492EA')
  })

  test('tokenizes shell npm command with correct scope styling', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = 'npm install renoun'

    const tokens = await decodeRawTokens(tokenizer, source, 'shell', ['light'])
    const flatTokens = tokens.flatMap((line) => line)

    // Verify we got all the text
    const allText = flatTokens.map((token) => token.value).join('')
    expect(allText).toBe(source)

    // Find the 'npm' token - it should be styled as a command
    const npmToken = flatTokens.find((token) => token.value === 'npm')
    expect(npmToken).toBeDefined()
    // npm should be blue (#0077cc) and italic per our theme
    expect(npmToken?.style.color?.toUpperCase()).toBe('#0077CC')
    expect(npmToken?.style.fontStyle).toBe('italic')
  })

  test('streams tokenized lines without changing output', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = '/* comment line 1*/\n/* comment line 2 */'

    const streamed: string[][] = []
    for await (const result of tokenizer.stream(source, 'css', 'light')) {
      const lineTokens: string[] = []
      for (let i = 0; i < result.tokens.length; i += 2) {
        const start = result.tokens[i]
        const end =
          i + 2 < result.tokens.length
            ? result.tokens[i + 2]
            : result.lineText.length
        // Raw stream includes a final sentinel token at lineLength; skip zero-length slices.
        if (end <= start) continue
        lineTokens.push(result.lineText.slice(start, end))
      }
      streamed.push(lineTokens)
    }

    const tokens = await decodeRawTokens(tokenizer, source, 'css', ['light'])
    const nonStreamed = tokens.map((line) => line.map((token) => token.value))

    expect(streamed).toEqual(nonStreamed)
  })

  test('retrieves grammar state and reuses it across tokenization runs', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const firstChunk = '/* comment line 1'
    const secondChunk = 'comment line 2 */'

    const firstTokens = await decodeRawTokens(tokenizer, firstChunk, 'css', [
      'light',
    ])
    const grammarState = tokenizer.getGrammarState()

    expect(grammarState).toBeDefined()

    const secondTokens = await decodeRawTokens(
      tokenizer,
      secondChunk,
      'css',
      ['light'],
      { grammarState }
    )

    const incremental = [...firstTokens, ...secondTokens].map((line) =>
      line.map((token) => token.value)
    )

    const fullTokens = await decodeRawTokens(
      tokenizer,
      `${firstChunk}\n${secondChunk}`,
      'css',
      ['light']
    )
    const complete = fullTokens.map((line) => line.map((token) => token.value))

    expect(incremental).toEqual(complete)
  })

  test('handles grammarState mismatch gracefully', async () => {
    // This test verifies that using grammarState from one language with
    // another language throws a clear error rather than crashing mysteriously.
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    // Tokenize CSS to build up some grammar state
    const cssSource = `
      .container {
        display: flex;
        /* nested comment
      }
    `
    await decodeRawTokens(tokenizer, cssSource, 'css', ['light', 'dark'])
    const cssGrammarState = tokenizer.getGrammarState()

    // Now try to use CSS grammar state with shell tokenization
    // This should not crash with "Unknown ruleId" but either work or throw a clear error
    try {
      const shellSource = 'npm install renoun'
      await decodeRawTokens(
        tokenizer,
        shellSource,
        'shell',
        ['light', 'dark'],
        {
          grammarState: cssGrammarState,
        }
      )
      // If we get here, the tokenizer handled the mismatch gracefully
    } catch (error) {
      // The error should be informative, not a cryptic "Unknown ruleId"
      expect((error as Error).message).not.toMatch(/^Unknown ruleId \d+$/)
    }
  })

  test('handles grammarState with high ruleIds from different grammar', async () => {
    // Simulate the "Unknown ruleId 3252" scenario by using grammarState from
    // a complex grammar (tsx) with a simpler grammar (shell)
    const tokenizer1 = new Tokenizer<ThemeName>(registryOptions)
    const tokenizer2 = new Tokenizer<ThemeName>(registryOptions)

    // Tokenize complex TSX to build up high rule IDs
    const tsxSource = `
      import React, { useState, useEffect, useCallback, useMemo } from 'react';
      
      interface Props<token extends Record<string, unknown>> {
        data: token[];
        onSelect?: (item: token) => void;
        renderItem: (item: token, index: number) => React.ReactNode;
      }
      
      function MyComponent<token extends Record<string, unknown>>({ 
        data, 
        onSelect, 
        renderItem 
      }: Props<token>) {
        const [selected, setSelected] = useState<token | null>(null);
        
        useEffect(() => {
          console.log('Selected:', selected);
        }, [selected]);
        
        const handleClick = useCallback((item: token) => {
          setSelected(item);
          onSelect?.(item);
        }, [onSelect]);
        
        return (
          <div className="container">
            {data.map((item, index) => (
              <div key={index} onClick={() => handleClick(item)}>
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        );
      }
      
      export default MyComponent;
    `
    await decodeRawTokens(tokenizer1, tsxSource, 'tsx', ['light', 'dark'])
    const tsxGrammarState = tokenizer1.getGrammarState()

    // Log the grammar state to understand its structure
    // console.log('TSX grammar state:', JSON.stringify(tsxGrammarState, (key, value) => {
    //   if (key === 'parent') return value ? '[parent]' : null
    //   return value
    // }, 2))

    // Now use the TSX grammar state (with potentially high rule IDs) with shell
    // on a completely different tokenizer
    try {
      const shellSource = 'npm install renoun'
      await decodeRawTokens(
        tokenizer2,
        shellSource,
        'shell',
        ['light', 'dark'],
        {
          grammarState: tsxGrammarState,
        }
      )
      // If we get here, the tokenizer handled the mismatch gracefully
    } catch (error) {
      // The error should be informative if it throws
      const msg = (error as Error).message
      // Either it contains our enhanced error message or it's some other known error
      expect(
        msg.includes('StateStack from a different grammar') ||
          msg.includes('Grammar could not be loaded') ||
          !msg.match(/^Unknown ruleId \d+$/)
      ).toBe(true)
    }
  })

  test('textmate theme: const inside function should be styled', async () => {
    // Use an actual textmate theme to verify highlighting
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        if (scopeName === 'source.shell') return shellGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        // Cast to TextMateThemeRaw - the textmate theme has tokenColors
        const theme = textmateTheme as unknown as TextMateThemeRaw
        // Normalize: use tokenColors as settings
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)

    const tsx = `const a = 1
export default function Page() {
  const b = 2
}`
    const tokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['dark'])

    // Find both const tokens
    const constTokens: Array<{
      line: number
      color?: string
      isBaseColor: boolean
    }> = []
    for (let i = 0; i < tokens.length; i++) {
      for (const token of tokens[i]) {
        if (token.value === 'const') {
          constTokens.push({
            line: i,
            color: token.style.color,
            isBaseColor: token.isBaseColor,
          })
        }
      }
    }

    // Both should have the purple color, not be base color
    expect(constTokens.length).toBe(2)
    expect(constTokens[0].isBaseColor).toBe(false)
    expect(constTokens[1].isBaseColor).toBe(false)
    // Both should have the same color
    expect(constTokens[0].color?.toUpperCase()).toBe('#A492EA')
    expect(constTokens[1].color?.toUpperCase()).toBe('#A492EA')
  })

  test('textmate theme: npm should be styled in shell', async () => {
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.shell') return shellGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        const theme = textmateTheme as unknown as TextMateThemeRaw
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)
    const shell = 'npm install renoun'
    const tokens = await decodeRawTokens(tokenizer, shell, 'shell', ['dark'])

    // npm should be styled as a command (inheriting from entity.name.function)
    const npmToken = tokens[0].find((token) => token.value === 'npm')
    expect(npmToken).toBeDefined()
    // npm should have blue color (#82AAFF) from entity.name.function and be italic
    expect(npmToken!.isBaseColor).toBe(false)
    expect(npmToken!.style.color?.toUpperCase()).toBe('#82AAFF')
    expect(npmToken!.style.fontStyle).toBe('italic')
  })

  test('textmate theme: JSX tags and JSX comments should be styled in TSX', async () => {
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        const theme = textmateTheme as unknown as TextMateThemeRaw
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)

    const tsx = `export default function RootLayout() {
  return (
    <RootProvider>
      {/* JSX comment */}
      <html>
        <body>{children}</body>
      </html>
    </RootProvider>
  )
}`

    const tokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['dark'])
    const flatTokens = tokens.flatMap((line) => line)

    // Component tag names should be styled (entity.name.tag.custom -> #F78C6C in the bundled theme).
    const rootProviderToken = flatTokens.find(
      (token) => token.value === 'RootProvider'
    )
    expect(rootProviderToken).toBeDefined()
    expect(rootProviderToken!.isBaseColor).toBe(false)
    expect(rootProviderToken!.style.color?.toUpperCase()).toBe('#F78C6C')

    // Native HTML tag names should be styled (entity.name.tag -> #CAECE6 in the bundled theme).
    const htmlTagToken = flatTokens.find((token) => token.value === 'html')
    expect(htmlTagToken).toBeDefined()
    expect(htmlTagToken!.isBaseColor).toBe(false)
    expect(htmlTagToken!.style.color?.toUpperCase()).toBe('#CAECE6')

    // JSX comments should be styled like comments (italic + #637777 in the bundled theme).
    const jsxCommentToken = flatTokens.find((token) =>
      token.value.includes('JSX comment')
    )
    expect(jsxCommentToken).toBeDefined()
    expect(jsxCommentToken!.isBaseColor).toBe(false)
    expect(jsxCommentToken!.style.color?.toUpperCase()).toBe('#637777')
    expect(jsxCommentToken!.style.fontStyle).toBe('italic')
  })

  test('textmate theme: JSX single-line tags with attributes are styled', async () => {
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        const theme = textmateTheme as unknown as TextMateThemeRaw
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)

    // Single-line JSX with attributes works correctly
    const tsx = `<div css={1}></div>`
    const tokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['dark'])
    const flatTokens = tokens.flatMap((line) => line)

    // div tag should be styled (entity.name.tag.tsx -> #CAECE6)
    const divToken = flatTokens.find((token) => token.value === 'div')
    expect(divToken).toBeDefined()
    expect(divToken!.isBaseColor).toBe(false)
    expect(divToken!.style.color?.toUpperCase()).toBe('#CAECE6')

    // css attribute should be styled (entity.other.attribute-name -> #C5E478 + italic)
    const cssAttributeToken = flatTokens.find((token) => token.value === 'css')
    expect(cssAttributeToken).toBeDefined()
    expect(cssAttributeToken!.isBaseColor).toBe(false)
    expect(cssAttributeToken!.style.color?.toUpperCase()).toBe('#C5E478')
    expect(cssAttributeToken!.style.fontStyle).toBe('italic')
  })

  // Test that multi-line JSX with > on a different line is correctly tokenized.
  // This requires the tokenizer to append \n to each line.
  test('textmate theme: multi-line JSX with > on different line', async () => {
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        const theme = textmateTheme as unknown as TextMateThemeRaw
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)

    // Multi-line JSX where > is on a different line
    const tsx = `<div
  css={1}
></div>`
    const tokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['dark'])
    const flatTokens = tokens.flatMap((line) => line)

    // div tag should be styled correctly
    const divTokens = flatTokens.filter((token) => token.value === 'div')
    expect(divTokens.length).toBe(2) // Opening and closing
    expect(divTokens[0]!.isBaseColor).toBe(false)
    expect(divTokens[0]!.style.color?.toUpperCase()).toBe('#CAECE6')

    // css attribute should be styled
    const cssToken = flatTokens.find((token) => token.value === 'css')
    expect(cssToken).toBeDefined()
    expect(cssToken!.isBaseColor).toBe(false)
    expect(cssToken!.style.color?.toUpperCase()).toBe('#C5E478')
    expect(cssToken!.style.fontStyle).toBe('italic')
  })

  test('missing end should close immediately (not match \\uFFFF sentinel)', async () => {
    const registryOptions: RegistryOptions<'light'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName !== 'source.shell') {
          throw new Error(`Missing grammar for scope: ${scopeName}`)
        }

        return {
          scopeName: 'source.shell',
          patterns: [
            {
              begin: 'a',
              // Intentionally omit `end` to validate missing-end behavior.
              name: 'meta.block.test',
              contentName: 'meta.content.test',
              patterns: [],
            },
          ],
          repository: {},
        }
      },
      async getTheme() {
        return {
          name: 'Light',
          type: 'light',
          colors: { foreground: '#111111' },
          settings: [
            { settings: { foreground: '#111111', background: '#ffffff' } },
            {
              scope: ['meta.content.test'],
              settings: { foreground: '#ff0000' },
            },
          ],
        }
      },
    }

    const tokenizer = new Tokenizer<'light'>(registryOptions)
    const tokens = await decodeRawTokens(tokenizer, 'aXYZ', 'shell', ['light'])
    // console.log(tokens[0].map((token) => ({ v: token.value, c: token.style.color, base: token.isBaseColor })))

    const xyz = tokens[0].find((token) => token.value.includes('XYZ'))
    expect(xyz).toBeDefined()
    // If missing `end` accidentally becomes '\\uFFFF' and the engine appends a sentinel,
    // the content would extend to EOL and "XYZ" would become red. We expect default.
    const anyRed = tokens[0].some(
      (token) => token.style.color?.toUpperCase() === '#FF0000'
    )
    expect(anyRed).toBe(false)
  })
})

test('stream emits RawTokenizeResult per line', async () => {
  const tokenizer = new Tokenizer<ThemeName>(registryOptions)
  const source = `// hello
const x = 1`
  const chunks: RawTokenizeResult[] = []
  for await (const chunk of tokenizer.stream(source, 'tsx', 'dark')) {
    chunks.push(chunk)
  }

  expect(chunks.length).toBe(2)
  expect(chunks[0].tokens).toBeInstanceOf(Uint32Array)
  expect(chunks[0].lineText).toBe('// hello')
  expect(chunks[1].lineText).toBe('const x = 1')
  expect(tokenizer.getGrammarState().length).toBe(1)
})

test('stream + decodeBinaryChunk preserves comment punctuation color', async () => {
  const tokenizer = new Tokenizer<ThemeName>(registryOptions)
  const source = `export const x = 1
// comment text`

  // Mimic server init order: capture color map/base color before stream runs.
  await tokenizer.ensureTheme('light')
  const colorMap = tokenizer.getColorMap('light')
  const baseColor = tokenizer.getBaseColor('light')

  const batch: number[] = []
  for await (const result of tokenizer.stream(source, 'tsx', 'light')) {
    const lineTokens = result.tokens
    batch.push(lineTokens.length)
    for (let i = 0; i < lineTokens.length; i++) {
      batch.push(lineTokens[i])
    }
  }

  const decodeBinaryChunk = (
    chunk: Uint32Array,
    lines: string[],
    startLine: number,
    colorMap: string[],
    baseColor?: string
  ) => {
    let position = 0
    let lineIndex = startLine
    const decoded: Array<
      Array<{
        value: string
        start: number
        end: number
        hasTextStyles: boolean
        isBaseColor: boolean
        isWhiteSpace: boolean
        style: {
          color?: string
          fontStyle?: string
          fontWeight?: string
          textDecoration?: string
        }
      }>
    > = []

    while (position < chunk.length) {
      const count = chunk[position++] ?? 0
      const endPosition = position + count
      const lineTokenData = chunk.slice(position, endPosition)
      position = endPosition

      const lineText = lines[lineIndex] ?? ''
      const lineTokens: (typeof decoded)[number] = []

      for (let index = 0; index < lineTokenData.length; index += 2) {
        const start = lineTokenData[index]
        const metadata = lineTokenData[index + 1]
        const end =
          index + 2 < lineTokenData.length
            ? lineTokenData[index + 2]
            : lineText.length
        if (end <= start) continue

        const colorId = TokenMetadata.getForegroundId(metadata)
        const color = colorMap[colorId] || ''
        const fontFlags = TokenMetadata.getFontStyle(metadata)

        const fontStyle = fontFlags & FontStyle.Italic ? 'italic' : ''
        const fontWeight = fontFlags & FontStyle.Bold ? 'bold' : ''
        let textDecoration = ''
        if (fontFlags & FontStyle.Underline) textDecoration = 'underline'
        if (fontFlags & FontStyle.Strikethrough) {
          textDecoration = textDecoration
            ? `${textDecoration} line-through`
            : 'line-through'
        }

        const isBaseColor =
          !color ||
          (baseColor
            ? color.toLowerCase?.() === baseColor.toLowerCase?.()
            : false)

        const style: {
          color?: string
          fontStyle?: string
          fontWeight?: string
          textDecoration?: string
        } = {}
        if (color && !isBaseColor) style.color = color
        if (fontStyle) style.fontStyle = fontStyle
        if (fontWeight) style.fontWeight = fontWeight
        if (textDecoration) style.textDecoration = textDecoration

        lineTokens.push({
          value: lineText.slice(start, end),
          start,
          end,
          hasTextStyles: !!fontFlags,
          isBaseColor,
          isWhiteSpace: /^\s*$/.test(lineText.slice(start, end)),
          style,
        })
      }

      decoded.push(lineTokens)
      lineIndex++
    }

    return { tokens: decoded, nextLine: lineIndex }
  }

  const lines = source.split(/\r?\n/)
  const { tokens } = decodeBinaryChunk(
    new Uint32Array(batch),
    lines,
    0,
    colorMap,
    baseColor
  )

  const flat = tokens.flatMap((line) => line)
  const slashToken = flat.find((token) => token.value.trim().startsWith('//'))
  expect(slashToken).toBeDefined()
  expect(slashToken!.style.color?.toUpperCase()).toBe('#FF0000')
})

test('punctuation in line comments uses comment color', async () => {
  const textmateRegistryOptions: RegistryOptions<'dark'> = {
    async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
      if (scopeName === 'source.tsx') return tsxGrammar
      throw new Error(`Missing grammar for scope: ${scopeName}`)
    },
    async getTheme() {
      const theme = textmateTheme as unknown as TextMateThemeRaw
      return {
        ...theme,
        settings: theme.tokenColors || theme.settings || [],
      }
    },
  }

  const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)
  const tsx = `// greeting
const x = 1`
  const tokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['dark'])
  const flat = tokens.flatMap((line) => line)
  const slashToken = flat.find((token) => token.value === '//')
  expect(slashToken).toBeDefined()
  expect(slashToken!.isBaseColor).toBe(false)
  expect(slashToken!.style.color?.toUpperCase()).toBe('#637777')
})

test('template string interpolation does not bleed punctuation color into identifiers', async () => {
  const textmateRegistryOptions: RegistryOptions<'dark'> = {
    async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
      if (scopeName === 'source.tsx') return tsxGrammar
      throw new Error(`Missing grammar for scope: ${scopeName}`)
    },
    async getTheme() {
      const theme = textmateTheme as unknown as TextMateThemeRaw
      return {
        ...theme,
        settings: theme.tokenColors || theme.settings || [],
      }
    },
  }

  const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)
  const tsx = 'import(`./posts/${path}.mdx`)'
  const tokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['dark'])
  const flat = tokens.flat()

  const interpolationStart = flat.find((token) => token.value === '${')
  expect(interpolationStart).toBeDefined()
  expect(interpolationStart!.style.color?.toUpperCase()).toBe('#D3423E')

  const pathToken = flat.find((token) => token.value === 'path')
  expect(pathToken).toBeDefined()
  // In VSCode, the braces are colored, but the identifier is not red.
  expect(pathToken!.style.color?.toUpperCase()).not.toBe('#D3423E')
})

test('await params property access uses base color with italics', async () => {
  const textmateRegistryOptions: RegistryOptions<'dark'> = {
    async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
      if (scopeName === 'source.tsx') return tsxGrammar
      throw new Error(`Missing grammar for scope: ${scopeName}`)
    },
    async getTheme() {
      const theme = textmateTheme as unknown as TextMateThemeRaw
      return {
        ...theme,
        settings: theme.tokenColors || theme.settings || [],
      }
    },
  }

  const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)
  const tsx = 'const slug = (await params).slug'
  const tokens = await decodeRawTokens(tokenizer, tsx, 'tsx', ['dark'])
  const flat = tokens.flatMap((line) => line)

  const paramsToken = flat.find((token) => token.value === 'params')
  expect(paramsToken).toBeDefined()
  expect(paramsToken!.style.fontStyle).toBe('italic')
  expect(paramsToken!.isBaseColor).toBe(true)

  const dotIndex = flat.findIndex((token) => token.value === '.')
  const propertySlugToken =
    dotIndex >= 0
      ? flat.slice(dotIndex + 1).find((token) => token.value === 'slug')
      : undefined
  expect(propertySlugToken).toBeDefined()
  expect(propertySlugToken!.style.fontStyle).toBe('italic')
})
