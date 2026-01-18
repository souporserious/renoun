/*---------------------------------------------------------
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT License. See LICENSE.md in the
 * vscode-textmate repository for full license text.
 *
 * This file is compiled from vscode-textmate with significant changes:
 *
 * Structural changes:
 * - Consolidated multiple source files (rule.ts, theme.ts, utils.ts,
 *   registry.ts, main.ts, grammar/*.ts, etc.) into a single module
 * - Removed async OnigLib/WASM dependency in favor of synchronous JS regexes
 *
 * Regex engine:
 * - Replaced OnigScanner with native JS RegExp via `oniguruma-to-es`
 * - CompiledRule.findNextMatchSync uses JS regex execution with
 *   `hasIndices` flag for capture group positions
 * - Int32Array buffer pooling to minimize allocations during matching
 *
 * Additional utilities:
 * - TokenMetadata: zero-allocation decoder for encoded token metadata
 * - LineFonts: tracks fontFamily/fontSize/lineHeight through scope stack
 * - CSS variable color support (e.g. `var(--color, #fff)`)
 * - StringCachedFn: specialized cache for string keys using plain objects
 *
 * High-level APIs:
 * - Tokenizer: multi-theme registry with streaming tokenization
 * - TokenizerRegistry: language-to-scopeName resolution via grammars map
 * - RawTokenizeResult: Uint32Array-based token output for binary transport
 *
 * Performance improvements:
 * - Object/array pools for loop guards, capture arrays, and local stacks
 * - Lazy anchor cache building in RegExpSource
 * - Subarray views from LineTokens.finalize() to avoid copies
 *--------------------------------------------------------*/

import { toRegExp } from 'oniguruma-to-es'

import type { Languages, ScopeName } from '../grammars/index.ts'
import { grammars } from '../grammars/index.ts'

export function clone<T = any>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as any
  if (value && typeof value === 'object') {
    const result: any = {}
    for (const key in value as any) result[key] = clone((value as any)[key])
    return result
  }
  return value
}

export function mergeObjects<T extends Record<string, any>>(
  target: T,
  ...sources: Array<Record<string, any> | null | undefined>
): T {
  for (const source of sources) {
    if (!source) continue
    for (const key in source) (target as Record<string, any>)[key] = source[key]
  }
  return target
}

export function basename(path: string): string {
  let end = path.length - 1

  // Trim trailing / or \
  while (end >= 0) {
    const char = path.charCodeAt(end)
    if (char === 47 /* / */ || char === 92 /* \ */) end--
    else break
  }

  // Path is all slashes
  if (end < 0) return ''

  // Find start of last segment
  let start = end
  while (start >= 0) {
    const char = path.charCodeAt(start)
    if (char === 47 /* / */ || char === 92 /* \ */) break
    start--
  }

  return path.slice(start + 1, end + 1)
}

const CAPTURE_REGEX = /\$(\d+)|\${(\d+):\/(downcase|upcase)}/g
const CAPTURE_TEST_REGEX = /\$(\d+)|\${(\d+):\/(downcase|upcase)}/

export class RegexSource {
  private static _hasCapturesCache: Record<string, boolean> =
    Object.create(null)

  static hasCaptures(pattern: string | null): boolean {
    if (pattern === null) return false
    let result = RegexSource._hasCapturesCache[pattern]
    if (result === undefined) {
      result = CAPTURE_TEST_REGEX.test(pattern)
      RegexSource._hasCapturesCache[pattern] = result
    }
    return result
  }

  static replaceCaptures(
    template: string,
    sourceText: string,
    captures: any[]
  ) {
    return template.replace(
      CAPTURE_REGEX,
      (fullMatch, dollarN, bracketN, transform) => {
        const capture = captures[parseInt(dollarN || bracketN, 10)]
        if (!capture) return fullMatch

        let replacement = sourceText.substring(capture.start, capture.end)
        while (replacement.length > 0 && replacement.charCodeAt(0) === 46) {
          replacement = replacement.substring(1)
        }

        switch (transform) {
          case 'downcase':
            return replacement.toLowerCase()
          case 'upcase':
            return replacement.toUpperCase()
          default:
            return replacement
        }
      }
    )
  }
}

export function stringCompare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function stringArrayCompare(
  a: readonly string[] | null,
  b: readonly string[] | null
) {
  if (a === null && b === null) return 0
  if (!a) return -1
  if (!b) return 1

  const aLen = a.length
  const bLen = b.length
  if (aLen === bLen) {
    for (let index = 0; index < aLen; index++) {
      const result = stringCompare(a[index], b[index])
      if (result !== 0) return result
    }
    return 0
  }
  return aLen - bLen
}

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const CSS_VAR_HEX_DEFAULT = /var\((--.*),\s?(#[0-9a-f]+)\)/i

export function isValidHexColor(color: string) {
  return HEX_COLOR_REGEX.test(color)
}

function isValidCssVarWithHexColorDefault(potentialCssVar: string): boolean {
  const match = CSS_VAR_HEX_DEFAULT.exec(potentialCssVar)
  if (match !== null) {
    const hex = match[2]
    return isValidHexColor(hex)
  }
  return false
}

function colorValueToId(cssValue: string): string {
  const match = CSS_VAR_HEX_DEFAULT.exec(cssValue)
  if (match !== null) {
    return `var(${match[1]}, ${match[2].toUpperCase()})`
  }
  return cssValue.toUpperCase()
}

const ESCAPE_REGEXP_CHARS = /[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g
const ESCAPE_REGEXP_TEST = /[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/

export function escapeRegExpCharacters(value: string) {
  if (!ESCAPE_REGEXP_TEST.test(value)) return value
  ESCAPE_REGEXP_CHARS.lastIndex = 0
  return value.replace(ESCAPE_REGEXP_CHARS, '\\$&')
}

export class CachedFn<T, R> {
  #cache = new Map<T, R>()
  #fn: (arg: T) => R
  #maxSize: number
  constructor(fn: (arg: T) => R, maxSize = 0) {
    this.#fn = fn
    this.#maxSize = maxSize
  }
  get(arg: T): R {
    const cached = this.#cache.get(arg)
    if (cached !== undefined) return cached
    const value = this.#fn(arg)
    if (this.#maxSize > 0 && this.#cache.size >= this.#maxSize) {
      const firstKey = this.#cache.keys().next().value
      if (firstKey !== undefined) this.#cache.delete(firstKey)
    }
    this.#cache.set(arg, value)
    return value
  }
  clear() {
    this.#cache.clear()
  }
}

// Specialized cache for string keys using plain object
export class StringCachedFn<R> {
  #cache: Record<string, R> = Object.create(null)
  #size = 0
  #fn: (arg: string) => R
  #maxSize: number
  constructor(fn: (arg: string) => R, maxSize = 0) {
    this.#fn = fn
    this.#maxSize = maxSize
  }
  get(arg: string): R {
    let value = this.#cache[arg]
    if (value !== undefined) return value
    value = this.#fn(arg)
    if (this.#maxSize > 0 && this.#size >= this.#maxSize) {
      this.#cache = Object.create(null)
      this.#size = 0
    }
    this.#cache[arg] = value
    this.#size++
    return value
  }
  clear() {
    this.#cache = Object.create(null)
    this.#size = 0
  }
}

let containsRTLRegex: RegExp

export function containsRTL(value: string) {
  if (!containsRTLRegex) {
    containsRTLRegex =
      /(?:[\u05BE\u05C0\u05C3\u05C6\u05D0-\u05F4\u0608\u060B\u060D\u061B-\u064A\u066D-\u066F\u0671-\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u0710\u0712-\u072F\u074D-\u07A5\u07B1-\u07EA\u07F4\u07F5\u07FA\u07FE-\u0815\u081A\u0824\u0828\u0830-\u0858\u085E-\u088E\u08A0-\u08C9\u200F\uFB1D\uFB1F-\uFB28\uFB2A-\uFD3D\uFD50-\uFDC7\uFDF0-\uFDFC\uFE70-\uFEFC]|\uD802[\uDC00-\uDD1B\uDD20-\uDE00\uDE10-\uDE35\uDE40-\uDEE4\uDEEB-\uDF35\uDF40-\uDFFF]|\uD803[\uDC00-\uDD23\uDE80-\uDEA9\uDEAD-\uDF45\uDF51-\uDF81\uDF86-\uDFF6]|\uD83A[\uDC00-\uDCCF\uDD00-\uDD43\uDD4B-\uDFFF]|\uD83B[\uDC00-\uDEBB])/
  }
  return containsRTLRegex.test(value)
}

/** Font style bit flags */
export const FontStyle = {
  None: 0,
  Italic: 1,
  Bold: 2,
  Underline: 4,
  Strikethrough: 8,
} as const

/**
 * Zero-allocation token metadata decoder.
 * All methods are pure functions operating on the raw metadata integer.
 */
export const TokenMetadata = {
  /** Extract foreground color ID (9 bits, positions 15-23) */
  getForegroundId(metadata: number): number {
    return (metadata >>> 15) & 0b1_1111_1111
  },

  /** Extract background color ID (8 bits, positions 24-31) */
  getBackgroundId(metadata: number): number {
    return (metadata >>> 24) & 0b1111_1111
  },

  /** Extract font style flags (4 bits, positions 11-14) */
  getFontStyle(metadata: number): number {
    return (metadata >>> 11) & 0b1111
  },

  /** Extract token type (2 bits, positions 8-9) */
  getTokenType(metadata: number): number {
    return (metadata & 0x300) >>> 8
  },

  /** Extract language ID (8 bits, positions 0-7) */
  getLanguageId(metadata: number): number {
    return metadata & 0b1111_1111
  },

  /** Check if contains balanced brackets flag */
  containsBalancedBrackets(metadata: number): boolean {
    return (metadata & 0b1_0000_0000_00) !== 0
  },

  isItalic(metadata: number): boolean {
    return (this.getFontStyle(metadata) & FontStyle.Italic) !== 0
  },

  isBold(metadata: number): boolean {
    return (this.getFontStyle(metadata) & FontStyle.Bold) !== 0
  },

  isUnderline(metadata: number): boolean {
    return (this.getFontStyle(metadata) & FontStyle.Underline) !== 0
  },

  isStrikethrough(metadata: number): boolean {
    return (this.getFontStyle(metadata) & FontStyle.Strikethrough) !== 0
  },

  /** Get color from colorMap using metadata */
  getColor(metadata: number, colorMap: readonly string[]): string {
    return colorMap[this.getForegroundId(metadata)] ?? ''
  },

  /** Get background color from colorMap using metadata */
  getBackgroundColor(metadata: number, colorMap: readonly string[]): string {
    return colorMap[this.getBackgroundId(metadata)] ?? ''
  },
} as const

export const EncodedTokenAttributes = {
  toBinaryString(value: number) {
    return value.toString(2).padStart(32, '0')
  },

  print(value: number) {
    console.log({
      languageId: EncodedTokenAttributes.getLanguageId(value),
      tokenType: EncodedTokenAttributes.getTokenType(value),
      fontStyle: EncodedTokenAttributes.getFontStyle(value),
      foreground: EncodedTokenAttributes.getForeground(value),
      background: EncodedTokenAttributes.getBackground(value),
    })
  },

  getLanguageId: TokenMetadata.getLanguageId,
  getTokenType: TokenMetadata.getTokenType,
  containsBalancedBrackets: TokenMetadata.containsBalancedBrackets,
  getFontStyle: TokenMetadata.getFontStyle,
  getForeground: TokenMetadata.getForegroundId,
  getBackground: TokenMetadata.getBackgroundId,

  set(
    existing: number,
    languageId: number,
    tokenType: number,
    containsBalancedBrackets: boolean | null,
    fontStyle: number,
    foreground: number,
    background: number
  ) {
    let outLanguageId = EncodedTokenAttributes.getLanguageId(existing)
    let outTokenType = EncodedTokenAttributes.getTokenType(existing)
    let outBalanced = EncodedTokenAttributes.containsBalancedBrackets(existing)
      ? 1
      : 0
    let outFontStyle = EncodedTokenAttributes.getFontStyle(existing)
    let outForeground = EncodedTokenAttributes.getForeground(existing)
    let outBackground = EncodedTokenAttributes.getBackground(existing)

    if (languageId !== 0) outLanguageId = languageId
    if (tokenType !== 8) outTokenType = tokenType
    if (containsBalancedBrackets !== null)
      outBalanced = containsBalancedBrackets ? 1 : 0
    if (fontStyle !== -1) outFontStyle = fontStyle
    if (foreground !== 0) outForeground = foreground
    if (background !== 0) outBackground = background

    return (
      (outLanguageId |
        (outTokenType << 8) |
        (outBalanced << 10) |
        (outFontStyle << 11) |
        (outForeground << 15) |
        (outBackground << 24)) >>>
      0
    )
  },
} as const

export function toOptionalTokenType(value: any) {
  return value
}

class JSONState {
  position = 0
  length: number
  line = 1
  char = 0
  source: string
  constructor(source: string) {
    this.source = source
    this.length = source.length
  }
}

class JSONToken {
  value: string | null = null
  type: number = 0
  offset = -1
  length = -1
  line = -1
  char = -1

  toLocation(filename: string) {
    return { filename, line: this.line, char: this.char }
  }
}

function parseJSONError(state: JSONState, message: string) {
  throw new Error(
    'Near offset ' +
      state.position +
      ': ' +
      message +
      ' ~~~' +
      state.source.substr(state.position, 50) +
      '~~~'
  )
}

function parseJSONNext(state: JSONState, token: JSONToken) {
  token.value = null
  token.type = 0
  token.offset = -1
  token.length = -1
  token.line = -1
  token.char = -1

  let char: number
  const source = state.source
  let position = state.position
  const length = state.length
  let line = state.line
  let column = state.char

  function consumeKeyword(keyword: string): boolean {
    const keywordLength = keyword.length
    // consume first character (already matched by caller)
    position++
    column++
    if (position + keywordLength - 1 > length) return false
    for (let index = 1; index < keywordLength; index++) {
      if (source.charCodeAt(position) !== keyword.charCodeAt(index))
        return false
      position++
      column++
    }
    return true
  }

  while (true) {
    if (position >= length) return false
    char = source.charCodeAt(position)
    if (char !== 32 && char !== 9 && char !== 13) {
      if (char !== 10) break
      position++
      line++
      column = 0
    } else {
      position++
      column++
    }
  }

  token.offset = position
  token.line = line
  token.char = column

  if (char === 34) {
    token.type = 1
    position++
    column++
    while (true) {
      if (position >= length) return false
      char = source.charCodeAt(position)
      position++
      column++
      if (char === 92) {
        position++
        column++
      } else if (char === 34) {
        break
      }
    }
    token.value = source
      .substring(token.offset + 1, position - 1)
      .replace(/\\u([0-9A-Fa-f]{4})/g, (_m, hex) =>
        String.fromCodePoint(parseInt(hex, 16))
      )
      .replace(/\\(.)/g, (_m, esc) => {
        switch (esc) {
          case '"':
            return '"'
          case '\\':
            return '\\'
          case '/':
            return '/'
          case 'b':
            return '\b'
          case 'f':
            return '\f'
          case 'n':
            return '\n'
          case 'r':
            return '\r'
          case 't':
            return '\t'
          default:
            parseJSONError(state, 'invalid escape sequence')
        }
        throw new Error('unreachable')
      })
  } else if (char === 91) {
    token.type = 2 // [
    position++
    column++
  } else if (char === 123) {
    token.type = 3 // {
    position++
    column++
  } else if (char === 93) {
    token.type = 4 // ]
    position++
    column++
  } else if (char === 125) {
    token.type = 5 // }
    position++
    column++
  } else if (char === 58) {
    token.type = 6 // :
    position++
    column++
  } else if (char === 44) {
    token.type = 7 // ,
    position++
    column++
  } else if (char === 110) {
    token.type = 8 // null
    if (!consumeKeyword('null')) return false
  } else if (char === 116) {
    token.type = 9 // true
    if (!consumeKeyword('true')) return false
  } else if (char === 102) {
    token.type = 10 // false
    if (!consumeKeyword('false')) return false
  } else {
    token.type = 11 // number
    while (true) {
      if (position >= length) return false
      char = source.charCodeAt(position)
      if (
        char !== 46 &&
        !(char >= 48 && char <= 57) &&
        char !== 101 &&
        char !== 69 &&
        char !== 45 &&
        char !== 43
      ) {
        break
      }
      position++
      column++
    }
  }

  token.length = position - token.offset
  if (token.value === null)
    token.value = source.substr(token.offset, token.length)

  state.position = position
  state.line = line
  state.char = column
  return true
}

export function parseJSON(
  sourceText: string,
  filename: string,
  withLocation: boolean
) {
  const state = new JSONState(sourceText)
  const token = new JSONToken()

  // Parser state machine:
  // 0 root, 1 dict expects key/}, 2 dict expects ,/}, 3 dict expects key, 4 array expects value/], 5 array expects ,/], 6 array expects value
  let parserState = 0
  let currentValue: any = null

  const stateStack: number[] = []
  const valueStack: any[] = []

  function pushState() {
    stateStack.push(parserState)
    valueStack.push(currentValue)
  }
  function popState() {
    parserState = stateStack.pop()!
    currentValue = valueStack.pop()
  }
  function fail(message: string) {
    parseJSONError(state, message)
  }

  function pushContainer(nextState: number, value: any) {
    pushState()
    parserState = nextState
    currentValue = value
  }

  function handleValueToken(assign: (value: any) => void): boolean {
    switch (token.type) {
      case 1:
        assign(token.value)
        return true
      case 8:
        assign(null)
        return true
      case 9:
        assign(true)
        return true
      case 10:
        assign(false)
        return true
      case 11:
        assign(parseFloat(token.value!))
        return true
      case 2: {
        const arr: any[] = []
        assign(arr)
        pushContainer(4, arr)
        return true
      }
      case 3: {
        const obj: any = {}
        if (withLocation) obj.$textmateLocation = token.toLocation(filename)
        assign(obj)
        pushContainer(1, obj)
        return true
      }
      default:
        return false
    }
  }

  while (parseJSONNext(state, token)) {
    if (parserState === 0) {
      if (currentValue !== null) fail('too many constructs in root')
      if (token.type === 3) {
        currentValue = {}
        if (withLocation)
          currentValue.$textmateLocation = token.toLocation(filename)
        pushState()
        parserState = 1
        continue
      }
      if (token.type === 2) {
        currentValue = []
        pushState()
        parserState = 4
        continue
      }
      fail('unexpected token in root')
    }

    if (parserState === 2) {
      if (token.type === 5) {
        popState()
        continue
      }
      if (token.type === 7) {
        parserState = 3
        continue
      }
      fail('expected , or }')
    }

    if (parserState === 1 || parserState === 3) {
      if (parserState === 1 && token.type === 5) {
        popState()
        continue
      }
      if (token.type === 1) {
        const key = token.value!
        if (!parseJSONNext(state, token) || (token.type as number) !== 6)
          fail('expected colon')
        if (!parseJSONNext(state, token)) fail('expected value')

        parserState = 2

        if (
          handleValueToken((value) => {
            currentValue[key] = value
          })
        )
          continue
      }
      fail('unexpected token in dict')
    }

    if (parserState === 5) {
      if (token.type === 4) {
        popState()
        continue
      }
      if (token.type === 7) {
        parserState = 6
        continue
      }
      fail('expected , or ]')
    }

    if (parserState === 4 || parserState === 6) {
      if (parserState === 4 && token.type === 4) {
        popState()
        continue
      }
      parserState = 5

      if (handleValueToken((value) => currentValue.push(value))) continue
      fail('unexpected token in array')
    }

    fail('unknown state')
  }

  if (valueStack.length !== 0) fail('unclosed constructs')
  return currentValue
}

function parsePLISTBody(
  sourceText: string,
  filename: string | null,
  locationKey: string | null
): any {
  const totalLength = sourceText.length
  let position = 0
  let line = 1
  let column = 0

  function advance(count: number) {
    if (locationKey === null) {
      position += count
      return
    }
    while (count > 0) {
      if (sourceText.charCodeAt(position) === 10) {
        position++
        line++
        column = 0
      } else {
        position++
        column++
      }
      count--
    }
  }

  function setPosition(newPosition: number) {
    if (locationKey === null) position = newPosition
    else advance(newPosition - position)
  }

  function skipWhitespace() {
    while (position < totalLength) {
      const char = sourceText.charCodeAt(position)
      if (char !== 32 && char !== 9 && char !== 13 && char !== 10) break
      advance(1)
    }
  }

  function matchLiteral(lit: string) {
    if (sourceText.substr(position, lit.length) === lit) {
      advance(lit.length)
      return true
    }
    return false
  }

  function consumeThrough(lit: string) {
    const idx = sourceText.indexOf(lit, position)
    setPosition(idx !== -1 ? idx + lit.length : totalLength)
  }

  function readUntil(lit: string) {
    const idx = sourceText.indexOf(lit, position)
    if (idx !== -1) {
      const slice = sourceText.substring(position, idx)
      setPosition(idx + lit.length)
      return slice
    }
    const tail = sourceText.substr(position)
    setPosition(totalLength)
    return tail
  }

  if (totalLength > 0 && sourceText.charCodeAt(0) === 65279) position = 1

  // Parser state:
  // 0 root, 1 dict, 2 array
  let containerType = 0
  let currentValue: any = null
  const containerStack: number[] = []
  const valueStack: any[] = []
  let pendingKey: string | null = null

  function pushContainer(nextType: number, nextValue: any) {
    containerStack.push(containerType)
    valueStack.push(currentValue)
    containerType = nextType
    currentValue = nextValue
  }

  function popContainer() {
    if (containerStack.length === 0) fail('illegal state stack')
    containerType = containerStack.pop()!
    currentValue = valueStack.pop()
  }

  function fail(message: string): never {
    throw new Error(
      'Near offset ' +
        position +
        ': ' +
        message +
        ' ~~~' +
        sourceText.substr(position, 50) +
        '~~~'
    )
  }

  function createDict() {
    const obj: any = {}
    if (locationKey !== null)
      obj[locationKey] = { filename, line, char: column }
    return obj
  }

  function createArray() {
    return [] as any[]
  }

  function openContainer(type: 1 | 2, inArray: boolean) {
    const value = type === 1 ? createDict() : createArray()
    if (inArray) {
      currentValue.push(value)
    } else {
      if (pendingKey === null) return fail('missing <key>')
      currentValue[pendingKey] = value
      pendingKey = null
    }
    pushContainer(type, value)
  }

  function openRootContainer(type: 1 | 2) {
    const value = type === 1 ? createDict() : createArray()
    currentValue = value
    pushContainer(type, value)
  }

  const openDict = () => openContainer(1, false)
  const openArray = () => openContainer(2, false)
  const openDictInArray = () => openContainer(1, true)
  const openArrayInArray = () => openContainer(2, true)

  function closeContainer(expectedType: number, tagName: string) {
    if (containerType !== expectedType) return fail(`unexpected </${tagName}>`)
    popContainer()
  }

  const closeDict = () => closeContainer(1, 'dict')
  const closeArray = () => closeContainer(2, 'array')

  function assignValue(value: any) {
    if (containerType === 1) {
      if (pendingKey === null) return fail('missing <key>')
      currentValue[pendingKey] = value
      pendingKey = null
    } else if (containerType === 2) {
      currentValue.push(value)
    } else {
      currentValue = value
    }
  }

  function assignNumber(value: number, errorMessage: string) {
    if (isNaN(value)) return fail(errorMessage)
    assignValue(value)
  }

  function readTagName() {
    let tag = readUntil('>')
    let selfClosed = false
    if (tag.charCodeAt(tag.length - 1) === 47) {
      selfClosed = true
      tag = tag.substring(0, tag.length - 1)
    }
    return { name: tag.trim(), isClosed: selfClosed }
  }

  function readTagText(tag: { name: string; isClosed: boolean }) {
    if (tag.isClosed) return ''
    const inner = readUntil('</')
    consumeThrough('>')
    return inner
      .replace(/&#([0-9]+);/g, (_m, dec) =>
        String.fromCodePoint(parseInt(dec, 10))
      )
      .replace(/&#x([0-9a-f]+);/g, (_m, hex) =>
        String.fromCodePoint(parseInt(hex, 16))
      )
      .replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (entity) => {
        switch (entity) {
          case '&amp;':
            return '&'
          case '&lt;':
            return '<'
          case '&gt;':
            return '>'
          case '&quot;':
            return '"'
          case '&apos;':
            return "'"
        }
        return entity
      })
  }

  function closeTag(tagName: string, onClose?: () => void) {
    if (!matchLiteral(tagName)) return false
    consumeThrough('>')
    if (onClose) onClose()
    return true
  }

  while (position < totalLength) {
    skipWhitespace()
    if (position >= totalLength) break

    const lt = sourceText.charCodeAt(position)
    advance(1)
    if (lt !== 60) return fail('expected <') // '<'

    if (position >= totalLength) return fail('unexpected end of input')

    const nextCh = sourceText.charCodeAt(position)

    if (nextCh === 63) {
      // <? ... ?>
      advance(1)
      consumeThrough('?>')
      continue
    }

    if (nextCh === 33) {
      // <! ... >
      advance(1)
      if (matchLiteral('--')) {
        consumeThrough('-->')
        continue
      }
      consumeThrough('>')
      continue
    }

    if (nextCh === 47) {
      // </...>
      advance(1)
      skipWhitespace()
      if (closeTag('plist')) continue
      if (closeTag('dict', closeDict)) continue
      if (closeTag('array', closeArray)) continue
      return fail('unexpected closed tag')
    }

    const tag = readTagName()
    switch (tag.name) {
      case 'dict': {
        if (containerType === 1) openDict()
        else if (containerType === 2) openDictInArray()
        else openRootContainer(1)
        if (tag.isClosed) closeDict()
        continue
      }

      case 'array': {
        if (containerType === 1) openArray()
        else if (containerType === 2) openArrayInArray()
        else openRootContainer(2)
        if (tag.isClosed) closeArray()
        continue
      }

      case 'key': {
        const keyText = readTagText(tag)
        if (containerType !== 1) fail('unexpected <key>')
        else if (pendingKey !== null) fail('too many <key>')
        else pendingKey = keyText
        continue
      }

      case 'string':
      case 'data':
        assignValue(readTagText(tag))
        continue
      case 'real':
        assignNumber(parseFloat(readTagText(tag)), 'cannot parse float')
        continue
      case 'integer':
        assignNumber(parseInt(readTagText(tag), 10), 'cannot parse integer')
        continue
      case 'date':
        assignValue(new Date(readTagText(tag)))
        continue
      case 'true':
      case 'false':
        readTagText(tag)
        assignValue(tag.name === 'true')
        continue
    }

    if (!/^plist/.test(tag.name))
      return fail('unexpected opened tag ' + tag.name)
  }

  return currentValue
}

export function parseWithLocation(
  sourceText: string,
  filename: string,
  locationKey: string
) {
  return parsePLISTBody(sourceText, filename, locationKey)
}

export function parsePLIST(sourceText: string) {
  return parsePLISTBody(sourceText, null, null)
}

export function parseRawGrammar(
  sourceText: string,
  filename: string | null = null
) {
  if (filename !== null && /\.json$/.test(filename)) {
    return JSON.parse(sourceText)
  }
  return parsePLIST(sourceText)
}

export class Theme {
  #cachedMatchRoot: StringCachedFn<ThemeTrieElementRule[]>

  #colorMap: ColorMap
  #defaults: StyleAttributes
  #root: ThemeTrieElement

  constructor(
    colorMap: ColorMap,
    defaults: StyleAttributes,
    root: ThemeTrieElement
  ) {
    this.#colorMap = colorMap
    this.#defaults = defaults
    this.#root = root
    this.#cachedMatchRoot = new StringCachedFn((scope) =>
      this.#root.match(scope)
    )
  }

  static createFromRawTheme(
    rawTheme: IRawTheme | undefined,
    colorMap: string[] | null
  ) {
    return this.createFromParsedTheme(parseTheme(rawTheme), colorMap)
  }

  static createFromParsedTheme(
    rules: ParsedThemeRule[],
    colorMap: string[] | null
  ) {
    return (function buildTheme(
      sortedRules: ParsedThemeRule[],
      colorMap: string[] | null
    ) {
      sortedRules.sort((a, b) => {
        let cmp = stringCompare(a.scope, b.scope)
        if (cmp !== 0) return cmp
        cmp = stringArrayCompare(a.parentScopes, b.parentScopes)
        return cmp !== 0 ? cmp : a.index - b.index
      })

      let defaultFontStyle = 0
      let defaultForeground = '#000000'
      let defaultBackground = '#ffffff'
      let defaultFontFamily = ''
      let defaultFontSize = ''
      let defaultLineHeight = 0

      // Extract default rules (those with empty scope)
      while (sortedRules.length >= 1 && sortedRules[0].scope === '') {
        const rule = sortedRules.shift()!
        if (rule.fontStyle !== -1) defaultFontStyle = rule.fontStyle
        if (rule.foreground !== null) defaultForeground = rule.foreground
        if (rule.background !== null) defaultBackground = rule.background
        if (rule.fontFamily !== null) defaultFontFamily = rule.fontFamily
        if (rule.fontSize !== null) defaultFontSize = rule.fontSize
        if (rule.lineHeight !== null) defaultLineHeight = rule.lineHeight
      }

      const map = new ColorMap(colorMap)
      const defaults = new StyleAttributes(
        defaultFontStyle,
        map.getId(defaultForeground),
        map.getId(defaultBackground),
        defaultFontFamily,
        defaultFontSize,
        defaultLineHeight
      )

      const root = new ThemeTrieElement(
        new ThemeTrieElementRule(
          0,
          null,
          -1,
          0,
          0,
          defaultFontFamily,
          defaultFontSize,
          defaultLineHeight
        ),
        [],
        {}
      )

      // Insert all rules into the trie
      for (
        let index = 0, sortedRulesLength = sortedRules.length;
        index < sortedRulesLength;
        index++
      ) {
        const rule = sortedRules[index]
        const foregroundId = map.getId(rule.foreground)

        root.insert(
          0,
          rule.scope,
          rule.parentScopes,
          rule.fontStyle,
          foregroundId,
          map.getId(rule.background),
          rule.fontFamily,
          rule.fontSize,
          rule.lineHeight
        )
      }

      return new Theme(map, defaults, root)
    })(rules, colorMap)
  }

  getColorMap() {
    return this.#colorMap.getColorMap()
  }

  getDefaults() {
    return this.#defaults
  }

  match(scope: ScopeStack) {
    if (scope === null) {
      return this.#defaults
    }

    const scopeName = scope.scopeName

    const candidateRules = this.#cachedMatchRoot.get(scopeName)

    const match = candidateRules.find((rule) =>
      scopePathMatchesParentScopes(scope.parent, rule.parentScopes)
    )

    if (match) {
      const attributes = match.getStyleAttributes()
      return attributes
    }
    return null
  }

  /**
   * Fast-path theme matching using AttributedScopeStack (no ScopeStack allocations).
   * Semantics mirror Theme.match(scope: ScopeStack).
   */
  matchAttributed(
    scopeName: string,
    parent: AttributedScopeStack | null
  ): StyleAttributes | null {
    const candidateRules = this.#cachedMatchRoot.get(scopeName)
    const match = candidateRules.find((rule: any) =>
      scopePathMatchesParentScopesAttributed(parent, rule.parentScopes)
    )
    if (!match) {
      return null
    }
    return match.getStyleAttributes()
  }
}

export class ScopeStack {
  parent: ScopeStack | null
  scopeName: string
  #segments: string[] | null = null

  constructor(parent: ScopeStack | null, scopeName: string) {
    this.parent = parent
    this.scopeName = scopeName
  }

  static push(
    stack: ScopeStack | null,
    scopeNames: string[]
  ): ScopeStack | null {
    for (let index = 0, length = scopeNames.length; index < length; index++) {
      stack = new ScopeStack(stack, scopeNames[index])
    }
    return stack
  }

  static from(...scopes: string[]): ScopeStack | null {
    let stack: ScopeStack | null = null
    for (let index = 0; index < scopes.length; index++)
      stack = new ScopeStack(stack, scopes[index])
    return stack
  }

  push(scope: string) {
    return new ScopeStack(this, scope)
  }

  getSegments(): string[] {
    if (this.#segments !== null) return this.#segments
    let current: ScopeStack | null = this
    const segments: string[] = []
    while (current) {
      segments.push(current.scopeName)
      current = current.parent
    }
    segments.reverse()
    this.#segments = segments
    return segments
  }

  toString() {
    return this.getSegments().join(' ')
  }

  extends(other: ScopeStack): boolean {
    return (
      this === other || (this.parent !== null && this.parent.extends(other))
    )
  }

  getExtensionIfDefined(base: ScopeStack | null) {
    const extension: string[] = []
    let current: ScopeStack | null = this
    while (current && current !== base) {
      extension.push(current.scopeName)
      current = current.parent
    }
    return current === base ? extension.reverse() : undefined
  }
}

function scopeMatches(actual: string, expected: string) {
  if (!actual) return false
  if (expected === actual) return true
  const expectedLength = expected.length
  return (
    actual.length > expectedLength &&
    actual.charCodeAt(expectedLength) === 46 && // 46 = '.'
    actual.lastIndexOf(expected, 0) === 0
  ) // faster startsWith
}

type ScopePathLike = { parent: ScopePathLike | null; scopeName: string | null }

function scopePathMatchesParentScopesCore(
  scopePath: ScopePathLike | null,
  parentScopes: readonly string[],
  allowNullScopeName: boolean
): boolean {
  if (parentScopes.length === 0) {
    return true
  }

  for (let index = 0; index < parentScopes.length; index++) {
    let scopePattern = parentScopes[index]
    let scopeMustMatch = false

    if (scopePattern === '>') {
      if (index === parentScopes.length - 1) {
        return false
      }
      scopePattern = parentScopes[++index]
      scopeMustMatch = true
    }

    while (scopePath) {
      const scopeName = scopePath.scopeName
      if (
        (!allowNullScopeName || scopeName) &&
        scopeMatches(scopeName as string, scopePattern)
      ) {
        break
      }
      if (scopeMustMatch) {
        return false
      }
      scopePath = scopePath.parent
    }

    if (!scopePath) {
      return false
    }
    scopePath = scopePath.parent
  }

  return true
}

function scopePathMatchesParentScopes(
  scopePath: ScopeStack | null,
  parentScopes: readonly string[]
): boolean {
  return scopePathMatchesParentScopesCore(
    scopePath as ScopePathLike | null,
    parentScopes,
    false
  )
}

function scopePathMatchesParentScopesAttributed(
  scopePath: AttributedScopeStack | null,
  parentScopes: readonly string[]
): boolean {
  return scopePathMatchesParentScopesCore(
    scopePath as ScopePathLike | null,
    parentScopes,
    true
  )
}

const scopeInternTable = new Map<string, string>()
function internScope(scope: string): string {
  const existing = scopeInternTable.get(scope)
  if (existing) return existing
  scopeInternTable.set(scope, scope)
  return scope
}

export class StyleAttributes {
  fontStyle: number
  foregroundId: number
  backgroundId: number
  fontFamily: string | null
  fontSize: string | null
  lineHeight: number | null
  constructor(
    fontStyle: number,
    foregroundId: number,
    backgroundId: number,
    fontFamily: string | null,
    fontSize: string | null,
    lineHeight: number | null
  ) {
    this.fontStyle = fontStyle
    this.foregroundId = foregroundId
    this.backgroundId = backgroundId
    this.fontFamily = fontFamily
    this.fontSize = fontSize
    this.lineHeight = lineHeight
  }
}

export function parseTheme(theme: IRawTheme | undefined) {
  if (!theme) {
    return []
  }

  const settings = theme.settings || theme.tokenColors
  if (!settings || !Array.isArray(settings)) {
    return []
  }

  const parsed: ParsedThemeRule[] = []
  let ruleIndex = 0

  for (
    let index = 0, settingsLength = settings.length;
    index < settingsLength;
    index++
  ) {
    const entry = settings[index]
    const entrySettings = entry.settings
    if (!entrySettings) {
      continue
    }

    let scopes: string[]
    if (typeof entry.scope === 'string') {
      let scopeString = entry.scope
      scopeString = scopeString.replace(/^[,]+/, '')
      scopeString = scopeString.replace(/[,]+$/, '')
      scopes = scopeString.split(',')
    } else {
      scopes = Array.isArray(entry.scope) ? entry.scope : ['']
    }

    let fontStyle = -1
    if (typeof entrySettings.fontStyle === 'string') {
      fontStyle = 0
      const parts = entrySettings.fontStyle.split(' ')
      for (
        let index = 0, partsLength = parts.length;
        index < partsLength;
        index++
      ) {
        switch (parts[index]) {
          case 'italic':
            fontStyle |= 1
            break
          case 'bold':
            fontStyle |= 2
            break
          case 'underline':
            fontStyle |= 4
            break
          case 'strikethrough':
            fontStyle |= 8
            break
        }
      }
    }

    let foreground: string | null = null
    if (typeof entrySettings.foreground === 'string') {
      if (
        isValidHexColor(entrySettings.foreground) ||
        isValidCssVarWithHexColorDefault(entrySettings.foreground)
      ) {
        foreground = entrySettings.foreground
      }
    }

    let background: string | null = null
    if (typeof entrySettings.background === 'string') {
      if (
        isValidHexColor(entrySettings.background) ||
        isValidCssVarWithHexColorDefault(entrySettings.background)
      ) {
        background = entrySettings.background
      }
    }

    let fontFamily: string | null = ''
    if (typeof entrySettings.fontFamily === 'string')
      fontFamily = entrySettings.fontFamily

    let fontSize: string | null = ''
    if (typeof entrySettings.fontSize === 'string')
      fontSize = entrySettings.fontSize

    let lineHeight = 0
    if (typeof entrySettings.lineHeight === 'number')
      lineHeight = entrySettings.lineHeight

    for (let s = 0; s < scopes.length; s++) {
      const scopeParts = scopes[s].trim().split(' ')
      const scope = scopeParts[scopeParts.length - 1]
      let parentScopes: string[] | null = null
      if (scopeParts.length > 1) {
        parentScopes = scopeParts.slice(0, scopeParts.length - 1)
        parentScopes.reverse()
      }

      parsed[ruleIndex++] = new ParsedThemeRule(
        scope,
        parentScopes,
        index,
        fontStyle,
        foreground,
        background,
        fontFamily,
        fontSize,
        lineHeight
      )
    }
  }

  return parsed
}

export class ParsedThemeRule {
  scope: string
  parentScopes: string[] | null
  index: number
  fontStyle: number
  foreground: string | null
  background: string | null
  fontFamily: string | null
  fontSize: string | null
  lineHeight: number | null
  constructor(
    scope: string,
    parentScopes: string[] | null,
    index: number,
    fontStyle: number,
    foreground: string | null,
    background: string | null,
    fontFamily: string | null,
    fontSize: string | null,
    lineHeight: number | null
  ) {
    this.scope = scope
    this.parentScopes = parentScopes
    this.index = index
    this.fontStyle = fontStyle
    this.foreground = foreground
    this.background = background
    this.fontFamily = fontFamily
    this.fontSize = fontSize
    this.lineHeight = lineHeight
  }
}

export function fontStyleToString(fontStyle: number) {
  if (fontStyle === -1) return 'not set'
  let out = ''
  if (fontStyle & 1) out += 'italic '
  if (fontStyle & 2) out += 'bold '
  if (fontStyle & 4) out += 'underline '
  if (fontStyle & 8) out += 'strikethrough '
  if (out === '') out = 'none'
  return out.trim()
}

export class ColorMap {
  #lastColorId = 0
  #id2color: string[] = []
  #color2id: Record<string, number> = Object.create(null)
  #isFrozen: boolean

  constructor(initialColorMap: string[] | null) {
    if (Array.isArray(initialColorMap)) {
      this.#isFrozen = true
      for (
        let index = 0, colorMapLength = initialColorMap.length;
        index < colorMapLength;
        index++
      ) {
        this.#color2id[initialColorMap[index]] = index
        this.#id2color[index] = initialColorMap[index]
      }
    } else {
      this.#isFrozen = false
    }
  }

  getId(color: string | null) {
    if (color === null) {
      return 0
    }
    const normalized = colorValueToId(color)
    let id = this.#color2id[color]
    if (id !== undefined) {
      return id
    }
    id = this.#color2id[normalized]
    if (id !== undefined) {
      this.#color2id[color] = id
      return id
    }
    if (this.#isFrozen) {
      throw new Error(`Missing color in color map - ${color}`)
    }
    id = ++this.#lastColorId
    this.#color2id[normalized] = id
    this.#color2id[color] = id
    this.#id2color[id] = normalized
    return id
  }

  getColorMap() {
    return this.#id2color.slice(0)
  }
}

const EMPTY_PARENT_SCOPES: readonly string[] = Object.freeze([] as string[])

export class ThemeTrieElementRule {
  parentScopes: readonly string[]
  #cachedStyleAttributes: StyleAttributes | null = null

  scopeDepth: number
  fontStyle: number
  foreground: number
  background: number
  fontFamily: string | null
  fontSize: string | null
  lineHeight: number | null

  constructor(
    scopeDepth: number,
    parentScopes: readonly string[] | null,
    fontStyle: number,
    foreground: number,
    background: number,
    fontFamily: string | null,
    fontSize: string | null,
    lineHeight: number | null
  ) {
    this.scopeDepth = scopeDepth
    this.parentScopes = parentScopes || EMPTY_PARENT_SCOPES
    this.fontStyle = fontStyle
    this.foreground = foreground
    this.background = background
    this.fontFamily = fontFamily
    this.fontSize = fontSize
    this.lineHeight = lineHeight
  }

  getStyleAttributes(): StyleAttributes {
    if (!this.#cachedStyleAttributes) {
      this.#cachedStyleAttributes = new StyleAttributes(
        this.fontStyle,
        this.foreground,
        this.background,
        this.fontFamily,
        this.fontSize,
        this.lineHeight
      )
    }
    return this.#cachedStyleAttributes
  }

  clone() {
    return new ThemeTrieElementRule(
      this.scopeDepth,
      this.parentScopes,
      this.fontStyle,
      this.foreground,
      this.background,
      this.fontFamily,
      this.fontSize,
      this.lineHeight
    )
  }

  static cloneArr(rules: ThemeTrieElementRule[]) {
    const out: ThemeTrieElementRule[] = []
    for (
      let index = 0, rulesLength = rules.length;
      index < rulesLength;
      index++
    )
      out[index] = rules[index].clone()
    return out
  }

  acceptOverwrite(
    scopeDepth: number,
    fontStyle: number,
    foreground: number,
    background: number,
    fontFamily: string,
    fontSize: string,
    lineHeight: number
  ) {
    if (this.scopeDepth > scopeDepth) {
      console.log('how did this happen?')
    } else {
      this.scopeDepth = scopeDepth
    }
    this.#cachedStyleAttributes = null
    if (fontStyle !== -1) this.fontStyle = fontStyle
    if (foreground !== 0) this.foreground = foreground
    if (background !== 0) this.background = background
    if (fontFamily !== '') this.fontFamily = fontFamily
    if (fontSize !== '') this.fontSize = fontSize
    if (lineHeight !== 0) this.lineHeight = lineHeight
  }
}

export class ThemeTrieElement {
  #mainRule: ThemeTrieElementRule
  #rulesWithParentScopes: ThemeTrieElementRule[]
  #children: Record<string, ThemeTrieElement>
  constructor(
    mainRule: ThemeTrieElementRule,
    rulesWithParentScopes: ThemeTrieElementRule[] = [],
    children: Record<string, ThemeTrieElement> = {}
  ) {
    this.#mainRule = mainRule
    this.#rulesWithParentScopes = rulesWithParentScopes
    this.#children = children
  }

  static compareBySpecificity(
    a: ThemeTrieElementRule,
    b: ThemeTrieElementRule
  ) {
    if (a.scopeDepth !== b.scopeDepth) return b.scopeDepth - a.scopeDepth

    let aIndex = 0
    let bIndex = 0
    while (true) {
      if (a.parentScopes[aIndex] === '>') {
        aIndex++
      }
      if (b.parentScopes[bIndex] === '>') {
        bIndex++
      }
      if (aIndex >= a.parentScopes.length || bIndex >= b.parentScopes.length) {
        break
      }
      const aScope = a.parentScopes[aIndex]
      const bScope = b.parentScopes[bIndex]
      const comparison = bScope.length - aScope.length
      if (comparison !== 0) return comparison
      aIndex++
      bIndex++
    }
    return b.parentScopes.length - a.parentScopes.length
  }

  match(scope: string): ThemeTrieElementRule[] {
    if (scope !== '') {
      let head: string
      let tail: string
      const dot = scope.indexOf('.')
      if (dot === -1) {
        head = scope
        tail = ''
      } else {
        head = scope.substring(0, dot)
        tail = scope.substring(dot + 1)
      }

      if (this.#children.hasOwnProperty(head)) {
        return this.#children[head].match(tail)
      }
    }

    const parentRules = this.#rulesWithParentScopes
    const parentLen = parentRules.length
    const rules = new Array<ThemeTrieElementRule>(parentLen + 1)
    for (let index = 0; index < parentLen; index++) {
      rules[index] = parentRules[index]
    }
    rules[parentLen] = this.#mainRule
    rules.sort(ThemeTrieElement.compareBySpecificity)

    return rules
  }

  insert(
    scopeDepth: number,
    scope: string,
    parentScopes: string[] | null,
    fontStyle: number,
    foreground: number,
    background: number,
    fontFamily: string | null,
    fontSize: string | null,
    lineHeight: number | null
  ) {
    if (scope === '') {
      this._doInsertHere(
        scopeDepth,
        parentScopes,
        fontStyle,
        foreground,
        background,
        fontFamily,
        fontSize,
        lineHeight
      )
      return
    }

    let head: string
    let tail: string
    const dot = scope.indexOf('.')
    if (dot === -1) {
      head = scope
      tail = ''
    } else {
      head = scope.substring(0, dot)
      tail = scope.substring(dot + 1)
    }

    let child: ThemeTrieElement
    if (this.#children.hasOwnProperty(head)) {
      child = this.#children[head]
    } else {
      child = new ThemeTrieElement(
        this.#mainRule.clone(),
        ThemeTrieElementRule.cloneArr(this.#rulesWithParentScopes)
      )
      this.#children[head] = child
    }

    child.insert(
      scopeDepth + 1,
      tail,
      parentScopes,
      fontStyle,
      foreground,
      background,
      fontFamily,
      fontSize,
      lineHeight
    )
  }

  _doInsertHere(
    scopeDepth: number,
    parentScopes: string[] | null,
    fontStyle: number,
    foreground: number,
    background: number,
    fontFamily: string | null,
    fontSize: string | null,
    lineHeight: number | null
  ) {
    if (parentScopes !== null) {
      const rules = this.#rulesWithParentScopes
      for (
        let index = 0, rulesLength = rules.length;
        index < rulesLength;
        index++
      ) {
        const rule = rules[index]
        if (stringArrayCompare(rule.parentScopes, parentScopes) === 0) {
          rule.acceptOverwrite(
            scopeDepth,
            fontStyle,
            foreground,
            background,
            fontFamily || '',
            fontSize || '',
            lineHeight || 0
          )
          return
        }
      }

      if (fontStyle === -1) fontStyle = this.#mainRule.fontStyle
      if (foreground === 0) foreground = this.#mainRule.foreground
      if (background === 0) background = this.#mainRule.background
      if (fontFamily === '') fontFamily = this.#mainRule.fontFamily
      if (fontSize === '') fontSize = this.#mainRule.fontSize
      if (lineHeight === 0) lineHeight = this.#mainRule.lineHeight

      this.#rulesWithParentScopes.push(
        new ThemeTrieElementRule(
          scopeDepth,
          parentScopes,
          fontStyle,
          foreground,
          background,
          fontFamily || '',
          fontSize || '',
          lineHeight || 0
        )
      )
    } else {
      this.#mainRule.acceptOverwrite(
        scopeDepth,
        fontStyle,
        foreground,
        background,
        fontFamily || '',
        fontSize || '',
        lineHeight || 0
      )
    }
  }
}

export class BasicScopeAttributes {
  languageId: number
  tokenType: number
  constructor(languageId: number, tokenType: number) {
    this.languageId = languageId
    this.tokenType = tokenType
  }
}

export class BasicScopeAttributesProvider {
  #getBasicScopeAttributes: StringCachedFn<BasicScopeAttributes>
  #defaultAttributes: BasicScopeAttributes
  #embeddedLanguagesMatcher: ScopeMatcher

  constructor(defaultLanguageId: number, embeddedLanguages: any) {
    this.#getBasicScopeAttributes = new StringCachedFn((scopeName: string) => {
      const languageId = this.#scopeToLanguage(scopeName)
      const tokenType = this.#toStandardTokenType(scopeName)
      return new BasicScopeAttributes(languageId, tokenType)
    })
    this.#defaultAttributes = new BasicScopeAttributes(defaultLanguageId, 8)
    this.#embeddedLanguagesMatcher = new ScopeMatcher(
      Object.entries(embeddedLanguages || {})
    )
  }

  getDefaultAttributes() {
    return this.#defaultAttributes
  }

  getBasicScopeAttributes(scopeName: string | null): BasicScopeAttributes {
    if (scopeName === null)
      return BasicScopeAttributesProvider._NULL_SCOPE_METADATA
    return this.#getBasicScopeAttributes.get(scopeName)
  }

  #scopeToLanguage(scopeName: string) {
    return this.#embeddedLanguagesMatcher.match(scopeName) || 0
  }

  #toStandardTokenType(scopeName: string) {
    const m = scopeName.match(
      BasicScopeAttributesProvider.STANDARD_TOKEN_TYPE_REGEXP
    )
    if (!m) return 8
    switch (m[1]) {
      case 'comment':
        return 1
      case 'string':
        return 2
      case 'regex':
        return 3
      case 'meta.embedded':
        return 0
    }
    throw new Error('Unexpected match for standard token type!')
  }

  static _NULL_SCOPE_METADATA = new BasicScopeAttributes(0, 0)
  static STANDARD_TOKEN_TYPE_REGEXP =
    /\b(comment|string|regex|meta\.embedded)\b/
}

class ScopeMatcher {
  #values: Map<string, any> | null = null
  #scopesRegExp: RegExp | null = null

  constructor(pairs: any[]) {
    if (pairs.length === 0) {
      this.#values = null
      this.#scopesRegExp = null
    } else {
      this.#values = new Map(pairs)
      const scopes = pairs.map(([scope]: [string, any]) =>
        escapeRegExpCharacters(scope)
      )
      scopes.sort()
      scopes.reverse()
      this.#scopesRegExp = new RegExp(`^((${scopes.join(')|(')}))($|\\.)`, '')
    }
  }

  match(scope: string) {
    if (!this.#scopesRegExp) return
    const m = scope.match(this.#scopesRegExp)
    return m ? this.#values!.get(m[1]) : undefined
  }
}

function isSelector(token: string) {
  return !!token && !!token.match(/[\w\.:]+/)
}

export function createMatchers(
  selector: string,
  matchesName: (names: string[], scopeSegments: string[]) => boolean
) {
  const results: any[] = []

  const tokenizer = (function makeTokenizer(selector: string) {
    const tokenRe = /([LR]:|[\w\.:][\w\.:\-]*|[\,\|\-\(\)])/g
    let match = tokenRe.exec(selector)
    return {
      next: () => {
        if (!match) return null
        const value = match[0]
        match = tokenRe.exec(selector)
        return value
      },
    }
  })(selector)

  let token = tokenizer.next()
  while (token !== null) {
    let priority = 0
    if (token.length === 2 && token.charAt(1) === ':') {
      switch (token.charAt(0)) {
        case 'R':
          priority = 1
          break
        case 'L':
          priority = -1
          break
        default:
          console.log(`Unknown priority ${token} in scope selector`)
      }
      token = tokenizer.next()
    }

    const matcher = parseConjunction()
    results.push({ matcher, priority })
    if (token !== ',') break
    token = tokenizer.next()
  }

  return results

  function parseOperand(): ((scopeNames: any) => boolean) | null {
    if (token === '-') {
      token = tokenizer.next()
      const inner = parseOperand()
      return (scopeNames: any) => !!inner && !inner(scopeNames)
    }

    if (token === '(') {
      token = tokenizer.next()
      const group = (function parseGroup() {
        const options: Array<(scopeNames: any) => boolean> = []
        let next = parseConjunction()
        while (next && (options.push(next), token === '|' || token === ',')) {
          do token = tokenizer.next()
          while (token === '|' || token === ',')
          next = parseConjunction()
        }
        return (scopeNames: any) => options.some((fn) => fn(scopeNames))
      })()
      if (token === ')') token = tokenizer.next()
      return group
    }

    if (token && isSelector(token)) {
      const parts: string[] = []
      do {
        parts.push(token)
        token = tokenizer.next()
      } while (token && isSelector(token))

      return (scopeSegments: any) => matchesName(parts, scopeSegments)
    }

    return null
  }

  function parseConjunction(): ((scopeNames: any) => boolean) | null {
    const operands: Array<(scopeNames: any) => boolean> = []
    let op = parseOperand()
    while (op) {
      operands.push(op)
      op = parseOperand()
    }
    if (operands.length === 0) return null
    return (scopeNames: any) => operands.every((fn) => fn(scopeNames))
  }
}

const HAS_BACK_REFERENCES = /\\(\d+)/
const BACK_REFERENCING_END = /\\(\d+)/g

export const endRuleId = -1
export const whileRuleId = -2

export function ruleIdFromNumber(value: number) {
  return value
}
export function ruleIdToNumber(value: number) {
  return value
}

export class Rule {
  id: number
  $location: TextMateLocation | null
  #name: string | null
  #nameIsCapturing: boolean
  #contentName: string | null
  #contentNameIsCapturing: boolean

  constructor(
    $location: TextMateLocation | null,
    id: number,
    name: string | null,
    contentName: string | null
  ) {
    this.$location = $location
    this.id = id
    this.#name = name || null
    this.#nameIsCapturing = RegexSource.hasCaptures(this.#name)
    this.#contentName = contentName || null
    this.#contentNameIsCapturing = RegexSource.hasCaptures(this.#contentName)
  }

  get debugName() {
    const loc = this.$location
      ? `${basename(this.$location.filename)}:${this.$location.line}`
      : 'unknown'
    return `${this.constructor.name}#${this.id} @ ${loc}`
  }

  getName(sourceText: string | null, captures: any[]) {
    if (
      !this.#nameIsCapturing ||
      this.#name === null ||
      sourceText === null ||
      captures === null
    ) {
      return this.#name
    }
    return RegexSource.replaceCaptures(this.#name, sourceText, captures)
  }

  getContentName(sourceText: string, captures: any[]) {
    if (this.#contentNameIsCapturing && this.#contentName !== null) {
      return RegexSource.replaceCaptures(
        this.#contentName,
        sourceText,
        captures
      )
    }
    return this.#contentName
  }

  collectPatterns(_grammar: any, _out: any): void {
    throw new Error('Not supported!')
  }
  compile(_grammar: any, _end: any): any {
    throw new Error('Not supported!')
  }
  compileAG(_grammar: any, _end: any, _isFirstLine: any, _atAnchor: any): any {
    throw new Error('Not supported!')
  }
}

export class CaptureRule extends Rule {
  retokenizeCapturedWithRuleId: number
  constructor(
    location: TextMateLocation | null,
    id: number,
    name: string | null,
    contentName: string | null,
    retokenizeCapturedWithRuleId: number
  ) {
    super(location, id, name, contentName)
    this.retokenizeCapturedWithRuleId = retokenizeCapturedWithRuleId
  }
  dispose() {}
}

class CachedRegExpSourceList {
  #list: RegExpSourceList | null = null

  dispose() {
    if (this.#list) {
      this.#list.dispose()
      this.#list = null
    }
  }

  get(build: (list: RegExpSourceList) => void): RegExpSourceList {
    if (!this.#list) {
      this.#list = new RegExpSourceList()
      build(this.#list)
    }
    return this.#list
  }
}

export class MatchRule extends Rule {
  #match: RegExpSource
  captures: any
  #cachedCompiledPatterns = new CachedRegExpSourceList()

  constructor(
    location: TextMateLocation | null,
    id: number,
    name: string | null,
    match: string,
    captures: any
  ) {
    super(location, id, name, null)
    this.#match = new RegExpSource(match, this.id)
    this.captures = captures
  }

  dispose() {
    this.#cachedCompiledPatterns.dispose()
  }

  get debugMatchRegExp() {
    return `${this.#match.source}`
  }

  collectPatterns(_grammar: any, out: any) {
    out.push(this.#match)
  }

  compile(grammar: any, _end: any) {
    return this.#getCachedCompiledPatterns(grammar).compile(grammar)
  }

  compileAG(grammar: any, _end: any, isFirstLine: any, atAnchor: any) {
    return this.#getCachedCompiledPatterns(grammar).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  #getCachedCompiledPatterns(grammar: any) {
    return this.#cachedCompiledPatterns.get((list) => {
      this.collectPatterns(grammar, list)
    })
  }
}

export class IncludeOnlyRule extends Rule {
  patterns: any[]
  hasMissingPatterns: boolean
  #cachedCompiledPatterns = new CachedRegExpSourceList()

  constructor(
    location: TextMateLocation | null,
    id: number,
    name: string | null,
    contentName: string | null,
    patterns: any
  ) {
    super(location, id, name, contentName)
    this.patterns = patterns.patterns
    this.hasMissingPatterns = patterns.hasMissingPatterns
  }

  dispose() {
    this.#cachedCompiledPatterns.dispose()
  }

  collectPatterns(grammar: any, out: any) {
    for (const ruleId of this.patterns)
      grammar.getRule(ruleId).collectPatterns(grammar, out)
  }

  compile(grammar: any, _end: any) {
    return this.#getCachedCompiledPatterns(grammar).compile(grammar)
  }

  compileAG(grammar: any, _end: any, isFirstLine: any, atAnchor: any) {
    return this.#getCachedCompiledPatterns(grammar).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  #getCachedCompiledPatterns(grammar: any) {
    return this.#cachedCompiledPatterns.get((list) => {
      this.collectPatterns(grammar, list)
    })
  }
}

export class BeginEndRule extends Rule {
  #begin: RegExpSource
  beginCaptures: any
  #end: RegExpSource
  endHasBackReferences: boolean
  endCaptures: any
  applyEndPatternLast: boolean
  patterns: any[]
  hasMissingPatterns: boolean
  #cachedCompiledPatterns = new CachedRegExpSourceList()

  constructor(
    location: TextMateLocation | null,
    id: number,
    name: string | null,
    contentName: string | null,
    begin: string,
    beginCaptures: any,
    end: string | undefined,
    endCaptures: any,
    applyEndPatternLast: boolean | undefined,
    patterns: any
  ) {
    super(location, id, name, contentName)
    this.#begin = new RegExpSource(begin, this.id)
    this.beginCaptures = beginCaptures
    this.#end = new RegExpSource(end || '', -1)
    this.endHasBackReferences = this.#end.hasBackReferences
    this.endCaptures = endCaptures
    this.applyEndPatternLast = applyEndPatternLast || false
    this.patterns = patterns.patterns
    this.hasMissingPatterns = patterns.hasMissingPatterns
  }

  dispose() {
    this.#cachedCompiledPatterns.dispose()
  }

  get debugBeginRegExp() {
    return `${this.#begin.source}`
  }

  get debugEndRegExp() {
    return `${this.#end.source}`
  }

  getEndWithResolvedBackReferences(sourceText: string, captures: any[]) {
    return this.#end.resolveBackReferences(sourceText, captures)
  }

  collectPatterns(_grammar: any, out: any) {
    out.push(this.#begin)
  }

  compile(grammar: any, end: any) {
    return this.#getCachedCompiledPatterns(grammar, end).compile(grammar)
  }

  compileAG(grammar: any, end: any, isFirstLine: any, atAnchor: any) {
    return this.#getCachedCompiledPatterns(grammar, end).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  #getCachedCompiledPatterns(grammar: any, _end: any) {
    const compiled = this.#cachedCompiledPatterns.get((list) => {
      for (const patternRuleId of this.patterns) {
        grammar.getRule(patternRuleId).collectPatterns(grammar, list)
      }
      if (this.applyEndPatternLast) {
        list.push(this.#end.hasBackReferences ? this.#end.clone() : this.#end)
      } else {
        list.unshift(
          this.#end.hasBackReferences ? this.#end.clone() : this.#end
        )
      }
    })

    if (this.#end.hasBackReferences) {
      if (this.applyEndPatternLast) {
        compiled.setSource(compiled.length() - 1, _end)
      } else {
        compiled.setSource(0, _end)
      }
    }

    return compiled
  }
}

export class BeginWhileRule extends Rule {
  #begin: RegExpSource
  beginCaptures: any
  whileCaptures: any
  #while: RegExpSource
  whileHasBackReferences: boolean
  patterns: any[]
  hasMissingPatterns: boolean
  #cachedCompiledPatterns = new CachedRegExpSourceList()
  #cachedCompiledWhilePatterns = new CachedRegExpSourceList()

  constructor(
    location: TextMateLocation | null,
    id: number,
    name: string | null,
    contentName: string | null,
    begin: string,
    beginCaptures: any,
    whilePattern: string,
    whileCaptures: any,
    patterns: any
  ) {
    super(location, id, name, contentName)
    this.#begin = new RegExpSource(begin, this.id)
    this.beginCaptures = beginCaptures
    this.whileCaptures = whileCaptures
    this.#while = new RegExpSource(whilePattern, whileRuleId)
    this.whileHasBackReferences = this.#while.hasBackReferences
    this.patterns = patterns.patterns
    this.hasMissingPatterns = patterns.hasMissingPatterns
  }

  dispose() {
    this.#cachedCompiledPatterns.dispose()
    this.#cachedCompiledWhilePatterns.dispose()
  }

  get debugBeginRegExp() {
    return `${this.#begin.source}`
  }

  get debugWhileRegExp() {
    return `${this.#while.source}`
  }

  getWhileWithResolvedBackReferences(sourceText: string, captures: any[]) {
    return this.#while.resolveBackReferences(sourceText, captures)
  }

  collectPatterns(_grammar: any, out: any) {
    out.push(this.#begin)
  }

  compile(grammar: any, _end: any) {
    return this.#getCachedCompiledPatterns(grammar).compile(grammar)
  }

  compileAG(grammar: any, _end: any, isFirstLine: any, atAnchor: any) {
    return this.#getCachedCompiledPatterns(grammar).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  #getCachedCompiledPatterns(grammar: any) {
    return this.#cachedCompiledPatterns.get((list) => {
      for (const patternRuleId of this.patterns) {
        grammar.getRule(patternRuleId).collectPatterns(grammar, list)
      }
    })
  }

  compileWhile(grammar: any, end: any) {
    return this.#getCachedCompiledWhilePatterns(grammar, end).compile(grammar)
  }

  compileWhileAG(grammar: any, end: any, isFirstLine: any, atAnchor: any) {
    return this.#getCachedCompiledWhilePatterns(grammar, end).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  #getCachedCompiledWhilePatterns(_grammar: any, end: any) {
    const compiled = this.#cachedCompiledWhilePatterns.get((list) => {
      list.push(
        this.#while.hasBackReferences ? this.#while.clone() : this.#while
      )
    })
    if (this.#while.hasBackReferences) {
      compiled.setSource(0, end || '')
    }
    return compiled
  }
}

export type TextMateLocation = {
  filename: string
  line: number
  char?: number
}

export type RawRepository = Record<string, RawRule>

export type RawCaptures = Record<string, RawCaptureRule | null> & {
  $textmateLocation?: TextMateLocation
}

export type RawCaptureRule = RawRule

export interface RawRule {
  $textmateLocation?: TextMateLocation
  name?: string | null
  contentName?: string | null
  match?: string
  begin?: string
  end?: string
  while?: string
  applyEndPatternLast?: boolean
  captures?: RawCaptures
  beginCaptures?: RawCaptures
  endCaptures?: RawCaptures
  whileCaptures?: RawCaptures
  patterns?: RawRule[]
  repository?: RawRepository
  include?: string
}

export class RuleFactory {
  // Raw rules are shared objects across grammars (e.g. when one grammar includes another).
  // Storing a numeric `id` on the raw rule object causes cross-grammar corruption because
  // rule IDs are per-Grammar-instance. Keep rule IDs in a per-Grammar WeakMap instead.
  private static _rawRuleIdMaps = new WeakMap<
    Grammar,
    WeakMap<RawRule, number>
  >()

  private static _getRawRuleIdMap(grammar: Grammar): WeakMap<RawRule, number> {
    let map = RuleFactory._rawRuleIdMaps.get(grammar)
    if (!map) {
      map = new WeakMap<RawRule, number>()
      RuleFactory._rawRuleIdMaps.set(grammar, map)
    }
    return map
  }

  static createCaptureRule(
    grammar: Grammar,
    location: TextMateLocation | null,
    name: string | null,
    contentName: string | null,
    retokenizeRuleId: number
  ) {
    return grammar.registerRule(
      (ruleId: number) =>
        new CaptureRule(location, ruleId, name, contentName, retokenizeRuleId)
    )
  }

  static getCompiledRuleId(
    rawRule: RawRule,
    grammar: Grammar,
    repository: RawRepository
  ) {
    const rawRuleIdMap = RuleFactory._getRawRuleIdMap(grammar)
    const existingId = rawRuleIdMap.get(rawRule)
    if (!existingId) {
      const id = grammar.registerRule((newId: number) => {
        rawRuleIdMap.set(rawRule, newId)
        try {
          if (rawRule.match) {
            return new MatchRule(
              rawRule.$textmateLocation ?? null,
              newId,
              rawRule.name ?? null,
              rawRule.match,
              RuleFactory.compileCaptures(rawRule.captures, grammar, repository)
            )
          }

          if (typeof rawRule.begin === 'undefined') {
            if (rawRule.repository)
              repository = mergeObjects({}, repository, rawRule.repository)
            let patterns = rawRule.patterns
            if (typeof patterns === 'undefined' && rawRule.include)
              patterns = [{ include: rawRule.include }]
            return new IncludeOnlyRule(
              rawRule.$textmateLocation ?? null,
              newId,
              rawRule.name ?? null,
              rawRule.contentName ?? null,
              RuleFactory.compilePatterns(patterns, grammar, repository)
            )
          }

          if (rawRule.while) {
            return new BeginWhileRule(
              rawRule.$textmateLocation ?? null,
              newId,
              rawRule.name ?? null,
              rawRule.contentName ?? null,
              rawRule.begin,
              RuleFactory.compileCaptures(
                rawRule.beginCaptures || rawRule.captures,
                grammar,
                repository
              ),
              rawRule.while,
              RuleFactory.compileCaptures(
                rawRule.whileCaptures || rawRule.captures,
                grammar,
                repository
              ),
              RuleFactory.compilePatterns(rawRule.patterns, grammar, repository)
            )
          }

          return new BeginEndRule(
            rawRule.$textmateLocation ?? null,
            newId,
            rawRule.name ?? null,
            rawRule.contentName ?? null,
            rawRule.begin,
            RuleFactory.compileCaptures(
              rawRule.beginCaptures || rawRule.captures,
              grammar,
              repository
            ),
            rawRule.end,
            RuleFactory.compileCaptures(
              rawRule.endCaptures || rawRule.captures,
              grammar,
              repository
            ),
            rawRule.applyEndPatternLast,
            RuleFactory.compilePatterns(rawRule.patterns, grammar, repository)
          )
        } catch (error) {
          // Avoid leaving a dangling id mapping when rule construction fails.
          rawRuleIdMap.delete(rawRule)
          throw error
        }
      })
      return id
    }
    return existingId
  }

  static compileCaptures(
    captures: RawCaptures | undefined,
    grammar: Grammar,
    repository: RawRepository
  ): Array<number | null> {
    const out: Array<number | null> = []
    if (captures) {
      let maxCaptureId = 0
      for (const key in captures) {
        if (key === '$textmateLocation') continue
        const number = parseInt(key, 10)
        if (number > maxCaptureId) maxCaptureId = number
      }
      for (let index = 0; index <= maxCaptureId; index++) out[index] = null

      for (const captureIdString in captures) {
        if (captureIdString === '$textmateLocation') continue
        const captureId = parseInt(captureIdString, 10)
        const captureRule = captures[captureIdString]
        if (!captureRule) continue

        let retokenizeRuleId = 0
        if (captureRule.patterns) {
          retokenizeRuleId = RuleFactory.getCompiledRuleId(
            captureRule,
            grammar,
            repository
          )
        }

        out[captureId] = RuleFactory.createCaptureRule(
          grammar,
          captureRule.$textmateLocation ?? null,
          captureRule.name ?? null,
          captureRule.contentName ?? null,
          retokenizeRuleId
        )
      }
    }
    return out
  }

  private static resolveIncludeRuleId(
    includeRef: IncludeReference,
    include: string,
    grammar: Grammar,
    repository: RawRepository
  ): number {
    switch (includeRef.kind) {
      case 0:
      case 1:
        return RuleFactory.getCompiledRuleId(
          repository[include],
          grammar,
          repository
        )
      case 2: {
        const target = repository[includeRef.ruleName]
        if (!target) return -1
        return RuleFactory.getCompiledRuleId(target, grammar, repository)
      }
      case 3:
      case 4: {
        const scopeName = includeRef.scopeName
        const ruleName = includeRef.kind === 4 ? includeRef.ruleName : null
        const external = grammar.getExternalGrammar(scopeName)
        if (!external) return -1
        if (ruleName) {
          const repoRule = external.repository[ruleName]
          if (!repoRule) return -1
          return RuleFactory.getCompiledRuleId(
            repoRule,
            grammar,
            external.repository
          )
        }
        return RuleFactory.getCompiledRuleId(
          external.repository['$self'],
          grammar,
          external.repository
        )
      }
      default:
        return -1
    }
  }

  static compilePatterns(
    patterns: RawRule[] | undefined,
    grammar: Grammar,
    repository: RawRepository
  ) {
    const compiled: number[] = []
    if (patterns) {
      for (
        let index = 0, patternsLength = patterns.length;
        index < patternsLength;
        index++
      ) {
        const pat = patterns[index]
        let ruleId = -1

        if (pat.include) {
          const includeRef = parseInclude(pat.include)
          ruleId = RuleFactory.resolveIncludeRuleId(
            includeRef,
            pat.include,
            grammar,
            repository
          )
        } else {
          ruleId = RuleFactory.getCompiledRuleId(pat, grammar, repository)
        }

        if (ruleId !== -1) {
          const rule = grammar.getRuleIfExists(ruleId)

          // Only check for optimization if the rule is already fully registered.
          // If !rule, it means it is currently being compiled (recursion).
          // We MUST add the ID, otherwise the recursion chain is broken.
          if (
            rule &&
            (rule instanceof IncludeOnlyRule ||
              rule instanceof BeginEndRule ||
              rule instanceof BeginWhileRule) &&
            rule.hasMissingPatterns &&
            rule.patterns.length === 0
          )
            continue

          compiled.push(ruleId)
        }
      }
    }

    return {
      patterns: compiled,
      hasMissingPatterns: (patterns ? patterns.length : 0) !== compiled.length,
    }
  }
}

export class RegExpSource {
  hasAnchor: boolean
  source: string
  ruleId: number
  hasBackReferences: boolean
  #anchorCache:
    | { A0_G0: string; A0_G1: string; A1_G0: string; A1_G1: string }
    | null
    | undefined = undefined

  constructor(source: string, ruleId: number) {
    if (source) {
      const length = source.length
      let start = 0
      const parts: string[] = []
      let hasAnchor = false

      for (let index = 0; index < length; index++) {
        if (source.charCodeAt(index) === 92 && index + 1 < length) {
          const next = source.charCodeAt(index + 1)
          if (next === 122) {
            parts.push(source.substring(start, index))
            parts.push('$(?!\\n)(?<!\\n)')
            start = index + 2
          } else if (next === 65 || next === 71) {
            hasAnchor = true
          }
          index++
        }
      }

      this.hasAnchor = hasAnchor
      if (start === 0) this.source = source
      else {
        parts.push(source.substring(start, length))
        this.source = parts.join('')
      }
    } else {
      this.hasAnchor = false
      this.source = source
    }

    this.ruleId = ruleId
    this.hasBackReferences = HAS_BACK_REFERENCES.test(this.source)
  }

  clone() {
    return new RegExpSource(this.source, this.ruleId)
  }

  setSource(nextSource: string) {
    if (this.source !== nextSource) {
      this.source = nextSource
      if (this.hasAnchor) this.#anchorCache = undefined
    }
  }

  resolveBackReferences(lineText: string, captureIndices: any[]) {
    BACK_REFERENCING_END.lastIndex = 0
    return this.source.replace(BACK_REFERENCING_END, (_m, n) => {
      const idx = parseInt(n, 10)
      const c = captureIndices[idx]
      return c ? escapeRegExpCharacters(lineText.substring(c.start, c.end)) : ''
    })
  }

  #getAnchorCache() {
    if (this.#anchorCache === undefined) {
      this.#anchorCache = this.hasAnchor ? this.#buildAnchorCache() : null
    }
    return this.#anchorCache
  }

  #buildAnchorCache() {
    // keep the backslash, and replace the next character to either preserve
    // the anchor ('A'/'G') or make it fail ('\uFFFF').
    const A0_G0: string[] = []
    const A0_G1: string[] = []
    const A1_G0: string[] = []
    const A1_G1: string[] = []

    const source = this.source
    for (let position = 0; position < source.length; position++) {
      const char = source.charAt(position)
      A0_G0[position] = char
      A0_G1[position] = char
      A1_G0[position] = char
      A1_G1[position] = char

      if (char === '\\' && position + 1 < source.length) {
        const nextChar = source.charAt(position + 1)
        if (nextChar === 'A') {
          // A0 => fail \A, A1 => allow \A
          A0_G0[position + 1] = '\uFFFF'
          A0_G1[position + 1] = '\uFFFF'
          A1_G0[position + 1] = 'A'
          A1_G1[position + 1] = 'A'
        } else if (nextChar === 'G') {
          // G0 => fail \G, G1 => allow \G
          A0_G0[position + 1] = '\uFFFF'
          A0_G1[position + 1] = 'G'
          A1_G0[position + 1] = '\uFFFF'
          A1_G1[position + 1] = 'G'
        } else {
          // Keep the backslash, and replace the next character to either preserve
          // the anchor ('A'/'G') or make it fail ('\uFFFF').
          A0_G0[position + 1] = nextChar
          A0_G1[position + 1] = nextChar
          A1_G0[position + 1] = nextChar
          A1_G1[position + 1] = nextChar
        }
        position++
      }
    }

    return {
      A0_G0: A0_G0.join(''),
      A0_G1: A0_G1.join(''),
      A1_G0: A1_G0.join(''),
      A1_G1: A1_G1.join(''),
    }
  }

  resolveAnchors(isFirstLine: boolean, atAnchor: boolean) {
    if (this.hasAnchor) {
      const cache = this.#getAnchorCache()
      if (cache) {
        if (isFirstLine) return atAnchor ? cache.A1_G1 : cache.A1_G0
        return atAnchor ? cache.A0_G1 : cache.A0_G0
      }
    }
    return this.source
  }
}

export class RegExpSourceList {
  #items: RegExpSource[] = []
  #hasAnchors = false
  #cached: CompiledRule | null = null
  #anchorCache: {
    A0_G0: CompiledRule | null
    A0_G1: CompiledRule | null
    A1_G0: CompiledRule | null
    A1_G1: CompiledRule | null
  } = {
    A0_G0: null,
    A0_G1: null,
    A1_G0: null,
    A1_G1: null,
  }

  dispose() {
    this.#disposeCaches()
  }

  #disposeCaches() {
    if (this.#cached) this.#cached = null
    for (const key of ['A0_G0', 'A0_G1', 'A1_G0', 'A1_G1'] as const) {
      if (this.#anchorCache[key]) this.#anchorCache[key] = null
    }
  }

  push(value: RegExpSource) {
    this.#items.push(value)
    this.#hasAnchors = this.#hasAnchors || value.hasAnchor
  }

  unshift(value: RegExpSource) {
    this.#items.unshift(value)
    this.#hasAnchors = this.#hasAnchors || value.hasAnchor
  }

  length() {
    return this.#items.length
  }

  setSource(index: number, source: string) {
    if (this.#items[index].source !== source) {
      this.#disposeCaches()
      this.#items[index].setSource(source)
    }
  }

  compile(grammar: any) {
    if (!this.#cached) {
      const items = this.#items
      const length = items.length
      const sources = new Array<string>(length)
      const rules = new Array<number>(length)
      for (let index = 0; index < length; index++) {
        sources[index] = items[index].source
        rules[index] = items[index].ruleId
      }
      this.#cached = new CompiledRule(grammar, sources, rules)
    }
    return this.#cached
  }

  compileAG(grammar: any, isFirstLine: boolean, atAnchor: boolean) {
    if (this.#hasAnchors) {
      const key = isFirstLine
        ? atAnchor
          ? 'A1_G1'
          : 'A1_G0'
        : atAnchor
          ? 'A0_G1'
          : 'A0_G0'

      if (!this.#anchorCache[key])
        this.#anchorCache[key] = this.#resolveAnchors(
          grammar,
          isFirstLine,
          atAnchor
        )
      return this.#anchorCache[key]!
    }
    return this.compile(grammar)
  }

  #resolveAnchors(grammar: any, isFirstLine: boolean, atAnchor: boolean) {
    const items = this.#items
    const length = items.length
    const sources = new Array<string>(length)
    const rules = new Array<number>(length)
    for (let index = 0; index < length; index++) {
      sources[index] = items[index].resolveAnchors(isFirstLine, atAnchor)
      rules[index] = items[index].ruleId
    }
    return new CompiledRule(grammar, sources, rules)
  }
}

function getCaptureStart(
  captureIndices: Int32Array | Array<{ start: number; end: number }>,
  index: number
): number {
  if (captureIndices instanceof Int32Array) {
    return captureIndices[index * 2]
  }
  return (
    (captureIndices as Array<{ start: number; end: number }>)[index]?.start ??
    -1
  )
}

function getCaptureEnd(
  captureIndices: Int32Array | Array<{ start: number; end: number }>,
  index: number
): number {
  if (captureIndices instanceof Int32Array) {
    return captureIndices[index * 2 + 1]
  }
  return (
    (captureIndices as Array<{ start: number; end: number }>)[index]?.end ?? -1
  )
}

function getCaptureCount(
  captureIndices: Int32Array | Array<{ start: number; end: number }>
): number {
  if (captureIndices instanceof Int32Array) {
    return captureIndices.length / 2
  }
  return captureIndices.length
}

export class CompiledRule {
  #regexes: RegExp[]
  #captureBuffer = new Int32Array(64)
  #matchResult = {
    ruleId: 0,
    captureIndices: this.#captureBuffer,
    captureCount: 0,
  }
  public regExps: string[]
  public rules: number[]

  constructor(_grammar: any, regExpSources: string[], rules: number[]) {
    this.regExps = regExpSources
    this.rules = rules

    const length = regExpSources.length
    this.#regexes = new Array<RegExp>(length)
    for (let index = 0; index < length; index++) {
      const source = regExpSources[index]
      try {
        this.#regexes[index] = toRegExp(source, {
          global: true,
          hasIndices: true,
          lazyCompileLength: 3000,
          rules: {
            allowOrphanBackrefs: true,
            asciiWordBoundaries: true,
            captureGroup: true,
            recursionLimit: 5,
            singleline: true,
          },
          target: 'auto',
        })
      } catch {
        this.#regexes[index] = new RegExp('(?!)', 'g') // Never matches
      }
    }
  }

  toString() {
    const lines: string[] = []
    for (let index = 0; index < this.rules.length; index++) {
      lines.push('   - ' + this.rules[index] + ': ' + this.regExps[index])
    }
    return lines.join('\n')
  }

  findNextMatchSync(text: string, startPosition: number, _options?: number) {
    if (startPosition < 0) startPosition = 0

    let bestMatch: RegExpExecArray | null = null
    let bestPatternIndex = -1

    for (let index = 0; index < this.#regexes.length; index++) {
      const regex = this.#regexes[index]
      regex.lastIndex = startPosition
      const match = regex.exec(text)

      if (match && (bestMatch === null || match.index < bestMatch.index)) {
        bestMatch = match
        bestPatternIndex = index
        if (match.index === startPosition) break
      }
    }

    if (!bestMatch) return null

    const indices = bestMatch.indices
    const captureCount = indices ? indices.length : bestMatch.length

    if (captureCount * 2 > this.#captureBuffer.length) {
      this.#captureBuffer = new Int32Array(captureCount * 2)
      this.#matchResult.captureIndices = this.#captureBuffer
    }

    if (indices) {
      // Capture indices are available, copy them to the buffer.
      for (let index = 0; index < captureCount; index++) {
        const pair = indices[index]
        const offset = index * 2
        if (pair) {
          this.#captureBuffer[offset] = pair[0]
          this.#captureBuffer[offset + 1] = pair[1]
        } else {
          this.#captureBuffer[offset] = -1
          this.#captureBuffer[offset + 1] = -1
        }
      }
    } else {
      // No capture indices, use the full match index and text.
      const fullMatchIndex = bestMatch.index
      const fullMatchText = bestMatch[0]

      this.#captureBuffer[0] = fullMatchIndex
      this.#captureBuffer[1] = fullMatchIndex + fullMatchText.length

      let currentOffset = 0
      for (let index = 1; index < bestMatch.length; index++) {
        const groupText = bestMatch[index]
        const bufferOffset = index * 2

        if (groupText == null) {
          this.#captureBuffer[bufferOffset] = -1
          this.#captureBuffer[bufferOffset + 1] = -1
        } else {
          const groupIndex = fullMatchText.indexOf(groupText, currentOffset)
          if (groupIndex >= 0) {
            const start = fullMatchIndex + groupIndex
            this.#captureBuffer[bufferOffset] = start
            this.#captureBuffer[bufferOffset + 1] = start + groupText.length
            currentOffset = groupIndex + groupText.length
          } else {
            this.#captureBuffer[bufferOffset] = -1
            this.#captureBuffer[bufferOffset + 1] = -1
          }
        }
      }
    }

    this.#matchResult.ruleId = this.rules[bestPatternIndex]
    this.#matchResult.captureCount = captureCount
    return this.#matchResult
  }
}

export class TopLevelRuleReference {
  scopeName: string
  constructor(scopeName: string) {
    this.scopeName = scopeName
  }
  toKey() {
    return this.scopeName
  }
}

export class TopLevelRepositoryRuleReference {
  scopeName: string
  ruleName: string
  constructor(scopeName: string, ruleName: string) {
    this.scopeName = scopeName
    this.ruleName = ruleName
  }
  toKey() {
    return `${this.scopeName}#${this.ruleName}`
  }
}

export class ExternalReferenceCollector {
  #references: any[] = []
  #seenReferenceKeys = new Set<string>()
  visitedRule = new Set<any>()
  get references() {
    return this.#references
  }
  add(ref: any) {
    const key = ref.toKey()
    if (!this.#seenReferenceKeys.has(key)) {
      this.#seenReferenceKeys.add(key)
      this.#references.push(ref)
    }
  }
}

export class ScopeDependencyProcessor {
  seenFullScopeRequests = new Set<string>()
  seenPartialScopeRequests = new Set<string>()
  queue: any[]

  repo: SyncRegistry
  initialScopeName: string

  constructor(repo: SyncRegistry, initialScopeName: string) {
    this.repo = repo
    this.initialScopeName = initialScopeName
    this.seenFullScopeRequests.add(this.initialScopeName)
    this.queue = [new TopLevelRuleReference(this.initialScopeName)]
  }

  processQueue() {
    const current = this.queue
    this.queue = []
    const collector = new ExternalReferenceCollector()

    for (let index = 0, length = current.length; index < length; index++) {
      processDependency(
        current[index],
        this.initialScopeName,
        this.repo,
        collector
      )
    }

    const references = collector.references
    for (let index = 0, length = references.length; index < length; index++) {
      const ref = references[index]
      if (ref instanceof TopLevelRuleReference) {
        if (this.seenFullScopeRequests.has(ref.scopeName)) continue
        this.seenFullScopeRequests.add(ref.scopeName)
        this.queue.push(ref)
      } else {
        if (this.seenFullScopeRequests.has(ref.scopeName)) continue
        if (this.seenPartialScopeRequests.has(ref.toKey())) continue
        this.seenPartialScopeRequests.add(ref.toKey())
        this.queue.push(ref)
      }
    }
  }
}

function processDependency(
  ref: any,
  initialScopeName: string,
  registry: SyncRegistry,
  collector: ExternalReferenceCollector
) {
  const selfGrammar = registry.lookup(ref.scopeName)
  if (!selfGrammar) {
    if (ref.scopeName === initialScopeName)
      throw new Error(`No grammar provided for <${initialScopeName}>`)
    return
  }

  const baseGrammar = registry.lookup(initialScopeName)
  if (ref instanceof TopLevelRuleReference) {
    processSelf({ baseGrammar, selfGrammar }, collector)
  } else {
    processRepositoryRule(
      ref.ruleName,
      { baseGrammar, selfGrammar, repository: selfGrammar.repository },
      collector
    )
  }

  const injections = registry.injections(ref.scopeName)
  if (injections) {
    for (const s of injections) collector.add(new TopLevelRuleReference(s))
  }
}

function processRepositoryRule(
  ruleName: string,
  ctx: any,
  collector: ExternalReferenceCollector
) {
  if (ctx.repository && ctx.repository[ruleName]) {
    processRulePatterns([ctx.repository[ruleName]], ctx, collector)
  }
}

function processSelf(ctx: any, collector: ExternalReferenceCollector) {
  if (ctx.selfGrammar.patterns && Array.isArray(ctx.selfGrammar.patterns)) {
    processRulePatterns(
      ctx.selfGrammar.patterns,
      {
        baseGrammar: ctx.baseGrammar,
        selfGrammar: ctx.selfGrammar,
        repository: ctx.selfGrammar.repository,
      },
      collector
    )
  }
  if (ctx.selfGrammar.injections) {
    const injections = ctx.selfGrammar.injections
    const injectionPatterns: any[] = []
    for (const key in injections) {
      if (key !== '$textmateLocation') injectionPatterns.push(injections[key])
    }
    processRulePatterns(
      injectionPatterns,
      {
        baseGrammar: ctx.baseGrammar,
        selfGrammar: ctx.selfGrammar,
        repository: ctx.selfGrammar.repository,
      },
      collector
    )
  }
}

function processRulePatterns(
  patterns: any[],
  ctx: any,
  collector: ExternalReferenceCollector
) {
  for (let index = 0, length = patterns.length; index < length; index++) {
    const rule = patterns[index]
    if (collector.visitedRule.has(rule)) continue
    collector.visitedRule.add(rule)

    const mergedRepo = rule.repository
      ? mergeObjects({}, ctx.repository, rule.repository)
      : ctx.repository
    const nextCtx = {
      baseGrammar: ctx.baseGrammar,
      selfGrammar: ctx.selfGrammar,
      repository: mergedRepo,
    }

    // Captures can contain nested `patterns` (retokenizeCapturedWithRuleId).
    // These nested patterns may reference external grammars (e.g. fenced code blocks
    // in markdown/mdx). We must traverse them, otherwise dependencies won't be loaded.
    const captureSets = [
      rule.captures,
      rule.beginCaptures,
      rule.endCaptures,
      rule.whileCaptures,
    ]
    for (const captures of captureSets) {
      if (!captures) continue
      for (const key in captures) {
        if (key === '$textmateLocation') continue
        const captureRule = captures[key]
        if (captureRule && Array.isArray(captureRule.patterns)) {
          processRulePatterns([captureRule], nextCtx, collector)
        }
      }
    }

    if (Array.isArray(rule.patterns)) {
      processRulePatterns(rule.patterns, nextCtx, collector)
    }

    const include = rule.include
    if (!include) continue

    const parsed = parseInclude(include)
    switch (parsed.kind) {
      case 0:
        processSelf(
          {
            baseGrammar: ctx.baseGrammar,
            selfGrammar: ctx.baseGrammar,
            repository: ctx.repository,
          },
          collector
        )
        break
      case 1:
        processSelf(ctx, collector)
        break
      case 2:
        processRepositoryRule(parsed.ruleName, nextCtx, collector)
        break
      case 3:
      case 4: {
        const resolved =
          parsed.scopeName === ctx.selfGrammar.scopeName
            ? ctx.selfGrammar
            : parsed.scopeName === ctx.baseGrammar.scopeName
              ? ctx.baseGrammar
              : undefined

        if (resolved) {
          const resolvedCtx = {
            baseGrammar: ctx.baseGrammar,
            selfGrammar: resolved,
            repository: mergedRepo,
          }
          if (parsed.kind === 4)
            processRepositoryRule(parsed.ruleName, resolvedCtx, collector)
          else processSelf(resolvedCtx, collector)
        } else {
          if (parsed.kind === 4)
            collector.add(
              new TopLevelRepositoryRuleReference(
                parsed.scopeName,
                parsed.ruleName
              )
            )
          else collector.add(new TopLevelRuleReference(parsed.scopeName))
        }
        break
      }
    }
  }
}

export class BaseReference {
  kind = 0 as const
}
export class SelfReference {
  kind = 1 as const
}
export class RelativeReference {
  kind = 2 as const
  ruleName: string
  constructor(ruleName: string) {
    this.ruleName = ruleName
  }
}
export class TopLevelReference {
  kind = 3 as const
  scopeName: string
  constructor(scopeName: string) {
    this.scopeName = scopeName
  }
}
export class TopLevelRepositoryReference {
  kind = 4 as const
  scopeName: string
  ruleName: string
  constructor(scopeName: string, ruleName: string) {
    this.scopeName = scopeName
    this.ruleName = ruleName
  }
}

export type IncludeReference =
  | BaseReference
  | SelfReference
  | RelativeReference
  | TopLevelReference
  | TopLevelRepositoryReference

export function parseInclude(include: string): IncludeReference {
  if (include === '$base') return new BaseReference()
  if (include === '$self') return new SelfReference()
  const hash = include.indexOf('#')
  if (hash === -1) return new TopLevelReference(include)
  if (hash === 0) return new RelativeReference(include.substring(1))
  const scopeName = include.substring(0, hash)
  const ruleName = include.substring(hash + 1)
  return new TopLevelRepositoryReference(scopeName, ruleName)
}

export class TokenizeStringResult {
  stack: StateStackImplementation
  stoppedEarly: boolean
  constructor(stack: StateStackImplementation, stoppedEarly: boolean) {
    this.stack = stack
    this.stoppedEarly = stoppedEarly
  }
}

// Match all identifiers in order within the scope stack
function nameMatcher(names: string[], scopeSegments: string[]): boolean {
  const namesLen = names.length
  const segmentsLen = scopeSegments.length
  if (segmentsLen < namesLen) return false

  let segmentIndex = 0
  for (let nameIndex = 0; nameIndex < namesLen; nameIndex++) {
    const name = names[nameIndex]
    let found = false
    while (segmentIndex < segmentsLen) {
      if (scopeMatches(scopeSegments[segmentIndex++], name)) {
        found = true
        break
      }
    }
    if (!found) return false
  }
  return true
}

function createGrammarInjection(
  injections: any[],
  selector: string,
  rawRule: any,
  grammar: Grammar,
  ctx: { repository: any }
) {
  const matchers = createMatchers(selector, nameMatcher)
  const ruleId = RuleFactory.getCompiledRuleId(rawRule, grammar, ctx.repository)
  for (let index = 0, length = matchers.length; index < length; index++) {
    const m = matchers[index]
    injections.push({
      debugSelector: selector,
      matcher: m.matcher,
      ruleId,
      grammar,
      priority: m.priority,
    })
  }
}

function tokenizeString(
  grammar: Grammar,
  lineText: string,
  isFirstLine: boolean,
  linePosition: number,
  stack: StateStackImplementation,
  lineTokens: LineTokens,
  lineFonts: LineFonts,
  checkWhileConditions: boolean,
  timeLimitMs: number
) {
  const produce = (state: StateStackImplementation, position: number) => {
    lineTokens.produce(state, position)
    lineFonts.produce(state, position)
  }

  const lineLength = lineText.length
  let done = false
  let anchorPosition = -1

  // Loop guard for "endless loop - case 3".
  // Track states we've seen at the current linePosition. If we revisit the exact same
  // (stack, anchorPosition) at the same position, we're in a cycle and must advance.
  let _loopGuardLinePosition = -1
  const _loopGuardSeen = grammar._loopGuardPool.seen
  _loopGuardSeen.clear()

  if (checkWhileConditions) {
    const res = (function applyWhileRules(
      grammar: Grammar,
      lineText: string,
      isFirstLine: boolean,
      linePosition: number,
      stack: StateStackImplementation,
      lineTokens: LineTokens,
      lineFonts: LineFonts
    ) {
      const produceFromStack = (
        state: StateStackImplementation,
        position: number
      ) => {
        lineTokens.produce(state, position)
        lineFonts.produce(state, position)
      }

      let anchorPosition = stack.beginRuleCapturedEOL
        ? 0
        : stack.getAnchorPosition()
      const whileRules = grammar._whileRulesPool
      whileRules.length = 0

      for (let s: StateStackImplementation | null = stack; s; s = s.pop()) {
        const rule = s.getRule(grammar)
        if (rule instanceof BeginWhileRule) whileRules.push({ rule, stack: s })
      }

      for (let entry = whileRules.pop(); entry; entry = whileRules.pop()) {
        // BeginWhileRule's `while` condition is a different regexp than its `begin`.
        // Use the while-compiled scanner here; otherwise we would always check the begin pattern
        // and incorrectly pop while-rules (breaking fenced code blocks, etc).
        const ruleScanner = entry.rule.compileWhileAG(
          grammar,
          entry.stack.endRule,
          isFirstLine,
          linePosition === anchorPosition
        )
        const findOptions = 0

        const match = ruleScanner.findNextMatchSync(
          lineText,
          linePosition,
          findOptions
        )
        if (!match) {
          stack = entry.stack.pop()!
          break
        }

        if (match.ruleId !== whileRuleId) {
          stack = entry.stack.pop()!
          break
        }

        if (match.captureIndices && match.captureCount > 0) {
          const captureStart = getCaptureStart(match.captureIndices, 0)
          const captureEnd = getCaptureEnd(match.captureIndices, 0)
          produceFromStack(entry.stack, captureStart)
          handleCaptures(
            grammar,
            lineText,
            isFirstLine,
            entry.stack,
            lineTokens,
            lineFonts,
            entry.rule.whileCaptures,
            match.captureIndices,
            match.captureCount
          )
          produceFromStack(entry.stack, captureEnd)

          anchorPosition = captureEnd
          if (captureEnd > linePosition) {
            linePosition = captureEnd
            isFirstLine = false
          }
        }
      }

      return { stack, linePosition, anchorPosition, isFirstLine }
    })(
      grammar,
      lineText,
      isFirstLine,
      linePosition,
      stack,
      lineTokens,
      lineFonts
    )

    stack = res.stack
    linePosition = res.linePosition
    isFirstLine = res.isFirstLine
    anchorPosition = res.anchorPosition
  }

  const startTime = performance.now()

  while (!done) {
    // --- endless loop (case 3) guard ---
    if (linePosition !== _loopGuardLinePosition) {
      _loopGuardSeen.clear()
      grammar._loopGuardPool.setPoolLen = 0
      _loopGuardLinePosition = linePosition
    }

    let _anchors = _loopGuardSeen.get(stack)
    if (!_anchors) {
      const pool = grammar._loopGuardPool
      if (pool.setPoolLen < pool.setPool.length) {
        _anchors = pool.setPool[pool.setPoolLen++]
        _anchors.clear()
      } else {
        _anchors = new Set<number>()
        pool.setPool.push(_anchors)
        pool.setPoolLen++
      }
      _loopGuardSeen.set(stack, _anchors)
    } else if (_anchors.has(anchorPosition)) {
      // We are cycling at the same position. Force progress by consuming 1 char.
      // This preserves normal \G behavior for valid grammars and only kicks in
      // when we’re genuinely stuck.
      if (linePosition < lineLength) {
        linePosition += 1
        anchorPosition = -1
        produce(stack, linePosition)
        continue
      }

      // End of line, finished scanning
      produce(stack, lineLength)
      done = true
      break
    }
    _anchors.add(anchorPosition)
    // --- end guard ---

    if (timeLimitMs !== 0 && performance.now() - startTime > timeLimitMs)
      return new TokenizeStringResult(stack, true)
    scanNext()
  }

  return new TokenizeStringResult(stack, false)

  function scanNext() {
    const match = (function matchRuleOrInjection(
      grammar: Grammar,
      lineText: string,
      isFirstLine: boolean,
      linePosition: number,
      stack: StateStackImplementation,
      anchorPosition: number
    ) {
      const ruleMatch = (function matchRule(
        grammar: Grammar,
        lineText: string,
        isFirstLine: boolean,
        linePosition: number,
        stack: StateStackImplementation,
        anchorPosition: number
      ) {
        const currentRule = stack.getRule(grammar)
        const [ruleScanner, findOptions] = prepareRuleSearch(
          currentRule,
          grammar,
          stack.endRule,
          isFirstLine,
          linePosition === anchorPosition
        )

        const match = ruleScanner.findNextMatchSync(
          lineText,
          linePosition,
          findOptions
        )

        return match
          ? {
              captureIndices: match.captureIndices,
              captureCount: match.captureCount,
              matchedRuleId: match.ruleId,
            }
          : null
      })(grammar, lineText, isFirstLine, linePosition, stack, anchorPosition)

      const injections = grammar.getInjections()
      if (injections.length === 0) return ruleMatch

      const injectionMatch = (function matchInjections(
        injections: any[],
        grammar: Grammar,
        lineText: string,
        isFirstLine: boolean,
        linePosition: number,
        stack: StateStackImplementation,
        anchorPosition: number
      ) {
        let bestRuleId: number | undefined
        let bestStart = Number.MAX_VALUE
        let bestCaptures: Int32Array | null = null
        let bestCaptureCount = 0
        let bestPriority = 0

        const scopeNames = stack.contentNameScopesList.getScopeNames()

        for (let index = 0; index < injections.length; index++) {
          const injection = injections[index]
          if (!injection.matcher(scopeNames)) continue
          const rule = grammar.getRule(injection.ruleId)
          const [ruleScanner, findOptions] = prepareRuleSearch(
            rule,
            grammar,
            null,
            isFirstLine,
            linePosition === anchorPosition
          )
          const match = ruleScanner.findNextMatchSync(
            lineText,
            linePosition,
            findOptions
          )
          if (!match) continue

          const start = getCaptureStart(match.captureIndices, 0)
          if (start > bestStart) continue
          if (start === bestStart && injection.priority <= bestPriority)
            continue

          bestStart = start
          bestCaptures = match.captureIndices
          bestCaptureCount = match.captureCount
          bestRuleId = match.ruleId
          bestPriority = injection.priority
          if (bestStart === linePosition && bestPriority === 1) break
        }

        return bestCaptures
          ? {
              priorityMatch: bestPriority === -1,
              captureIndices: bestCaptures,
              captureCount: bestCaptureCount,
              matchedRuleId: bestRuleId!,
            }
          : null
      })(
        injections,
        grammar,
        lineText,
        isFirstLine,
        linePosition,
        stack,
        anchorPosition
      )

      if (!injectionMatch) return ruleMatch
      if (!ruleMatch) return injectionMatch

      const ruleStart = getCaptureStart(ruleMatch.captureIndices, 0)
      const injStart = getCaptureStart(injectionMatch.captureIndices, 0)
      return injStart < ruleStart ||
        (injectionMatch.priorityMatch && injStart === ruleStart)
        ? injectionMatch
        : ruleMatch
    })(grammar, lineText, isFirstLine, linePosition, stack, anchorPosition)

    if (!match) {
      produce(stack, lineLength)
      done = true
      return
    }

    const captureIndices = match.captureIndices
    const captureCount = match.captureCount ?? getCaptureCount(captureIndices)
    const matchedRuleId = match.matchedRuleId

    const captureStart = getCaptureStart(captureIndices, 0)
    const captureEnd = getCaptureEnd(captureIndices, 0)
    const hasAdvanced = captureCount > 0 && captureEnd > linePosition

    if (matchedRuleId === endRuleId) {
      const rule = stack.getRule(grammar) as BeginEndRule
      produce(stack, captureStart)
      stack = stack.withContentNameScopesList(stack.nameScopesList)
      handleCaptures(
        grammar,
        lineText,
        isFirstLine,
        stack,
        lineTokens,
        lineFonts,
        rule.endCaptures,
        captureIndices,
        captureCount
      )
      produce(stack, captureEnd)

      const popped = stack
      stack = stack.parent!
      anchorPosition = popped.getAnchorPosition()

      // endless loop guard (case 1): pushed & popped without advancing
      if (!hasAdvanced && popped.getEnterPosition() === linePosition) {
        // Assume this was a grammar author mistake; restore and stop
        stack = popped
        produce(stack, lineLength)
        done = true
        return
      }
    } else {
      const rule = grammar.getRule(matchedRuleId)

      produce(stack, captureStart)

      const parentState = stack
      const name = rule.getName(lineText, captureIndices as any)
      const pushedNameScopes = stack.contentNameScopesList.pushAttributed(
        name,
        grammar
      )
      stack = stack.push(
        matchedRuleId,
        linePosition,
        anchorPosition,
        captureEnd === lineLength,
        null,
        pushedNameScopes,
        pushedNameScopes
      )

      if (rule instanceof BeginEndRule) {
        handleCaptures(
          grammar,
          lineText,
          isFirstLine,
          stack,
          lineTokens,
          lineFonts,
          rule.beginCaptures,
          captureIndices,
          captureCount
        )
        produce(stack, captureEnd)

        anchorPosition = captureEnd

        const contentName = rule.getContentName(lineText, captureIndices as any)
        const pushedContentScopes = pushedNameScopes.pushAttributed(
          contentName,
          grammar
        )
        stack = stack.withContentNameScopesList(pushedContentScopes)

        if (rule.endHasBackReferences) {
          stack = stack.withEndRule(
            rule.getEndWithResolvedBackReferences(
              lineText,
              captureIndices as any
            )
          )
        }

        if (!hasAdvanced && parentState.hasSameRuleAs(stack)) {
          stack = stack.pop()!
          produce(stack, lineLength)
          done = true
          return
        }
      } else if (rule instanceof BeginWhileRule) {
        handleCaptures(
          grammar,
          lineText,
          isFirstLine,
          stack,
          lineTokens,
          lineFonts,
          rule.beginCaptures,
          captureIndices,
          captureCount
        )
        produce(stack, captureEnd)

        anchorPosition = captureEnd

        const contentName = rule.getContentName(lineText, captureIndices as any)
        const pushedContentScopes = pushedNameScopes.pushAttributed(
          contentName,
          grammar
        )
        stack = stack.withContentNameScopesList(pushedContentScopes)

        if (rule.whileHasBackReferences) {
          stack = stack.withEndRule(
            rule.getWhileWithResolvedBackReferences(
              lineText,
              captureIndices as any
            )
          )
        }

        if (!hasAdvanced && parentState.hasSameRuleAs(stack)) {
          stack = stack.pop()!
          produce(stack, lineLength)
          done = true
          return
        }
      } else {
        handleCaptures(
          grammar,
          lineText,
          isFirstLine,
          stack,
          lineTokens,
          lineFonts,
          (rule as MatchRule).captures,
          captureIndices,
          captureCount
        )
        produce(stack, captureEnd)

        stack = stack.pop()!

        if (!hasAdvanced) {
          stack = stack.safePop()
          produce(stack, lineLength)
          done = true
          return
        }
      }
    }

    if (captureEnd > linePosition) {
      linePosition = captureEnd
      isFirstLine = false
    }
  }
}

function prepareRuleSearch(
  rule: any,
  grammar: any,
  endRule: any,
  isFirstLine: any,
  atAnchor: any
): [CompiledRule, number] {
  // Use the anchor-resolving (AG) path since our JS-based OnigScanner
  // doesn't support Oniguruma's FindOption flags (\A/\G semantics).
  return [rule.compileAG(grammar, endRule, isFirstLine, atAnchor), 0]
}

export class LocalStackElement {
  scopes: AttributedScopeStack
  endPos: number
  constructor(scopes: AttributedScopeStack, endPos: number) {
    this.scopes = scopes
    this.endPos = endPos
  }
}

function handleCaptures(
  grammar: Grammar,
  lineText: string,
  isFirstLine: boolean,
  stack: StateStackImplementation,
  lineTokens: LineTokens,
  lineFonts: LineFonts,
  captureRules: any[],
  captureIndices: Int32Array | Array<{ start: number; end: number }>,
  captureCount: number
) {
  const produceFromScopes = (
    scopes: AttributedScopeStack,
    position: number
  ) => {
    lineTokens.produceFromScopes(scopes, position)
    lineFonts.produceFromScopes(scopes, position)
  }
  const produceFromStack = (
    state: StateStackImplementation,
    position: number
  ) => {
    lineTokens.produce(state, position)
    lineFonts.produce(state, position)
  }

  if (!captureRules || captureRules.length === 0) return

  const length = Math.min(captureRules.length, captureCount)
  const localStack = grammar._localStackPool
  localStack.length = 0
  let localStackLen = 0
  const lineEnd = getCaptureEnd(captureIndices, 0)

  // Convert flat buffer to array format for Rule.getName/getContentName compatibility
  // They use RegexSource.replaceCaptures which expects {start, end, length} objects
  const captureArray = grammar._captureArrayPool
  // Ensure pool has enough capacity
  if (captureArray.length < captureCount) {
    const needed = captureCount - captureArray.length
    for (let index = 0; index < needed; index++) {
      captureArray.push({ start: 0, end: 0, length: 0 })
    }
  }
  for (let index = 0; index < captureCount; index++) {
    const start = getCaptureStart(captureIndices, index)
    const end = getCaptureEnd(captureIndices, index)
    captureArray[index].start = start
    captureArray[index].end = end
    captureArray[index].length = end >= start ? end - start : 0
  }

  for (let index = 0; index < length; index++) {
    const captureRuleId = captureRules[index]
    if (captureRuleId === null) continue

    const capture = captureArray[index]
    if (!capture || capture.length <= 0) continue
    // Ignore non-participating capture groups.
    if (capture.start < 0 || capture.end < 0) continue
    if (capture.start > lineEnd) break

    // Look up the actual CaptureRule from the rule ID
    const captureRule = grammar.getRule(captureRuleId) as CaptureRule

    // Pop elements that end before this capture starts
    while (localStackLen > 0) {
      const top = localStack[localStackLen - 1]
      if (top.endPos > capture.start) break
      produceFromScopes(top.scopes, top.endPos)
      localStackLen--
    }

    if (localStackLen > 0)
      produceFromScopes(localStack[localStackLen - 1].scopes, capture.start)
    else produceFromStack(stack, capture.start)

    if (captureRule.retokenizeCapturedWithRuleId) {
      const name = captureRule.getName(lineText, captureArray)
      const nameScopes = stack.contentNameScopesList.pushAttributed(
        name,
        grammar
      )
      const contentName = captureRule.getContentName(lineText, captureArray)
      const contentScopes = nameScopes.pushAttributed(contentName, grammar)

      const nestedStack = stack.push(
        captureRule.retokenizeCapturedWithRuleId,
        capture.start,
        -1,
        false,
        null,
        nameScopes,
        contentScopes
      )

      tokenizeString(
        grammar,
        lineText.substring(0, capture.end),
        isFirstLine && capture.start === 0,
        capture.start,
        nestedStack,
        lineTokens,
        lineFonts,
        false,
        0
      )
      continue
    }

    const name = captureRule.getName(lineText, captureArray)
    if (name !== null) {
      const top =
        localStackLen > 0
          ? localStack[localStackLen - 1].scopes
          : stack.contentNameScopesList
      const pushed = top.pushAttributed(name, grammar)
      // Reuse array slots instead of always pushing
      if (localStackLen < localStack.length) {
        const elem = localStack[localStackLen]
        elem.scopes = pushed
        elem.endPos = capture.end
      } else {
        localStack.push(new LocalStackElement(pushed, capture.end))
      }
      localStackLen++
    }
  }

  while (localStackLen > 0) {
    const top = localStack[--localStackLen]
    produceFromScopes(top.scopes, top.endPos)
  }
}

export class AttributedScopeStack {
  #cachedScopeNames: string[] | null = null

  parent: AttributedScopeStack | null
  scopeName: string | null
  tokenAttributes: number
  styleAttributes: StyleAttributes | null

  constructor(
    parent: AttributedScopeStack | null,
    scopeName: string | null,
    tokenAttributes: number,
    styleAttributes: StyleAttributes | null
  ) {
    this.parent = parent
    this.scopeName = scopeName
    this.tokenAttributes = tokenAttributes
    this.styleAttributes = styleAttributes
  }

  static createRoot(
    scopeName: string,
    tokenAttributes: number,
    styleAttributes: StyleAttributes | null
  ): AttributedScopeStack {
    return new AttributedScopeStack(
      null,
      scopeName,
      tokenAttributes >>> 0,
      styleAttributes
    )
  }

  pushAttributed(
    scopeName: string | null,
    grammar: Grammar
  ): AttributedScopeStack {
    if (!scopeName) {
      return this
    }

    const spaceIdx = scopeName.indexOf(' ')
    if (spaceIdx === -1) {
      const metadata = grammar.getMetadataForScope(scopeName, this)
      const result = new AttributedScopeStack(
        this,
        scopeName,
        metadata.tokenAttributes,
        metadata.styleAttributes
      )
      return result
    }

    let currentStack: AttributedScopeStack = this
    let start = 0
    const scopeNameLength = scopeName.length
    while (start < scopeNameLength) {
      while (start < scopeNameLength && scopeName.charCodeAt(start) === 32)
        start++
      if (start >= scopeNameLength) break
      let end = start + 1
      while (end < scopeNameLength && scopeName.charCodeAt(end) !== 32) end++
      const currentScopeName = internScope(scopeName.substring(start, end))
      const metadata = grammar.getMetadataForScope(
        currentScopeName,
        currentStack
      )
      currentStack = new AttributedScopeStack(
        currentStack,
        currentScopeName,
        metadata.tokenAttributes,
        metadata.styleAttributes
      )
      start = end + 1
    }
    return currentStack
  }

  getScopeNames(): string[] {
    if (this.#cachedScopeNames) return this.#cachedScopeNames

    const out: string[] = []
    let current: AttributedScopeStack | null = this
    while (current) {
      if (current.scopeName) out.push(current.scopeName)
      current = current.parent
    }
    out.reverse()
    this.#cachedScopeNames = out
    return out
  }

  equals(other: AttributedScopeStack | null): boolean {
    if (this === other) return true
    if (!other) return false
    if (this.scopeName !== other.scopeName) return false
    if (this.tokenAttributes !== other.tokenAttributes) return false
    return this.parent
      ? this.parent.equals(other.parent)
      : other.parent === null
  }

  /**
   * Compute the extension (from a base stack) needed to reach this stack.
   * Returns `undefined` if the provided base is not an ancestor.
   */
  getExtensionIfDefined(
    base: AttributedScopeStack | null
  ): AttributedScopeStackFrame[] | undefined {
    const frames: AttributedScopeStackFrame[] = []
    let current: AttributedScopeStack | null = this
    while (current && current !== base) {
      if (!current.scopeName) {
        current = current.parent
        continue
      }
      frames.push({
        scopeNames: [current.scopeName],
        encodedTokenAttributes: current.tokenAttributes,
      })
      current = current.parent
    }
    if (current !== base) return undefined
    return frames.reverse()
  }

  /**
   * Reconstruct a scope stack by applying the provided frames on top of `base`.
   */
  static fromExtension(
    base: AttributedScopeStack | null,
    frames: AttributedScopeStackFrame[]
  ): AttributedScopeStack | null {
    let current = base
    for (let index = 0, framesLen = frames.length; index < framesLen; index++) {
      const frame = frames[index]
      const scopeNames = frame.scopeNames
      for (
        let j = 0, scopeNamesLen = scopeNames.length;
        j < scopeNamesLen;
        j++
      ) {
        current = new AttributedScopeStack(
          current,
          scopeNames[j],
          frame.encodedTokenAttributes >>> 0,
          null
        )
      }
    }
    return current
  }
}

export interface AttributedScopeStackFrame {
  encodedTokenAttributes: number
  scopeNames: string[]
}

export class LineTokens {
  // Output is `[startIndex0, metadata0, startIndex1, metadata1, ...]`
  #tokens: Uint32Array = new Uint32Array(64)
  #tokensCapacity = 64
  #tokensLength = 0
  #lastPosition = 0
  #lastMetadata = 0

  reset() {
    this.#tokensLength = 0
    this.#lastPosition = 0
    this.#lastMetadata = 0
  }

  produce(stack: StateStackImplementation, endPosition: number) {
    this.produceFromScopes(stack.contentNameScopesList, endPosition)
  }

  produceFromScopes(scopes: AttributedScopeStack, endPosition: number) {
    if (endPosition <= this.#lastPosition) {
      return
    }
    const metadata = scopes.tokenAttributes >>> 0

    if (this.#tokensLength === 0 || this.#lastMetadata !== metadata) {
      // Grow array if needed
      if (this.#tokensLength + 2 > this.#tokensCapacity) {
        // Grow by doubling capacity to reduce reallocations
        const newCapacity = this.#tokensCapacity * 2
        const newTokens = new Uint32Array(newCapacity)
        newTokens.set(this.#tokens.subarray(0, this.#tokensLength))
        this.#tokens = newTokens
        this.#tokensCapacity = newCapacity
      }
      this.#tokens[this.#tokensLength++] = this.#lastPosition
      this.#tokens[this.#tokensLength++] = metadata
    }
    this.#lastPosition = endPosition
    this.#lastMetadata = metadata
  }

  finalize(lineLength: number) {
    // Ensure last token ends at lineLength by just updating lastPosition.
    this.#lastPosition = lineLength
    // Return a copy of the tokens. We must copy because the underlying buffer
    // is reused when the pool is reset for the next line.
    return this.#tokens.slice(0, this.#tokensLength)
  }
}

export class LineFonts {
  #spans: Array<{
    start: number
    fontFamily: string | null
    fontSize: string | null
    lineHeight: number | null
  }> = []
  #lastPosition = 0
  #lastFontFamily: string | null = null
  #lastFontSize: string | null = null
  #lastLineHeight: number | null = null

  reset() {
    this.#spans = []
    this.#lastPosition = 0
    this.#lastFontFamily = null
    this.#lastFontSize = null
    this.#lastLineHeight = null
  }

  produce(stack: StateStackImplementation, endPosition: number) {
    this.produceFromScopes(stack.contentNameScopesList, endPosition)
  }

  produceFromScopes(scopes: AttributedScopeStack, endPosition: number) {
    if (endPosition <= this.#lastPosition) return

    const fontFamily = this.#getFontFamily(scopes)
    const fontSize = this.#getFontSize(scopes)
    const lineHeight = this.#getLineHeight(scopes)

    if (!fontFamily && !fontSize && !lineHeight) {
      this.#lastPosition = endPosition
      return
    }

    if (
      fontFamily !== this.#lastFontFamily ||
      fontSize !== this.#lastFontSize ||
      lineHeight !== this.#lastLineHeight
    ) {
      this.#spans.push({
        start: this.#lastPosition,
        fontFamily: fontFamily || null,
        fontSize: fontSize || null,
        lineHeight: lineHeight || null,
      })
      this.#lastFontFamily = fontFamily || null
      this.#lastFontSize = fontSize || null
      this.#lastLineHeight = lineHeight || null
    }

    this.#lastPosition = endPosition
  }

  finalize(_lineLength: number) {
    return this.#spans
  }

  #getFontFamily(scopesList: AttributedScopeStack): string | null {
    return this.#getAttribute(scopesList, (styleAttributes) => {
      return styleAttributes.fontFamily
    })
  }

  #getFontSize(scopesList: AttributedScopeStack): string | null {
    return this.#getAttribute(scopesList, (styleAttributes) => {
      return styleAttributes.fontSize
    })
  }

  #getLineHeight(scopesList: AttributedScopeStack): number | null {
    return this.#getAttribute(scopesList, (styleAttributes) => {
      return styleAttributes.lineHeight
    })
  }

  #getAttribute<T>(
    scopesList: AttributedScopeStack | null,
    getAttr: (styleAttributes: StyleAttributes) => T
  ): T | null {
    if (!scopesList) {
      return null
    }

    const styleAttributes = scopesList.styleAttributes
    if (styleAttributes) {
      const attribute = getAttr(styleAttributes)
      // Treat falsy values ('' / 0 / null) as "not set", keep walking parents.
      if (attribute) {
        return attribute
      }
    }

    return this.#getAttribute(scopesList.parent, getAttr)
  }
}

export class StateStackImplementation {
  parent: StateStackImplementation | null
  ruleId: number
  #enterPosition: number
  #anchorPosition: number
  beginRuleCapturedEOL: boolean
  endRule: string | null
  nameScopesList: AttributedScopeStack
  contentNameScopesList: AttributedScopeStack

  constructor(
    parent: StateStackImplementation | null,
    ruleId: number,
    enterPosition: number,
    anchorPosition: number,
    beginRuleCapturedEOL: boolean,
    endRule: string | null,
    nameScopesList: AttributedScopeStack,
    contentNameScopesList: AttributedScopeStack
  ) {
    this.parent = parent
    this.ruleId = ruleId
    this.#enterPosition = enterPosition
    this.#anchorPosition = anchorPosition
    this.beginRuleCapturedEOL = beginRuleCapturedEOL
    this.endRule = endRule
    this.nameScopesList = nameScopesList
    this.contentNameScopesList = contentNameScopesList
  }

  static create(rootRuleId: number, rootScopes: AttributedScopeStack) {
    return new StateStackImplementation(
      null,
      rootRuleId,
      0,
      0,
      false,
      null,
      rootScopes,
      rootScopes
    )
  }

  getEnterPosition() {
    return this.#enterPosition
  }

  getAnchorPosition() {
    return this.#anchorPosition
  }

  /**
   * Reset enter/anchor positions to -1.
   * Must be called at the start of tokenizing each new line (except the first).
   * This ensures the endless loop guard works correctly by comparing
   * positions within the current line only.
   */
  reset(): void {
    StateStackImplementation.#resetPositions(this)
  }

  static #resetPositions(stateStack: StateStackImplementation | null): void {
    while (stateStack) {
      stateStack.#enterPosition = -1
      stateStack.#anchorPosition = -1
      stateStack = stateStack.parent
    }
  }

  withContentNameScopesList(scopes: AttributedScopeStack) {
    return new StateStackImplementation(
      this.parent,
      this.ruleId,
      this.#enterPosition,
      this.#anchorPosition,
      this.beginRuleCapturedEOL,
      this.endRule,
      this.nameScopesList,
      scopes
    )
  }

  withEndRule(endRule: string) {
    return new StateStackImplementation(
      this.parent,
      this.ruleId,
      this.#enterPosition,
      this.#anchorPosition,
      this.beginRuleCapturedEOL,
      endRule,
      this.nameScopesList,
      this.contentNameScopesList
    )
  }

  equals(other: StateStackImplementation | null): boolean {
    if (this === other) return true
    if (!other) return false
    return (
      this.ruleId === other.ruleId &&
      this.#enterPosition === other.#enterPosition &&
      this.#anchorPosition === other.#anchorPosition &&
      this.beginRuleCapturedEOL === other.beginRuleCapturedEOL &&
      this.endRule === other.endRule &&
      this.nameScopesList.equals(other.nameScopesList) &&
      this.contentNameScopesList.equals(other.contentNameScopesList) &&
      (this.parent ? this.parent.equals(other.parent) : other.parent === null)
    )
  }

  push(
    ruleId: number,
    enterPos: number,
    anchorPos: number,
    beginRuleCapturedEOL: boolean,
    endRule: string | null,
    nameScopesList: AttributedScopeStack,
    contentNameScopesList: AttributedScopeStack
  ) {
    return new StateStackImplementation(
      this,
      ruleId,
      enterPos,
      anchorPos,
      beginRuleCapturedEOL,
      endRule,
      nameScopesList,
      contentNameScopesList
    )
  }

  pop() {
    return this.parent
  }

  safePop() {
    return this.parent || this
  }

  hasSameRuleAs(other: StateStackImplementation) {
    return (
      this.ruleId === other.ruleId &&
      this.endRule === other.endRule &&
      this.#enterPosition === other.#enterPosition &&
      this.#anchorPosition === other.#anchorPosition
    )
  }

  /**
   * Serialize this frame relative to its parent.
   */
  toStateStackFrame(): StateStackFrame {
    return {
      ruleId: this.ruleId,
      enterPos: this.#enterPosition,
      anchorPos: this.#anchorPosition,
      beginRuleCapturedEOL: this.beginRuleCapturedEOL,
      endRule: this.endRule,
      nameScopesList:
        this.nameScopesList.getExtensionIfDefined(
          this.parent?.nameScopesList ?? null
        ) ?? [],
      contentNameScopesList:
        this.contentNameScopesList.getExtensionIfDefined(this.nameScopesList) ??
        [],
    }
  }

  /**
   * Recreate a stack frame from serialized data.
   */
  static pushFrame(
    self: StateStackImplementation | null,
    frame: StateStackFrame
  ): StateStackImplementation {
    const namesScopeList = AttributedScopeStack.fromExtension(
      self?.nameScopesList ?? null,
      frame.nameScopesList
    )!
    const contentNameScopesList = AttributedScopeStack.fromExtension(
      namesScopeList,
      frame.contentNameScopesList
    )!

    return new StateStackImplementation(
      self,
      frame.ruleId,
      frame.enterPos ?? -1,
      frame.anchorPos ?? -1,
      frame.beginRuleCapturedEOL,
      frame.endRule,
      namesScopeList,
      contentNameScopesList
    )
  }

  getRule(grammar: Grammar): Rule {
    return grammar.getRule(this.ruleId)
  }

  toString() {
    const parts: string[] = []
    for (
      let stack: StateStackImplementation | null = this;
      stack;
      stack = stack.parent
    ) {
      parts.push(String(stack.ruleId))
    }
    return parts.reverse().join('/')
  }
}

export interface IRawTheme {
  name?: string
  settings?: Array<any>
  tokenColors?: Array<any>
}

export interface IRawGrammar {
  scopeName: string
  patterns?: RawRule[]
  repository?: RawRepository
  injections?: RawRepository
  injectionSelector?: string
}

export type GrammarRepository = {
  lookup: (scopeName: string) => IRawGrammar | null
  injections: (scopeName: string) => string[] | null
}

export class SyncRegistry {
  #grammars = new Map<string, IRawGrammar>()
  #injections = new Map<string, string[]>()
  #theme: Theme | null = null

  setTheme(theme: Theme) {
    this.#theme = theme
  }
  getTheme() {
    if (!this.#theme) throw new Error('Missing theme in registry')
    return this.#theme
  }

  addGrammar(grammar: IRawGrammar) {
    this.#grammars.set(grammar.scopeName, grammar)
  }

  lookup(scopeName: string) {
    return this.#grammars.get(scopeName) || null
  }

  injections(scopeName: string) {
    return this.#injections.get(scopeName) || null
  }

  addInjection(targetScope: string, injectorScope: string) {
    const arr = this.#injections.get(targetScope) || []
    if (!arr.includes(injectorScope)) arr.push(injectorScope)
    this.#injections.set(targetScope, arr)
  }
}

export type OnigLib = {
  createOnigScanner: (sources: string[]) => any
  createOnigString: (str: string) => any
}

export type ITokenizeLineResult = {
  /** Raw token data: [startPos0, metadata0, startPos1, metadata1, ...] */
  tokens: Uint32Array
  /** Grammar state for next line */
  ruleStack: StateStackImplementation
  /** True if tokenization was stopped due to time limit */
  stoppedEarly: boolean
}

export interface StateStackFrame {
  ruleId: number
  enterPos?: number
  anchorPos?: number
  beginRuleCapturedEOL: boolean
  endRule: string | null
  nameScopesList: AttributedScopeStackFrame[]
  contentNameScopesList: AttributedScopeStackFrame[]
}

export class Grammar {
  #ruleId = 0
  private ruleId2rule: Rule[] = []
  #injections: any[] = []
  #injectionGrammarScopes: string[] = []

  readonly repository: Record<string, any>

  #basicScopeAttributesProvider: BasicScopeAttributesProvider
  #tokenTypeMatchers: ScopeMatcher
  #balancedBracketMatchers: {
    matcher: (names: string[]) => boolean
  }[] = []
  #metadataCache = new WeakMap<
    AttributedScopeStack,
    Map<
      string,
      { tokenAttributes: number; styleAttributes: StyleAttributes | null }
    >
  >()
  #metadataCacheRoot = new Map<
    string,
    { tokenAttributes: number; styleAttributes: StyleAttributes | null }
  >()
  #cachedThemeForMetadata: Theme | null = null

  #lineTokensPool: LineTokens = new LineTokens()
  #lineFontsPool: LineFonts = new LineFonts()
  _loopGuardPool = {
    seen: new Map<any, Set<number>>(),
    setPool: [] as Set<number>[],
    setPoolLen: 0,
  }
  _captureArrayPool: Array<{
    start: number
    end: number
    length: number
  }> = []
  _whileRulesPool: Array<{
    rule: BeginWhileRule
    stack: StateStackImplementation
  }> = []
  _localStackPool: LocalStackElement[] = []

  scopeName: string
  #rawGrammar: IRawGrammar
  #languageId: number
  #grammarRepository: GrammarRepository
  #registry: SyncRegistry

  constructor(
    scopeName: string,
    rawGrammar: IRawGrammar,
    languageId: number,
    embeddedLanguages: Record<string, number> | null,
    tokenTypes: Record<string, number> | null,
    balancedBracketSelectors: string[] | null,
    grammarRepository: GrammarRepository,
    registry: SyncRegistry
  ) {
    this.scopeName = scopeName
    this.#rawGrammar = rawGrammar
    this.#languageId = languageId
    this.#grammarRepository = grammarRepository
    this.#registry = registry

    this.repository = mergeObjects({}, this.#rawGrammar.repository || {})
    if (!this.repository['$self']) this.repository['$self'] = this.#rawGrammar
    if (!this.repository['$base']) this.repository['$base'] = this.#rawGrammar

    this.#basicScopeAttributesProvider = new BasicScopeAttributesProvider(
      this.#languageId,
      embeddedLanguages || {}
    )
    this.#tokenTypeMatchers = new ScopeMatcher(Object.entries(tokenTypes || {}))

    if (balancedBracketSelectors && balancedBracketSelectors.length) {
      for (const sel of balancedBracketSelectors) {
        const matchers = createMatchers(sel, nameMatcher)
        for (const m of matchers)
          this.#balancedBracketMatchers.push({ matcher: m.matcher })
      }
    }

    RuleFactory.getCompiledRuleId(
      this.repository['$self'],
      this,
      this.repository
    )

    this.#collectInjections()
  }

  getRule(ruleId: number) {
    const rule = this.ruleId2rule[ruleId]
    if (!rule) {
      throw new Error(
        `Unknown ruleId ${ruleId} in grammar "${this.scopeName}". ` +
          `This grammar has ${this.#ruleId} registered rules (max ruleId: ${this.#ruleId}). ` +
          `This typically indicates a StateStack from a different grammar instance is being used.`
      )
    }
    return rule
  }

  getRuleIfExists(ruleId: number) {
    return this.ruleId2rule[ruleId]
  }

  registerRule(factory: (id: number) => Rule) {
    const id = ++this.#ruleId
    const rule = factory(id)
    this.ruleId2rule[id] = rule
    return id
  }

  getInjections() {
    return this.#injections
  }

  getExternalGrammar(scopeName: string) {
    const raw = this.#grammarRepository.lookup(scopeName)
    if (!raw) return null
    return {
      scopeName,
      repository: mergeObjects<RawRepository>(
        Object.create(null) as RawRepository,
        raw.repository || {},
        {
          $self: raw,
          $base: this.#rawGrammar,
        }
      ),
    }
  }

  getMetadataForScope(
    scope: string,
    parentScopes: AttributedScopeStack | null
  ): { tokenAttributes: number; styleAttributes: StyleAttributes | null } {
    const theme = this.#registry.getTheme()

    // Reset caches if theme changed (style attributes depend on theme).
    if (this.#cachedThemeForMetadata !== theme) {
      this.#cachedThemeForMetadata = theme
      this.#metadataCache = new WeakMap()
      this.#metadataCacheRoot = new Map()
    }

    const cacheBucket =
      parentScopes === null
        ? this.#metadataCacheRoot
        : (this.#metadataCache.get(parentScopes) ??
          (() => {
            const map = new Map<
              string,
              {
                tokenAttributes: number
                styleAttributes: StyleAttributes | null
              }
            >()
            this.#metadataCache.set(parentScopes, map)
            return map
          })())

    const cached = cacheBucket.get(scope)
    if (cached) {
      return cached
    }

    const parentScopeNames = parentScopes ? parentScopes.getScopeNames() : []

    const basic =
      this.#basicScopeAttributesProvider.getBasicScopeAttributes(scope)
    const tokenType = this.#tokenTypeMatchers.match(scope) ?? basic.tokenType
    // Create scratch array for balanced bracket check
    const parentLength = parentScopeNames.length
    const scopeNamesWithScope = new Array<string>(parentLength + 1)
    for (let index = 0; index < parentLength; index++) {
      scopeNamesWithScope[index] = parentScopeNames[index]
    }
    scopeNamesWithScope[parentLength] = scope
    const containsBalanced = this.#balancedBracketMatchers.some((matcher) =>
      matcher.matcher(scopeNamesWithScope)
    )

    // Theme matching using AttributedScopeStack as fast path, with a fallback to ScopeStack
    let themeMatch = theme.matchAttributed(scope, parentScopes)
    if (!themeMatch) {
      const stack = ScopeStack.push(null, parentScopeNames)
      const full = stack
        ? ScopeStack.push(stack, [scope])
        : ScopeStack.push(null, [scope])
      themeMatch = full ? theme.match(full) : null
    }
    if (!themeMatch && parentScopes === null) {
      themeMatch = theme.getDefaults()
    }

    const existingAttributes = parentScopes ? parentScopes.tokenAttributes : 0

    let fontStyle = -1
    let foreground = 0
    let background = 0

    if (themeMatch !== null) {
      fontStyle = themeMatch.fontStyle
      foreground = themeMatch.foregroundId
      background = themeMatch.backgroundId
    }

    const encoded = EncodedTokenAttributes.set(
      existingAttributes, // Use parent's attributes as base (0 if no parent)
      basic.languageId,
      tokenType,
      containsBalanced,
      fontStyle, // -1 (NotSet) preserves existing
      foreground, // 0 preserves existing
      background // 0 preserves existing
    )

    const result = {
      tokenAttributes: encoded >>> 0,
      styleAttributes: themeMatch,
    }
    cacheBucket.set(scope, result)
    return result
  }

  tokenizeLine(
    lineText: string,
    previousState: StateStackImplementation | null,
    timeLimitMs = 0
  ): ITokenizeLineResult {
    const rootMeta = this.getMetadataForScope(this.scopeName, null)
    const rootScopes = AttributedScopeStack.createRoot(
      this.scopeName,
      rootMeta.tokenAttributes,
      rootMeta.styleAttributes
    )

    let stack: StateStackImplementation
    if (previousState) {
      previousState.reset()
      stack = previousState
    } else {
      stack = StateStackImplementation.create(
        RuleFactory.getCompiledRuleId(
          this.repository['$self'],
          this,
          this.repository
        ),
        rootScopes
      )
    }

    // proper regex matching (e.g. $ anchors, lookaheads that expect line endings).
    const lineTextWithNewline = lineText + '\n'

    const lineTokens = this.#lineTokensPool
    const lineFonts = this.#lineFontsPool
    lineTokens.reset()
    lineFonts.reset()

    const isFirstLine = !previousState
    const result = tokenizeString(
      this,
      lineTextWithNewline,
      isFirstLine,
      0,
      stack,
      lineTokens,
      lineFonts,
      true,
      timeLimitMs
    )

    const finalTokens = lineTokens.finalize(lineText.length)

    return {
      tokens: finalTokens as Uint32Array,
      ruleStack: result.stack,
      stoppedEarly: result.stoppedEarly,
    }
  }

  // Injections match based on injectionSelector from other grammars registered in registry
  #collectInjections() {
    // If the raw grammar has injections, compile them.
    if (this.#rawGrammar.injections) {
      for (const selector in this.#rawGrammar.injections) {
        const rawRule = (this.#rawGrammar.injections as any)[selector]
        createGrammarInjection(this.#injections, selector, rawRule, this, {
          repository: this.repository,
        })
      }
    }

    // Also include injections provided by registry mappings.
    const injectorScopes =
      this.#grammarRepository.injections(this.scopeName) || []
    for (const injectorScope of injectorScopes) {
      if (this.#injectionGrammarScopes.includes(injectorScope)) continue
      this.#injectionGrammarScopes.push(injectorScope)
      const inj = this.#grammarRepository.lookup(injectorScope)
      if (!inj || !inj.injectionSelector) continue

      const selector = inj.injectionSelector
      const rawRule = inj.repository?.['$self'] || inj
      createGrammarInjection(this.#injections, selector, rawRule, this, {
        repository: mergeObjects({}, inj.repository || {}, { $self: inj }),
      })
    }
  }
}

export type StateStack = StateStackImplementation | null
export type IGrammar = Grammar
export const INITIAL: StateStack = null

export type TextMateRegistryOptions = {
  loadGrammar: (scopeName: string) => Promise<IRawGrammar | null>
}

export class Registry {
  #syncRegistry = new SyncRegistry()
  #loadGrammar: (scopeName: string) => Promise<IRawGrammar | null>

  #rawGrammars = new Map<string, IRawGrammar>()
  #compiledGrammars = new Map<string, Grammar>()
  #injectionScopes = new Set<string>()
  #hasTheme = false

  #loadingGrammars = new Map<string, Promise<void>>()
  #compilingGrammars = new Map<string, Promise<Grammar | null>>()

  constructor(options: TextMateRegistryOptions) {
    this.#loadGrammar = options.loadGrammar
  }

  setTheme(rawTheme: IRawTheme) {
    const theme = Theme.createFromRawTheme(rawTheme, null)
    this.#syncRegistry.setTheme(theme)
    this.#hasTheme = true
  }

  #ensureTheme() {
    if (!this.#hasTheme) {
      this.#syncRegistry.setTheme(Theme.createFromRawTheme(undefined, null))
      this.#hasTheme = true
    }
  }

  getColorMap() {
    this.#ensureTheme()
    return this.#syncRegistry.getTheme().getColorMap()
  }

  async loadGrammar(scopeName: string): Promise<Grammar | null> {
    const existing = this.#compiledGrammars.get(scopeName)
    if (existing) return existing

    const existingCompile = this.#compilingGrammars.get(scopeName)
    if (existingCompile) return existingCompile

    const compilePromise = this.#doCompileGrammar(scopeName)
    this.#compilingGrammars.set(scopeName, compilePromise)

    try {
      return await compilePromise
    } finally {
      this.#compilingGrammars.delete(scopeName)
    }
  }

  async #doCompileGrammar(scopeName: string): Promise<Grammar | null> {
    await this.#ensureGrammarAndDependencies(scopeName)

    const rawGrammar = this.#rawGrammars.get(scopeName)
    if (!rawGrammar) return null

    const existing = this.#compiledGrammars.get(scopeName)
    if (existing) return existing

    this.#ensureTheme()

    const grammar = createGrammar(scopeName, rawGrammar, 0, null, null, null, {
      registry: this.#syncRegistry,
      lookup: (s: string) => this.#syncRegistry.lookup(s),
      injections: (s: string) => this.#syncRegistry.injections(s),
    }) as Grammar

    this.#compiledGrammars.set(scopeName, grammar)
    return grammar
  }

  async #ensureGrammarAndDependencies(initialScopeName: string) {
    await this.#ensureRawGrammarLoaded(initialScopeName)

    const processor = new ScopeDependencyProcessor(
      this.#syncRegistry,
      initialScopeName
    )

    while (processor.queue.length > 0) {
      processor.processQueue()
      for (const ref of processor.queue) {
        await this.#ensureRawGrammarLoaded(ref.scopeName)
      }
    }
  }

  async #ensureRawGrammarLoaded(scopeName: string) {
    if (this.#rawGrammars.has(scopeName)) return

    const existingLoad = this.#loadingGrammars.get(scopeName)
    if (existingLoad) {
      await existingLoad
      return
    }

    const loadPromise = this.#doLoadRawGrammar(scopeName)
    this.#loadingGrammars.set(scopeName, loadPromise)

    try {
      await loadPromise
    } finally {
      this.#loadingGrammars.delete(scopeName)
    }
  }

  async #doLoadRawGrammar(scopeName: string) {
    const rawGrammar = await this.#loadGrammar(scopeName)
    if (!rawGrammar) return

    // Deep clone the grammar to ensure all nested objects are mutable.
    // Grammar files may be frozen (e.g., via Object.freeze) and the TextMate
    // implementation needs to add `id` properties to rule objects.
    const clonedGrammar = clone(rawGrammar)

    this.#rawGrammars.set(scopeName, clonedGrammar)
    this.#syncRegistry.addGrammar(clonedGrammar)

    if (rawGrammar.injectionSelector) {
      this.#injectionScopes.add(scopeName)
    }

    for (const targetScope of this.#rawGrammars.keys()) {
      for (const injectorScope of this.#injectionScopes) {
        this.#syncRegistry.addInjection(targetScope, injectorScope)
      }
    }
  }
}

/** The options for the TextMate registry. */
export interface RegistryOptions<Theme extends string> {
  /** The function to get a grammar from the TextMate registry. */
  getGrammar: (scopeName: ScopeName) => Promise<TextMateGrammarRaw>

  /** The function to get a theme from the TextMate registry. */
  getTheme: (theme: Theme) => Promise<TextMateThemeRaw>
}

/** The grammar definition from the TextMate registry. */
export type TextMateGrammar = IGrammar

/** The raw grammar definition from the TextMate registry. */
export type TextMateGrammarRaw = IRawGrammar

/** The registry of TextMate grammars and themes. */
export type TextMateRegistry<Grammar extends string> = {
  getColorMap: () => string[]
  loadGrammar: (grammar: Grammar) => Promise<TextMateGrammar | null>
  setTheme: (theme: TextMateThemeRaw) => void
}

/** The raw theme definition from the TextMate registry. */
export type TextMateThemeRaw = IRawTheme & {
  type?: 'dark' | 'light'
  colors?: Record<string, string>
  semanticTokenColors?: Record<string, TextMateTokenSettings>
  tokenColors?: TextMateTokenColor[]
  settings?: IRawTheme['settings']
}

/** The color of a single token. */
export interface TextMateTokenColor {
  name?: string
  scope: string | string[]
  settings: TextMateTokenSettings
}

/** The settings of a single token. */
export interface TextMateTokenSettings {
  foreground?: string
  background?: string
  fontStyle?: string
}

/** The grammar state to seed the tokenization with per theme. */
export type GrammarState = Array<StateStack>

export interface TokenizeOptions {
  /**
   * The grammar state(s) to seed the tokenization with.
   *
   * - If a single state is provided, it is applied to all themes.
   * - If an array is provided, each entry is used as the state for the
   *   corresponding theme index.
   */
  grammarState?: StateStack | GrammarState

  /** The maximum time in milliseconds to spend tokenizing a single line. */
  timeLimit?: number
}

/** Raw tokenization result for a single line. */
export interface RawTokenizeResult {
  /**
   * Raw tokens: `[startPos, metadata, startPos, metadata, ...]`
   */
  tokens: Uint32Array
  /** The original line text (for slicing) */
  lineText: string
  /** Grammar state for continuing to next line */
  ruleStack: StateStack
  /** True if stopped early due to time limit */
  stoppedEarly: boolean
}

/** Context needed for decoding raw tokens. */
export interface TokenizerContext {
  /** Color map for decoding foreground/background IDs */
  colorMap: readonly string[]
  /** Base foreground color for "is this the default color?" checks */
  baseColor: string
}

interface GrammarMetadata extends IRawGrammar {
  name?: string
  aliases?: string[]
}

export class TokenizerRegistry<Theme extends string> {
  #options: RegistryOptions<Theme>
  #registry: Registry
  #theme: TextMateThemeRaw | undefined

  constructor(options: RegistryOptions<Theme>) {
    this.#options = options
    this.#registry = new Registry({
      loadGrammar: (scopeName) => this.fetchGrammar(scopeName as ScopeName),
    })
  }

  fetchGrammar = async (
    scopeName: ScopeName
  ): Promise<GrammarMetadata | null> => {
    const source = await this.#options.getGrammar(scopeName)
    if (!source) {
      return null
    }
    return source
  }

  async loadGrammar(language: Languages): Promise<TextMateGrammar | null> {
    const scopeName = Object.keys(grammars).find((name) =>
      (grammars[name as ScopeName] as readonly Languages[]).includes(language)
    ) as ScopeName | undefined

    if (!scopeName) {
      throw new Error(
        `[renoun] The grammar for language "${language}" could not be found. Ensure this language is included in the \`languages\` prop on \`RootProvider\`.`
      )
    }

    return this.#registry.loadGrammar(scopeName)
  }

  async fetchTheme(name: Theme): Promise<TextMateThemeRaw> {
    const source = await this.#options.getTheme(name)

    if (!source) {
      throw new Error(
        `[renoun] Missing "${name}" theme in Registry. Ensure this theme is configured on \`RootProvider\` and the \`tm-themes\` package is installed.`
      )
    }

    return source
  }

  setTheme(theme: TextMateThemeRaw): void {
    if (this.#theme === theme) return
    this.#theme = theme
    this.#registry.setTheme(theme)
  }

  getThemeColors(): string[] {
    return this.#registry.getColorMap()
  }
}

export class Tokenizer<Theme extends string> {
  #baseColors: Map<string, string> = new Map()
  #registries: Map<string, TokenizerRegistry<Theme>> = new Map()
  #registryOptions: RegistryOptions<Theme>
  #grammarState: GrammarState = []

  constructor(registryOptions: RegistryOptions<Theme>) {
    this.#registryOptions = registryOptions
  }

  async #getOrCreateRegistry(theme: Theme): Promise<TokenizerRegistry<Theme>> {
    let registry = this.#registries.get(theme)
    if (!registry) {
      registry = new TokenizerRegistry(this.#registryOptions)
      const themeData = await registry.fetchTheme(theme)
      registry.setTheme(themeData)
      const baseColor = themeData.colors?.['foreground']
      if (baseColor) {
        this.#baseColors.set(theme, baseColor)
      }
      this.#registries.set(theme, registry)
    }
    return registry
  }

  /**
   * Ensure a theme is loaded and registered so color map/base color are available.
   */
  async ensureTheme(themeName: Theme): Promise<void> {
    await this.#getOrCreateRegistry(themeName)
  }

  /**
   * Get context (colorMap, baseColor) for decoding raw tokens from a theme.
   */
  async getContext(theme: Theme): Promise<TokenizerContext> {
    const registry = await this.#getOrCreateRegistry(theme)
    const colorMap = registry.getThemeColors()
    const baseColor = this.#baseColors.get(theme) || ''
    return { colorMap, baseColor }
  }

  /**
   * Tokenize a single line and return raw tokens.
   */
  async tokenizeLineRaw(
    grammar: TextMateGrammar,
    lineText: string,
    prevState: StateStack,
    timeLimit?: number
  ): Promise<RawTokenizeResult> {
    const lineResult = grammar.tokenizeLine(lineText, prevState, timeLimit ?? 0)
    return {
      tokens: lineResult.tokens as Uint32Array,
      lineText,
      ruleStack: lineResult.ruleStack,
      stoppedEarly: lineResult.stoppedEarly,
    }
  }

  /**
   * Stream raw tokens line-by-line for the given source.
   * Useful for binary RPC transport.
   */
  async *stream(
    source: string,
    language: Languages,
    theme: Theme,
    options?: TokenizeOptions
  ): AsyncGenerator<RawTokenizeResult> {
    const { grammarStates, timeLimit } = normalizeTokenizeOptions(
      [theme],
      options
    )
    const lines = source.split(/\r?\n/)

    const registry = await this.#getOrCreateRegistry(theme)

    const grammar = await registry.loadGrammar(language)
    if (!grammar) {
      throw new Error(
        `[renoun] Could not load grammar for language: ${language}`
      )
    }

    let state: StateStack = grammarStates?.[0] ?? INITIAL

    for (const lineText of lines) {
      const lineResult = grammar.tokenizeLine(lineText, state, timeLimit ?? 0)
      state = lineResult.ruleStack
      this.#grammarState = [state]
      yield {
        tokens: lineResult.tokens as Uint32Array,
        lineText,
        ruleStack: lineResult.ruleStack,
        stoppedEarly: lineResult.stoppedEarly,
      }
    }
  }

  /**
   * Returns the last grammar states per theme from the most recent
   * `tokenize`/`stream` call. The array indexes correspond to the `themes`
   * array passed into that call.
   */
  getGrammarState(): GrammarState {
    return this.#grammarState.slice()
  }

  /**
   * Retrieve the active color map for a theme if it has been initialized.
   */
  getColorMap(theme: Theme): string[] {
    const registry = this.#registries.get(theme)
    return registry ? registry.getThemeColors() : []
  }

  /**
   * Retrieve the base foreground color for a theme if it has been initialized.
   */
  getBaseColor(theme: Theme): string | undefined {
    return this.#baseColors.get(theme)
  }
}

function normalizeTokenizeOptions<Theme extends string>(
  themes: Theme[],
  options?: TokenizeOptions
): { grammarStates?: GrammarState; timeLimit?: number } {
  if (options === undefined) {
    return { grammarStates: undefined, timeLimit: undefined }
  }

  const { grammarState, timeLimit } = options

  if (grammarState === undefined) {
    return { grammarStates: undefined, timeLimit }
  }

  if (Array.isArray(grammarState)) {
    const grammarStates = themes.map(
      (_, index) => grammarState[index] ?? INITIAL
    )
    return { grammarStates, timeLimit }
  }

  return { grammarStates: themes.map(() => grammarState), timeLimit }
}

export function createGrammar(
  scopeName: string,
  rawGrammar: any,
  languageId: number,
  embeddedLanguages: any,
  tokenTypes: any,
  balancedBracketSelectors: any,
  grammarRepository: any
) {
  // Expect grammarRepository to satisfy GrammarRepository plus provide a SyncRegistry theme access.
  // If you already have a SyncRegistry instance, pass it as grammarRepository.registry.
  const registry: SyncRegistry =
    grammarRepository?.registry instanceof SyncRegistry
      ? grammarRepository.registry
      : new SyncRegistry()

  const repo: GrammarRepository = {
    lookup: (s: string) => grammarRepository.lookup(s),
    injections: (s: string) => grammarRepository.injections(s),
  }

  return new Grammar(
    scopeName,
    rawGrammar,
    languageId,
    embeddedLanguages,
    tokenTypes,
    balancedBracketSelectors,
    repo,
    registry
  )
}

/**
 * Serialize an entire state stack to an array of frames.
 */
export function serializeStateStack(
  stack: StateStackImplementation | null
): StateStackFrame[] {
  const frames: StateStackFrame[] = []
  let current = stack
  while (current) {
    frames.push(current.toStateStackFrame())
    current = current.parent
  }
  return frames.reverse()
}

/**
 * Deserialize a state stack from an array of frames.
 */
export function deserializeStateStack(
  frames: StateStackFrame[]
): StateStackImplementation | null {
  let stack: StateStackImplementation | null = null
  for (const frame of frames) {
    stack = StateStackImplementation.pushFrame(stack, frame)
  }
  return stack
}
