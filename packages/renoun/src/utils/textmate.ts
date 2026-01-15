const IN_DEBUG_MODE = false as const

export const DebugFlags = {
  inDebugMode: IN_DEBUG_MODE,
} as const

export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface DiagnosticEntry {
  timestamp: number
  level: LogLevel
  category: string
  message: string
  data?: any
}

class TextMateLogger {
  private _enabled: boolean = DebugFlags.inDebugMode
  private level: LogLevel = 'trace'
  private logs: DiagnosticEntry[] = []
  private maxLogs = 10000

  // Categories to filter (empty = all)
  private enabledCategories: Set<string> = new Set([
    'theme-parse',
    'theme-match',
    'trie-match',
    'metadata',
    'tokenize',
    'color-map',
    'scope-stack',
  ])

  private levelPriority: Record<LogLevel, number> = {
    none: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
  }

  // Fast check for hot paths - avoids function call overhead
  get enabled() {
    return this._enabled
  }

  setEnabled(enabled: boolean) {
    this._enabled = enabled
  }

  setLevel(level: LogLevel) {
    this.level = level
  }

  setCategories(categories: string[]) {
    this.enabledCategories = new Set(categories)
  }

  private shouldLog(level: LogLevel, category: string): boolean {
    if (!this._enabled) return false
    if (this.levelPriority[level] > this.levelPriority[this.level]) return false
    if (
      this.enabledCategories.size > 0 &&
      !this.enabledCategories.has(category)
    )
      return false
    return true
  }

  log(level: LogLevel, category: string, message: string, data?: any) {
    if (!this._enabled) return
    if (!this.shouldLog(level, category)) return

    const entry: DiagnosticEntry = {
      timestamp: performance.now(),
      level,
      category,
      message,
      data,
    }

    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Also output to console for immediate visibility
    const prefix = `[TextMate:${category}]`
    const dataStr =
      data !== undefined ? ` ${JSON.stringify(data, null, 2)}` : ''

    switch (level) {
      case 'error':
        console.error(`${prefix} ${message}${dataStr}`)
        break
      case 'warn':
        console.warn(`${prefix} ${message}${dataStr}`)
        break
      case 'info':
        console.info(`${prefix} ${message}${dataStr}`)
        break
      case 'debug':
      case 'trace':
        console.log(`${prefix} ${message}${dataStr}`)
        break
    }
  }

  // Fast no-op methods when disabled - inline the check to avoid argument evaluation
  error(category: string, message: string, data?: any) {
    if (!this._enabled) return
    this.log('error', category, message, data)
  }

  warn(category: string, message: string, data?: any) {
    if (!this._enabled) return
    this.log('warn', category, message, data)
  }

  info(category: string, message: string, data?: any) {
    if (!this._enabled) return
    this.log('info', category, message, data)
  }

  debug(category: string, message: string, data?: any) {
    if (!this._enabled) return
    this.log('debug', category, message, data)
  }

  trace(category: string, message: string, data?: any) {
    if (!this._enabled) return
    this.log('trace', category, message, data)
  }

  getLogs(): DiagnosticEntry[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
  }

  dumpSummary() {
    if (!this._enabled) return
    console.log('\n========== TEXTMATE DIAGNOSTIC SUMMARY ==========')
    console.log(`Total log entries: ${this.logs.length}`)

    const byCategory: Record<string, number> = {}
    const byLevel: Record<string, number> = {}

    for (const entry of this.logs) {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1
    }

    console.log('\nEntries by category:', byCategory)
    console.log('Entries by level:', byLevel)

    const problems = this.logs.filter(
      (e) => e.level === 'error' || e.level === 'warn'
    )
    if (problems.length > 0) {
      console.log(`\nFound ${problems.length} problems:`)
      for (const p of problems.slice(-20)) {
        console.log(`  [${p.level}][${p.category}] ${p.message}`)
      }
    }
    console.log('=================================================\n')
  }
}

export const tmLogger = new TextMateLogger()

export function disposeOnigString(onigString: any) {
  if (typeof onigString?.dispose === 'function') onigString.dispose()
}

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
  const lastSlashBitwise = ~path.lastIndexOf('/') || ~path.lastIndexOf('\\')
  return lastSlashBitwise === 0
    ? path
    : ~lastSlashBitwise === path.length - 1
      ? basename(path.substring(0, path.length - 1))
      : path.substr(1 + ~lastSlashBitwise)
}

const CAPTURE_REGEX = /\$(\d+)|\${(\d+):\/(downcase|upcase)}/g
const CAPTURE_TEST_REGEX = /\$(\d+)|\${(\d+):\/(downcase|upcase)}/

export class RegexSource {
  // Performance: Cache hasCaptures results to avoid repeated regex tests
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
        // Performance: Use charCodeAt instead of string indexing
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

export function isValidHexColor(color: string) {
  return (
    /^#[0-9a-f]{6}$/i.test(color) ||
    /^#[0-9a-f]{8}$/i.test(color) ||
    /^#[0-9a-f]{3}$/i.test(color) ||
    /^#[0-9a-f]{4}$/i.test(color)
  )
}

function isValidCssVarWithHexColorDefault(potentialCssVar: string): boolean {
  const match = /var\((--.*),\s?(#[0-9a-f]+)\)/i.exec(potentialCssVar)
  if (match !== null) {
    const hex = match[2]
    return isValidHexColor(hex)
  }
  return false
}

function colorValueToId(cssValue: string): string {
  const match = /var\((--.*),\s?(#[0-9a-f]+)\)/i.exec(cssValue)
  if (match !== null) {
    return `var(${match[1]}, ${match[2].toUpperCase()})`
  }
  return cssValue.toUpperCase()
}

// Pre-compiled regex for escaping - avoid re-creation
const ESCAPE_REGEXP_CHARS = /[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g
const ESCAPE_REGEXP_TEST = /[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/

export function escapeRegExpCharacters(value: string) {
  // Fast path: if no special characters, return as-is
  if (!ESCAPE_REGEXP_TEST.test(value)) return value
  ESCAPE_REGEXP_CHARS.lastIndex = 0
  return value.replace(ESCAPE_REGEXP_CHARS, '\\$&')
}

export class CachedFn<T, R> {
  private cache = new Map<T, R>()
  private fn: (arg: T) => R
  private maxSize: number
  constructor(fn: (arg: T) => R, maxSize = 0) {
    this.fn = fn
    this.maxSize = maxSize
  }
  get(arg: T): R {
    const cached = this.cache.get(arg)
    if (cached !== undefined) return cached
    const value = this.fn(arg)
    if (this.maxSize > 0 && this.cache.size >= this.maxSize) {
      // Evict oldest entry (first key)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }
    this.cache.set(arg, value)
    return value
  }
  clear() {
    this.cache.clear()
  }
}

// Specialized cache for string keys using plain object
export class StringCachedFn<R> {
  private cache: Record<string, R> = Object.create(null)
  private size = 0
  private fn: (arg: string) => R
  private maxSize: number
  constructor(fn: (arg: string) => R, maxSize = 0) {
    this.fn = fn
    this.maxSize = maxSize
  }
  get(arg: string): R {
    let value = this.cache[arg]
    if (value !== undefined) return value
    value = this.fn(arg)
    if (this.maxSize > 0 && this.size >= this.maxSize) {
      // Simple eviction: clear cache when full
      this.cache = Object.create(null)
      this.size = 0
    }
    this.cache[arg] = value
    this.size++
    return value
  }
  clear() {
    this.cache = Object.create(null)
    this.size = 0
  }
}

let _containsRTLRegex: RegExp

export function containsRTL(value: string) {
  if (!_containsRTLRegex) {
    _containsRTLRegex =
      /(?:[\u05BE\u05C0\u05C3\u05C6\u05D0-\u05F4\u0608\u060B\u060D\u061B-\u064A\u066D-\u066F\u0671-\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u0710\u0712-\u072F\u074D-\u07A5\u07B1-\u07EA\u07F4\u07F5\u07FA\u07FE-\u0815\u081A\u0824\u0828\u0830-\u0858\u085E-\u088E\u08A0-\u08C9\u200F\uFB1D\uFB1F-\uFB28\uFB2A-\uFD3D\uFD50-\uFDC7\uFDF0-\uFDFC\uFE70-\uFEFC]|\uD802[\uDC00-\uDD1B\uDD20-\uDE00\uDE10-\uDE35\uDE40-\uDEE4\uDEEB-\uDF35\uDF40-\uDFFF]|\uD803[\uDC00-\uDD23\uDE80-\uDEA9\uDEAD-\uDF45\uDF51-\uDF81\uDF86-\uDFF6]|\uD83A[\uDC00-\uDCCF\uDD00-\uDD43\uDD4B-\uDFFF]|\uD83B[\uDC00-\uDEBB])/
  }
  return _containsRTLRegex.test(value)
}

export const EncodedTokenAttributes = {
  toBinaryStr(value: number) {
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

  getLanguageId(value: number) {
    return (255 & value) >>> 0
  },

  getTokenType(value: number) {
    return (768 & value) >>> 8
  },

  containsBalancedBrackets(value: number) {
    return !!(1024 & value)
  },

  getFontStyle(value: number) {
    return (30720 & value) >>> 11
  },

  getForeground(value: number) {
    return (16744448 & value) >>> 15
  },

  getBackground(value: number) {
    return (4278190080 & value) >>> 24
  },

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
  len: number
  line = 1
  char = 0
  source: string
  constructor(source: string) {
    this.source = source
    this.len = source.length
  }
}

class JSONToken {
  value: string | null = null
  type: number = 0
  offset = -1
  len = -1
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
  token.len = -1
  token.line = -1
  token.char = -1

  let ch: number
  const src = state.source
  let position = state.position
  const len = state.len
  let line = state.line
  let column = state.char

  while (true) {
    if (position >= len) return false
    ch = src.charCodeAt(position)
    if (ch !== 32 && ch !== 9 && ch !== 13) {
      if (ch !== 10) break
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

  if (ch === 34) {
    // string
    token.type = 1
    position++
    column++
    while (true) {
      if (position >= len) return false
      ch = src.charCodeAt(position)
      position++
      column++
      if (ch === 92) {
        position++
        column++
      } else if (ch === 34) {
        break
      }
    }
    token.value = src
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
  } else if (ch === 91) {
    token.type = 2 // [
    position++
    column++
  } else if (ch === 123) {
    token.type = 3 // {
    position++
    column++
  } else if (ch === 93) {
    token.type = 4 // ]
    position++
    column++
  } else if (ch === 125) {
    token.type = 5 // }
    position++
    column++
  } else if (ch === 58) {
    token.type = 6 // :
    position++
    column++
  } else if (ch === 44) {
    token.type = 7 // ,
    position++
    column++
  } else if (ch === 110) {
    token.type = 8 // null
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 117) return false
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 108) return false
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 108) return false
    position++
    column++
  } else if (ch === 116) {
    token.type = 9 // true
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 114) return false
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 117) return false
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 101) return false
    position++
    column++
  } else if (ch === 102) {
    token.type = 10 // false
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 97) return false
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 108) return false
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 115) return false
    position++
    column++
    ch = src.charCodeAt(position)
    if (ch !== 101) return false
    position++
    column++
  } else {
    token.type = 11 // number
    while (true) {
      if (position >= len) return false
      ch = src.charCodeAt(position)
      if (
        ch !== 46 &&
        !(ch >= 48 && ch <= 57) &&
        ch !== 101 &&
        ch !== 69 &&
        ch !== 45 &&
        ch !== 43
      ) {
        break
      }
      position++
      column++
    }
  }

  token.len = position - token.offset
  if (token.value === null) token.value = src.substr(token.offset, token.len)

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

        if (token.type === 1) {
          currentValue[key] = token.value
          continue
        }
        if (token.type === 8) {
          currentValue[key] = null
          continue
        }
        if (token.type === 9) {
          currentValue[key] = true
          continue
        }
        if (token.type === 10) {
          currentValue[key] = false
          continue
        }
        if (token.type === 11) {
          currentValue[key] = parseFloat(token.value!)
          continue
        }
        if (token.type === 2) {
          const arr: any[] = []
          currentValue[key] = arr
          pushState()
          parserState = 4
          currentValue = arr
          continue
        }
        if (token.type === 3) {
          const obj: any = {}
          if (withLocation) obj.$textmateLocation = token.toLocation(filename)
          currentValue[key] = obj
          pushState()
          parserState = 1
          currentValue = obj
          continue
        }
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

      if (token.type === 1) {
        currentValue.push(token.value)
        continue
      }
      if (token.type === 8) {
        currentValue.push(null)
        continue
      }
      if (token.type === 9) {
        currentValue.push(true)
        continue
      }
      if (token.type === 10) {
        currentValue.push(false)
        continue
      }
      if (token.type === 11) {
        currentValue.push(parseFloat(token.value!))
        continue
      }
      if (token.type === 2) {
        const arr: any[] = []
        currentValue.push(arr)
        pushState()
        parserState = 4
        currentValue = arr
        continue
      }
      if (token.type === 3) {
        const obj: any = {}
        if (withLocation) obj.$textmateLocation = token.toLocation(filename)
        currentValue.push(obj)
        pushState()
        parserState = 1
        currentValue = obj
        continue
      }
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
  const totalLen = sourceText.length
  let pos = 0
  let line = 1
  let column = 0

  function advance(count: number) {
    if (locationKey === null) {
      pos += count
      return
    }
    while (count > 0) {
      if (sourceText.charCodeAt(pos) === 10) {
        pos++
        line++
        column = 0
      } else {
        pos++
        column++
      }
      count--
    }
  }

  function setPos(newPos: number) {
    if (locationKey === null) pos = newPos
    else advance(newPos - pos)
  }

  function skipWhitespace() {
    while (pos < totalLen) {
      const ch = sourceText.charCodeAt(pos)
      if (ch !== 32 && ch !== 9 && ch !== 13 && ch !== 10) break
      advance(1)
    }
  }

  function matchLiteral(lit: string) {
    if (sourceText.substr(pos, lit.length) === lit) {
      advance(lit.length)
      return true
    }
    return false
  }

  function consumeThrough(lit: string) {
    const idx = sourceText.indexOf(lit, pos)
    setPos(idx !== -1 ? idx + lit.length : totalLen)
  }

  function readUntil(lit: string) {
    const idx = sourceText.indexOf(lit, pos)
    if (idx !== -1) {
      const slice = sourceText.substring(pos, idx)
      setPos(idx + lit.length)
      return slice
    }
    const tail = sourceText.substr(pos)
    setPos(totalLen)
    return tail
  }

  // Skip BOM
  if (totalLen > 0 && sourceText.charCodeAt(0) === 65279) pos = 1

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
        pos +
        ': ' +
        message +
        ' ~~~' +
        sourceText.substr(pos, 50) +
        '~~~'
    )
  }

  const openDict = () => {
    if (pendingKey === null) return fail('missing <key>')
    const obj: any = {}
    if (locationKey !== null)
      obj[locationKey] = { filename, line, char: column }
    currentValue[pendingKey] = obj
    pendingKey = null
    pushContainer(1, obj)
  }

  const openArray = () => {
    if (pendingKey === null) return fail('missing <key>')
    const arr: any[] = []
    currentValue[pendingKey] = arr
    pendingKey = null
    pushContainer(2, arr)
  }

  const openDictInArray = () => {
    const obj: any = {}
    if (locationKey !== null)
      obj[locationKey] = { filename, line, char: column }
    currentValue.push(obj)
    pushContainer(1, obj)
  }

  const openArrayInArray = () => {
    const arr: any[] = []
    currentValue.push(arr)
    pushContainer(2, arr)
  }

  function closeDict() {
    if (containerType !== 1) return fail('unexpected </dict>')
    popContainer()
  }

  function closeArray() {
    if (containerType !== 2) return fail('unexpected </array>')
    popContainer()
  }

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

  function parseNumberFloat(value: number) {
    if (isNaN(value)) return fail('cannot parse float')
    assignValue(value)
  }
  function parseNumberInt(value: number) {
    if (isNaN(value)) return fail('cannot parse integer')
    assignValue(value)
  }
  function parseDate(value: Date) {
    assignValue(value)
  }
  function parseData(value: string) {
    assignValue(value)
  }
  function parseBool(value: boolean) {
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

  while (pos < totalLen) {
    skipWhitespace()
    if (pos >= totalLen) break

    const lt = sourceText.charCodeAt(pos)
    advance(1)
    if (lt !== 60) return fail('expected <') // '<'

    if (pos >= totalLen) return fail('unexpected end of input')

    const nextCh = sourceText.charCodeAt(pos)

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
      if (matchLiteral('plist')) {
        consumeThrough('>')
        continue
      }
      if (matchLiteral('dict')) {
        consumeThrough('>')
        closeDict()
        continue
      }
      if (matchLiteral('array')) {
        consumeThrough('>')
        closeArray()
        continue
      }
      return fail('unexpected closed tag')
    }

    const tag = readTagName()
    switch (tag.name) {
      case 'dict': {
        if (containerType === 1) openDict()
        else if (containerType === 2) openDictInArray()
        else {
          currentValue = {}
          if (locationKey !== null)
            currentValue[locationKey] = { filename, line, char: column }
          pushContainer(1, currentValue)
        }
        if (tag.isClosed) closeDict()
        continue
      }

      case 'array': {
        if (containerType === 1) openArray()
        else if (containerType === 2) openArrayInArray()
        else {
          currentValue = []
          pushContainer(2, currentValue)
        }
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
        assignValue(readTagText(tag))
        continue
      case 'real':
        parseNumberFloat(parseFloat(readTagText(tag)))
        continue
      case 'integer':
        parseNumberInt(parseInt(readTagText(tag), 10))
        continue
      case 'date':
        parseDate(new Date(readTagText(tag)))
        continue
      case 'data':
        parseData(readTagText(tag))
        continue
      case 'true':
        readTagText(tag)
        parseBool(true)
        continue
      case 'false':
        readTagText(tag)
        parseBool(false)
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

// Raw grammar parser (json or plist)

export function parseRawGrammar(
  sourceText: string,
  filename: string | null = null
) {
  if (filename !== null && /\.json$/.test(filename)) {
    return DebugFlags.inDebugMode
      ? parseJSON(sourceText, filename, true)
      : JSON.parse(sourceText)
  }
  return DebugFlags.inDebugMode
    ? parseWithLocation(sourceText, filename!, '$textmateLocation')
    : parsePLIST(sourceText)
}

// Theme + scopes

export class Theme {
  private _cachedMatchRoot: StringCachedFn<ThemeTrieElementRule[]>

  private _colorMap: ColorMap
  private _defaults: StyleAttributes
  private _root: ThemeTrieElement

  constructor(
    colorMap: ColorMap,
    defaults: StyleAttributes,
    root: ThemeTrieElement
  ) {
    this._colorMap = colorMap
    this._defaults = defaults
    this._root = root
    this._cachedMatchRoot = new StringCachedFn((scope) =>
      this._root.match(scope)
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
    tmLogger.info(
      'theme-parse',
      `createFromParsedTheme called with ${rules.length} rules`,
      {
        hasColorMap: !!colorMap,
        colorMapSize: colorMap?.length,
      }
    )

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
      let defaultRuleCount = 0
      while (sortedRules.length >= 1 && sortedRules[0].scope === '') {
        const rule = sortedRules.shift()!
        defaultRuleCount++
        if (rule.fontStyle !== -1) defaultFontStyle = rule.fontStyle
        if (rule.foreground !== null) defaultForeground = rule.foreground
        if (rule.background !== null) defaultBackground = rule.background
        if (rule.fontFamily !== null) defaultFontFamily = rule.fontFamily
        if (rule.fontSize !== null) defaultFontSize = rule.fontSize
        if (rule.lineHeight !== null) defaultLineHeight = rule.lineHeight
      }

      tmLogger.info('theme-parse', `Theme defaults extracted`, {
        defaultRuleCount,
        defaultForeground,
        defaultBackground,
        defaultFontStyle,
        remainingRules: sortedRules.length,
      })

      const cm = new ColorMap(colorMap)
      const defaults = new StyleAttributes(
        defaultFontStyle,
        cm.getId(defaultForeground),
        cm.getId(defaultBackground),
        defaultFontFamily,
        defaultFontSize,
        defaultLineHeight
      )

      tmLogger.debug('theme-parse', `Default style attributes`, {
        fontStyle: defaults.fontStyle,
        foregroundId: defaults.foregroundId,
        backgroundId: defaults.backgroundId,
      })

      const root = new ThemeTrieElement(
        new ThemeTrieElementRule(
          0,
          null,
          defaultFontStyle,
          cm.getId(defaultForeground),
          cm.getId(defaultBackground),
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
        const foregroundId = cm.getId(rule.foreground)

        tmLogger.trace('theme-parse', `Inserting rule ${index} into trie`, {
          scope: rule.scope,
          parentScopes: rule.parentScopes,
          foreground: rule.foreground,
          foregroundId,
          fontStyle: rule.fontStyle,
        })

        root.insert(
          0,
          rule.scope,
          rule.parentScopes,
          rule.fontStyle,
          foregroundId,
          cm.getId(rule.background),
          rule.fontFamily,
          rule.fontSize,
          rule.lineHeight
        )
      }

      tmLogger.info('theme-parse', `Theme trie built`, {
        totalRulesInserted: sortedRules.length,
        colorMapFinal: cm.getColorMap().slice(0, 15),
      })

      return new Theme(cm, defaults, root)
    })(rules, colorMap)
  }

  getColorMap() {
    return this._colorMap.getColorMap()
  }

  getDefaults() {
    return this._defaults
  }

  match(scope: ScopeStack) {
    if (scope === null) {
      tmLogger.trace(
        'theme-match',
        'match() called with null scope, returning defaults'
      )
      return this._defaults
    }

    const scopeName = scope.scopeName
    const scopeSegments = scope.getSegments()

    tmLogger.trace('theme-match', `Matching scope: ${scopeName}`, {
      fullScopeStack: scopeSegments,
    })

    const candidateRules = this._cachedMatchRoot.get(scopeName)
    tmLogger.trace(
      'theme-match',
      `Found ${candidateRules.length} candidate rules for "${scopeName}"`,
      {
        candidates: candidateRules.map((r: any) => ({
          parentScopes: r.parentScopes,
          foreground: r.foreground,
          scopeDepth: r.scopeDepth,
        })),
      }
    )

    const match = candidateRules.find((rule: any) => {
      if (rule.parentScopes.length === 0) {
        tmLogger.trace(
          'theme-match',
          `Rule matches (no parent scope requirements)`,
          {
            foreground: rule.foreground,
          }
        )
        return true
      }

      let parent = scope.parent
      const parentScopes = rule.parentScopes
      for (let index = 0; index < parentScopes.length; index++) {
        let selector = parentScopes[index]
        let immediate = false
        if (selector === '>') {
          if (index === parentScopes.length - 1) return false
          selector = parentScopes[++index]
          immediate = true
        }
        while (parent && !scopeMatches(parent.scopeName, selector)) {
          if (immediate) return false
          parent = parent.parent
        }
        if (!parent) {
          tmLogger.trace(
            'theme-match',
            `Rule rejected: parent scope "${selector}" not found in stack`
          )
          return false
        }
        parent = parent.parent
      }
      tmLogger.trace('theme-match', `Rule matches with parent scopes`, {
        parentScopes: rule.parentScopes,
        foreground: rule.foreground,
      })
      return true
    })

    if (match) {
      // If the matched rule has scopeDepth 0, it's the root/default rule.
      // This means there's no SPECIFIC theme rule for this scope.
      // We should return null so the parent's styling is inherited.
      if (match.scopeDepth === 0) {
        tmLogger.debug(
          'theme-match',
          `Only root rule matched for "${scopeName}" (scopeDepth=0), returning null for inheritance`,
          {
            scopeStack: scopeSegments,
          }
        )
        return null
      }

      const attributes = match.getStyleAttributes()
      tmLogger.debug('theme-match', `Match found for "${scopeName}"`, {
        foregroundId: attributes.foregroundId,
        fontStyle: attributes.fontStyle,
        rule: {
          parentScopes: match.parentScopes,
          scopeDepth: match.scopeDepth,
        },
      })
      return attributes
    } else {
      tmLogger.debug(
        'theme-match',
        `No match found for "${scopeName}", returning null`,
        {
          scopeStack: scopeSegments,
          candidateCount: candidateRules.length,
        }
      )
      return null
    }
  }
}

export class ScopeStack {
  parent: ScopeStack | null
  scopeName: string
  private _segments: string[] | null = null

  constructor(parent: ScopeStack | null, scopeName: string) {
    this.parent = parent
    this.scopeName = scopeName
  }

  static push(
    stack: ScopeStack | null,
    scopeNames: string[]
  ): ScopeStack | null {
    for (const scope of scopeNames) stack = new ScopeStack(stack, scope)
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

  // Cached - segments are immutable since ScopeStack is immutable
  getSegments(): string[] {
    if (this._segments !== null) return this._segments
    let cur: ScopeStack | null = this
    const segments: string[] = []
    while (cur) {
      segments.push(cur.scopeName)
      cur = cur.parent
    }
    segments.reverse()
    this._segments = segments
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
    let cur: ScopeStack | null = this
    while (cur && cur !== base) {
      extension.push(cur.scopeName)
      cur = cur.parent
    }
    return cur === base ? extension.reverse() : undefined
  }
}

function scopeMatches(actual: string, expected: string) {
  if (!actual) return false
  if (expected === actual) return true
  const expLen = expected.length
  return (
    actual.length > expLen &&
    actual.charCodeAt(expLen) === 46 && // 46 = '.'
    actual.lastIndexOf(expected, 0) === 0
  ) // faster startsWith
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
  tmLogger.info('theme-parse', 'parseTheme called', { hasTheme: !!theme })

  if (!theme) {
    tmLogger.warn('theme-parse', 'No theme provided, returning empty rules')
    return []
  }

  // Always prefer normalized settings if present, otherwise fallback to tokenColors.
  const settings = theme.settings || theme.tokenColors
  tmLogger.debug('theme-parse', 'Theme settings source', {
    hasSettings: !!theme.settings,
    hasTokenColors: !!theme.tokenColors,
    settingsCount: settings?.length ?? 0,
    isArray: Array.isArray(settings),
  })

  if (!settings || !Array.isArray(settings)) {
    tmLogger.warn('theme-parse', 'No valid settings array in theme')
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
    if (!entry.settings) {
      tmLogger.trace(
        'theme-parse',
        `Entry ${index} has no settings, skipping`,
        { entry }
      )
      continue
    }

    let scopes: string[]
    if (typeof entry.scope === 'string') {
      let scopeStr = entry.scope
      scopeStr = scopeStr.replace(/^[,]+/, '')
      scopeStr = scopeStr.replace(/[,]+$/, '')
      scopes = scopeStr.split(',')
    } else {
      scopes = Array.isArray(entry.scope) ? entry.scope : ['']
    }

    let fontStyle = -1
    if (typeof entry.settings.fontStyle === 'string') {
      fontStyle = 0
      const parts = entry.settings.fontStyle.split(' ')
      for (let j = 0; j < parts.length; j++) {
        switch (parts[j]) {
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
    if (typeof entry.settings.foreground === 'string') {
      if (
        isValidHexColor(entry.settings.foreground) ||
        isValidCssVarWithHexColorDefault(entry.settings.foreground)
      ) {
        foreground = entry.settings.foreground
      } else if (entry.settings.foreground) {
        tmLogger.warn('theme-parse', `Invalid foreground color rejected`, {
          scope: entry.scope,
          foreground: entry.settings.foreground,
          isValidHex: isValidHexColor(entry.settings.foreground),
        })
      }
    }

    let background: string | null = null
    if (typeof entry.settings.background === 'string') {
      if (
        isValidHexColor(entry.settings.background) ||
        isValidCssVarWithHexColorDefault(entry.settings.background)
      ) {
        background = entry.settings.background
      }
    }

    let fontFamily: string | null = ''
    if (typeof entry.settings.fontFamily === 'string')
      fontFamily = entry.settings.fontFamily

    let fontSize: string | null = ''
    if (typeof entry.settings.fontSize === 'string')
      fontSize = entry.settings.fontSize

    let lineHeight = 0
    if (typeof entry.settings.lineHeight === 'number')
      lineHeight = entry.settings.lineHeight

    for (let s = 0; s < scopes.length; s++) {
      const scopeParts = scopes[s].trim().split(' ')
      const scope = scopeParts[scopeParts.length - 1]
      let parentScopes: string[] | null = null
      if (scopeParts.length > 1) {
        parentScopes = scopeParts.slice(0, scopeParts.length - 1)
        parentScopes.reverse()
      }

      tmLogger.trace('theme-parse', `Creating rule ${ruleIndex}`, {
        scope,
        parentScopes,
        foreground,
        fontStyle,
      })

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

  tmLogger.info('theme-parse', `Parsed ${parsed.length} theme rules`, {
    rulesWithForeground: parsed.filter((r) => r.foreground !== null).length,
    rulesWithFontStyle: parsed.filter((r) => r.fontStyle !== -1).length,
    sampleRules: parsed
      .slice(0, 5)
      .map((r) => ({ scope: r.scope, fg: r.foreground })),
  })

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
  private _lastColorId = 0
  private _id2color: string[] = []
  private _color2id: Record<string, number> = Object.create(null)
  private _isFrozen: boolean

  constructor(initialColorMap: string[] | null) {
    if (Array.isArray(initialColorMap)) {
      this._isFrozen = true
      for (
        let index = 0, colorMapLength = initialColorMap.length;
        index < colorMapLength;
        index++
      ) {
        this._color2id[initialColorMap[index]] = index
        this._id2color[index] = initialColorMap[index]
      }
    } else {
      this._isFrozen = false
    }
  }

  getId(color: string | null) {
    if (color === null) {
      tmLogger.trace('color-map', 'getId(null) -> 0')
      return 0
    }
    const normalized = colorValueToId(color)
    // Check both original and normalized to avoid extra processing when already cached
    let id = this._color2id[color]
    if (id !== undefined) {
      tmLogger.trace('color-map', `getId("${color}") -> ${id} (cached)`)
      return id
    }
    id = this._color2id[normalized]
    if (id !== undefined) {
      // Cache the original case too for faster future lookups
      this._color2id[color] = id
      tmLogger.trace(
        'color-map',
        `getId("${color}") -> ${id} (normalized cached)`
      )
      return id
    }
    if (this._isFrozen) {
      tmLogger.error(
        'color-map',
        `Missing color in frozen color map: ${color}`,
        {
          availableColors: Object.keys(this._color2id).slice(0, 20),
        }
      )
      throw new Error(`Missing color in color map - ${color}`)
    }
    id = ++this._lastColorId
    this._color2id[normalized] = id
    this._color2id[color] = id
    this._id2color[id] = normalized
    tmLogger.debug('color-map', `getId("${color}") -> ${id} (new)`, {
      totalColors: this._lastColorId,
    })
    return id
  }

  getColorMap() {
    return this._id2color.slice(0)
  }
}

const EMPTY_PARENT_SCOPES: readonly string[] = Object.freeze([] as string[])

export class ThemeTrieElementRule {
  parentScopes: readonly string[]
  private _cachedStyleAttributes: StyleAttributes | null = null

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
    if (!this._cachedStyleAttributes) {
      this._cachedStyleAttributes = new StyleAttributes(
        this.fontStyle,
        this.foreground,
        this.background,
        this.fontFamily,
        this.fontSize,
        this.lineHeight
      )
    }
    return this._cachedStyleAttributes
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
    // Invalidate cached StyleAttributes since we're changing values
    this._cachedStyleAttributes = null
    if (fontStyle !== -1) this.fontStyle = fontStyle
    if (foreground !== 0) this.foreground = foreground
    if (background !== 0) this.background = background
    if (fontFamily !== '') this.fontFamily = fontFamily
    if (fontSize !== '') this.fontSize = fontSize
    if (lineHeight !== 0) this.lineHeight = lineHeight
  }
}

export class ThemeTrieElement {
  private _mainRule: ThemeTrieElementRule
  private _rulesWithParentScopes: ThemeTrieElementRule[]
  private _children: Record<string, ThemeTrieElement>
  constructor(
    mainRule: ThemeTrieElementRule,
    rulesWithParentScopes: ThemeTrieElementRule[] = [],
    children: Record<string, ThemeTrieElement> = {}
  ) {
    this._mainRule = mainRule
    this._rulesWithParentScopes = rulesWithParentScopes
    this._children = children
  }

  static _cmpBySpecificity(a: ThemeTrieElementRule, b: ThemeTrieElementRule) {
    if (a.scopeDepth !== b.scopeDepth) return b.scopeDepth - a.scopeDepth

    let aIdx = 0
    let bIdx = 0
    while (true) {
      if (a.parentScopes[aIdx] === '>') aIdx++
      if (b.parentScopes[bIdx] === '>') bIdx++
      if (aIdx >= a.parentScopes.length || bIdx >= b.parentScopes.length) break
      const cmp = b.parentScopes[bIdx].length - a.parentScopes[aIdx].length
      if (cmp !== 0) return cmp
      aIdx++
      bIdx++
    }
    return b.parentScopes.length - a.parentScopes.length
  }

  match(scope: string): ThemeTrieElementRule[] {
    tmLogger.trace('trie-match', `ThemeTrieElement.match("${scope}")`)

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

      if (this._children.hasOwnProperty(head)) {
        tmLogger.trace(
          'trie-match',
          `Found child for "${head}", continuing with tail "${tail}"`
        )
        return this._children[head].match(tail)
      } else {
        tmLogger.trace(
          'trie-match',
          `No child for "${head}", available children: ${Object.keys(this._children).join(', ')}`
        )
      }
    }

    const rules = this._rulesWithParentScopes.concat(this._mainRule)
    rules.sort(ThemeTrieElement._cmpBySpecificity)

    tmLogger.trace(
      'trie-match',
      `Returning ${rules.length} rules for scope "${scope}"`,
      {
        rules: rules.map((r) => ({
          foreground: r.foreground,
          scopeDepth: r.scopeDepth,
          parentScopes: r.parentScopes,
        })),
      }
    )

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
    if (this._children.hasOwnProperty(head)) {
      child = this._children[head]
    } else {
      child = new ThemeTrieElement(
        this._mainRule.clone(),
        ThemeTrieElementRule.cloneArr(this._rulesWithParentScopes)
      )
      this._children[head] = child
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
      // Performance: Cache array reference and length
      const rules = this._rulesWithParentScopes
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

      if (fontStyle === -1) fontStyle = this._mainRule.fontStyle
      if (foreground === 0) foreground = this._mainRule.foreground
      if (background === 0) background = this._mainRule.background
      if (fontFamily === '') fontFamily = this._mainRule.fontFamily
      if (fontSize === '') fontSize = this._mainRule.fontSize
      if (lineHeight === 0) lineHeight = this._mainRule.lineHeight

      this._rulesWithParentScopes.push(
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
      this._mainRule.acceptOverwrite(
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

// Basic scope attributes

export class BasicScopeAttributes {
  languageId: number
  tokenType: number
  constructor(languageId: number, tokenType: number) {
    this.languageId = languageId
    this.tokenType = tokenType
  }
}

export class BasicScopeAttributesProvider {
  private _getBasicScopeAttributes: StringCachedFn<BasicScopeAttributes>
  private _defaultAttributes: BasicScopeAttributes
  private _embeddedLanguagesMatcher: ScopeMatcher

  constructor(defaultLanguageId: number, embeddedLanguages: any) {
    this._getBasicScopeAttributes = new StringCachedFn((scopeName: string) => {
      const languageId = this._scopeToLanguage(scopeName)
      const tokenType = this._toStandardTokenType(scopeName)
      return new BasicScopeAttributes(languageId, tokenType)
    })
    this._defaultAttributes = new BasicScopeAttributes(defaultLanguageId, 8)
    this._embeddedLanguagesMatcher = new ScopeMatcher(
      Object.entries(embeddedLanguages || {})
    )
  }

  getDefaultAttributes() {
    return this._defaultAttributes
  }

  getBasicScopeAttributes(scopeName: string | null): BasicScopeAttributes {
    if (scopeName === null)
      return BasicScopeAttributesProvider._NULL_SCOPE_METADATA
    return this._getBasicScopeAttributes.get(scopeName)
  }

  private _scopeToLanguage(scopeName: string) {
    return this._embeddedLanguagesMatcher.match(scopeName) || 0
  }

  private _toStandardTokenType(scopeName: string) {
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
  private values: Map<string, any> | null = null
  private scopesRegExp: RegExp | null = null

  constructor(pairs: any[]) {
    if (pairs.length === 0) {
      this.values = null
      this.scopesRegExp = null
    } else {
      this.values = new Map(pairs)
      const scopes = pairs.map(([scope]: [string, any]) =>
        escapeRegExpCharacters(scope)
      )
      scopes.sort()
      scopes.reverse()
      this.scopesRegExp = new RegExp(`^((${scopes.join(')|(')}))($|\\.)`, '')
    }
  }

  match(scope: string) {
    if (!this.scopesRegExp) return
    const m = scope.match(this.scopesRegExp)
    return m ? this.values!.get(m[1]) : undefined
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
  $location: any
  private _name: string | null
  private _nameIsCapturing: boolean
  private _contentName: string | null
  private _contentNameIsCapturing: boolean

  constructor(
    $location: any,
    id: number,
    name: string | null,
    contentName: string | null
  ) {
    this.$location = $location
    this.id = id
    this._name = name || null
    this._nameIsCapturing = RegexSource.hasCaptures(this._name)
    this._contentName = contentName || null
    this._contentNameIsCapturing = RegexSource.hasCaptures(this._contentName)
  }

  get debugName() {
    const loc = this.$location
      ? `${basename(this.$location.filename)}:${this.$location.line}`
      : 'unknown'
    return `${this.constructor.name}#${this.id} @ ${loc}`
  }

  getName(sourceText: string | null, captures: any[]) {
    if (
      !this._nameIsCapturing ||
      this._name === null ||
      sourceText === null ||
      captures === null
    ) {
      return this._name
    }
    return RegexSource.replaceCaptures(this._name, sourceText, captures)
  }

  getContentName(sourceText: string, captures: any[]) {
    if (this._contentNameIsCapturing && this._contentName !== null) {
      return RegexSource.replaceCaptures(
        this._contentName,
        sourceText,
        captures
      )
    }
    return this._contentName
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
    location: any,
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

export class MatchRule extends Rule {
  private _match: RegExpSource
  captures: any
  private _cachedCompiledPatterns: RegExpSourceList | null = null

  constructor(
    location: any,
    id: number,
    name: string | null,
    match: string,
    captures: any
  ) {
    super(location, id, name, null)
    this._match = new RegExpSource(match, this.id)
    this.captures = captures
  }

  dispose() {
    if (this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns.dispose()
      this._cachedCompiledPatterns = null
    }
  }

  get debugMatchRegExp() {
    return `${this._match.source}`
  }

  collectPatterns(_grammar: any, out: any) {
    out.push(this._match)
  }

  compile(grammar: any, _end: any) {
    return this._getCachedCompiledPatterns(grammar).compile(grammar)
  }

  compileAG(grammar: any, _end: any, isFirstLine: any, atAnchor: any) {
    return this._getCachedCompiledPatterns(grammar).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  private _getCachedCompiledPatterns(grammar: any) {
    if (!this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns = new RegExpSourceList()
      this.collectPatterns(grammar, this._cachedCompiledPatterns)
    }
    return this._cachedCompiledPatterns
  }
}

export class IncludeOnlyRule extends Rule {
  patterns: any[]
  hasMissingPatterns: boolean
  private _cachedCompiledPatterns: RegExpSourceList | null = null

  constructor(
    location: any,
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
    if (this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns.dispose()
      this._cachedCompiledPatterns = null
    }
  }

  collectPatterns(grammar: any, out: any) {
    for (const ruleId of this.patterns)
      grammar.getRule(ruleId).collectPatterns(grammar, out)
  }

  compile(grammar: any, _end: any) {
    return this._getCachedCompiledPatterns(grammar).compile(grammar)
  }

  compileAG(grammar: any, _end: any, isFirstLine: any, atAnchor: any) {
    return this._getCachedCompiledPatterns(grammar).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  private _getCachedCompiledPatterns(grammar: any) {
    if (!this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns = new RegExpSourceList()
      this.collectPatterns(grammar, this._cachedCompiledPatterns)
    }
    return this._cachedCompiledPatterns
  }
}

export class BeginEndRule extends Rule {
  private _begin: RegExpSource
  beginCaptures: any
  private _end: RegExpSource
  endHasBackReferences: boolean
  endCaptures: any
  applyEndPatternLast: boolean
  patterns: any[]
  hasMissingPatterns: boolean
  private _cachedCompiledPatterns: RegExpSourceList | null = null

  constructor(
    location: any,
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
    this._begin = new RegExpSource(begin, this.id)
    this.beginCaptures = beginCaptures
    this._end = new RegExpSource(end || '', -1)
    this.endHasBackReferences = this._end.hasBackReferences
    this.endCaptures = endCaptures
    this.applyEndPatternLast = applyEndPatternLast || false
    this.patterns = patterns.patterns
    this.hasMissingPatterns = patterns.hasMissingPatterns
  }

  dispose() {
    if (this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns.dispose()
      this._cachedCompiledPatterns = null
    }
  }

  get debugBeginRegExp() {
    return `${this._begin.source}`
  }

  get debugEndRegExp() {
    return `${this._end.source}`
  }

  getEndWithResolvedBackReferences(sourceText: string, captures: any[]) {
    return this._end.resolveBackReferences(sourceText, captures)
  }

  collectPatterns(_grammar: any, out: any) {
    out.push(this._begin)
  }

  compile(grammar: any, end: any) {
    return this._getCachedCompiledPatterns(grammar, end).compile(grammar)
  }

  compileAG(grammar: any, end: any, isFirstLine: any, atAnchor: any) {
    return this._getCachedCompiledPatterns(grammar, end).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  private _getCachedCompiledPatterns(grammar: any, _end: any) {
    if (!this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns = new RegExpSourceList()
      for (const patternRuleId of this.patterns) {
        grammar
          .getRule(patternRuleId)
          .collectPatterns(grammar, this._cachedCompiledPatterns)
      }
      if (this.applyEndPatternLast) {
        this._cachedCompiledPatterns.push(
          this._end.hasBackReferences ? this._end.clone() : this._end
        )
      } else {
        this._cachedCompiledPatterns.unshift(
          this._end.hasBackReferences ? this._end.clone() : this._end
        )
      }
    }

    if (this._end.hasBackReferences) {
      if (this.applyEndPatternLast) {
        this._cachedCompiledPatterns.setSource(
          this._cachedCompiledPatterns.length() - 1,
          _end
        )
      } else {
        this._cachedCompiledPatterns.setSource(0, _end)
      }
    }

    return this._cachedCompiledPatterns
  }
}

export class BeginWhileRule extends Rule {
  private _begin: RegExpSource
  beginCaptures: any
  whileCaptures: any
  private _while: RegExpSource
  whileHasBackReferences: boolean
  patterns: any[]
  hasMissingPatterns: boolean
  private _cachedCompiledPatterns: RegExpSourceList | null = null
  private _cachedCompiledWhilePatterns: RegExpSourceList | null = null

  constructor(
    location: any,
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
    this._begin = new RegExpSource(begin, this.id)
    this.beginCaptures = beginCaptures
    this.whileCaptures = whileCaptures
    this._while = new RegExpSource(whilePattern, whileRuleId)
    this.whileHasBackReferences = this._while.hasBackReferences
    this.patterns = patterns.patterns
    this.hasMissingPatterns = patterns.hasMissingPatterns
  }

  dispose() {
    if (this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns.dispose()
      this._cachedCompiledPatterns = null
    }
    if (this._cachedCompiledWhilePatterns) {
      this._cachedCompiledWhilePatterns.dispose()
      this._cachedCompiledWhilePatterns = null
    }
  }

  get debugBeginRegExp() {
    return `${this._begin.source}`
  }

  get debugWhileRegExp() {
    return `${this._while.source}`
  }

  getWhileWithResolvedBackReferences(sourceText: string, captures: any[]) {
    return this._while.resolveBackReferences(sourceText, captures)
  }

  collectPatterns(_grammar: any, out: any) {
    out.push(this._begin)
  }

  compile(grammar: any, _end: any) {
    return this._getCachedCompiledPatterns(grammar).compile(grammar)
  }

  compileAG(grammar: any, _end: any, isFirstLine: any, atAnchor: any) {
    return this._getCachedCompiledPatterns(grammar).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  private _getCachedCompiledPatterns(grammar: any) {
    if (!this._cachedCompiledPatterns) {
      this._cachedCompiledPatterns = new RegExpSourceList()
      for (const patternRuleId of this.patterns) {
        grammar
          .getRule(patternRuleId)
          .collectPatterns(grammar, this._cachedCompiledPatterns)
      }
    }
    return this._cachedCompiledPatterns
  }

  compileWhile(grammar: any, end: any) {
    return this._getCachedCompiledWhilePatterns(grammar, end).compile(grammar)
  }

  compileWhileAG(grammar: any, end: any, isFirstLine: any, atAnchor: any) {
    return this._getCachedCompiledWhilePatterns(grammar, end).compileAG(
      grammar,
      isFirstLine,
      atAnchor
    )
  }

  private _getCachedCompiledWhilePatterns(_grammar: any, end: any) {
    if (!this._cachedCompiledWhilePatterns) {
      this._cachedCompiledWhilePatterns = new RegExpSourceList()
      this._cachedCompiledWhilePatterns.push(
        this._while.hasBackReferences ? this._while.clone() : this._while
      )
    }
    if (this._while.hasBackReferences) {
      this._cachedCompiledWhilePatterns.setSource(0, end || '')
    }
    return this._cachedCompiledWhilePatterns
  }
}

export class RuleFactory {
  // Raw rules are shared objects across grammars (e.g. when one grammar includes another).
  // Storing a numeric `id` on the raw rule object causes cross-grammar corruption because
  // rule IDs are per-Grammar-instance. Keep rule IDs in a per-Grammar WeakMap instead.
  private static _rawRuleIdMaps = new WeakMap<any, WeakMap<object, number>>()

  private static _getRawRuleIdMap(grammar: any): WeakMap<object, number> {
    let map = RuleFactory._rawRuleIdMaps.get(grammar)
    if (!map) {
      map = new WeakMap<object, number>()
      RuleFactory._rawRuleIdMaps.set(grammar, map)
    }
    return map
  }

  static createCaptureRule(
    grammar: any,
    location: any,
    name: any,
    contentName: any,
    retokenizeRuleId: any
  ) {
    return grammar.registerRule(
      (ruleId: number) =>
        new CaptureRule(location, ruleId, name, contentName, retokenizeRuleId)
    )
  }

  static getCompiledRuleId(rawRule: any, grammar: any, repository: any) {
    const rawRuleIdMap = RuleFactory._getRawRuleIdMap(grammar)
    const existingId = rawRuleIdMap.get(rawRule)
    if (!existingId) {
      const id = grammar.registerRule((newId: number) => {
        rawRuleIdMap.set(rawRule, newId)
        try {
          if (rawRule.match) {
            return new MatchRule(
              rawRule.$textmateLocation,
              newId,
              rawRule.name,
              rawRule.match,
              RuleFactory._compileCaptures(
                rawRule.captures,
                grammar,
                repository
              )
            )
          }

          if (typeof rawRule.begin === 'undefined') {
            if (rawRule.repository)
              repository = mergeObjects({}, repository, rawRule.repository)
            let patterns = rawRule.patterns
            if (typeof patterns === 'undefined' && rawRule.include)
              patterns = [{ include: rawRule.include }]
            return new IncludeOnlyRule(
              rawRule.$textmateLocation,
              newId,
              rawRule.name,
              rawRule.contentName,
              RuleFactory._compilePatterns(patterns, grammar, repository)
            )
          }

          if (rawRule.while) {
            return new BeginWhileRule(
              rawRule.$textmateLocation,
              newId,
              rawRule.name,
              rawRule.contentName,
              rawRule.begin,
              RuleFactory._compileCaptures(
                rawRule.beginCaptures || rawRule.captures,
                grammar,
                repository
              ),
              rawRule.while,
              RuleFactory._compileCaptures(
                rawRule.whileCaptures || rawRule.captures,
                grammar,
                repository
              ),
              RuleFactory._compilePatterns(
                rawRule.patterns,
                grammar,
                repository
              )
            )
          }

          return new BeginEndRule(
            rawRule.$textmateLocation,
            newId,
            rawRule.name,
            rawRule.contentName,
            rawRule.begin,
            RuleFactory._compileCaptures(
              rawRule.beginCaptures || rawRule.captures,
              grammar,
              repository
            ),
            rawRule.end,
            RuleFactory._compileCaptures(
              rawRule.endCaptures || rawRule.captures,
              grammar,
              repository
            ),
            rawRule.applyEndPatternLast,
            RuleFactory._compilePatterns(rawRule.patterns, grammar, repository)
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

  static _compileCaptures(captures: any, grammar: any, repository: any) {
    const out: any[] = []
    if (captures) {
      let maxCaptureId = 0
      for (const key in captures) {
        if (key === '$textmateLocation') continue
        const number = parseInt(key, 10)
        if (number > maxCaptureId) maxCaptureId = number
      }
      for (let index = 0; index <= maxCaptureId; index++) out[index] = null

      for (const captureIdStr in captures) {
        if (captureIdStr === '$textmateLocation') continue
        const captureId = parseInt(captureIdStr, 10)

        let retokenizeRuleId = 0
        if (captures[captureIdStr].patterns) {
          retokenizeRuleId = RuleFactory.getCompiledRuleId(
            captures[captureIdStr],
            grammar,
            repository
          )
        }

        out[captureId] = RuleFactory.createCaptureRule(
          grammar,
          captures[captureIdStr].$textmateLocation,
          captures[captureIdStr].name,
          captures[captureIdStr].contentName,
          retokenizeRuleId
        )
      }
    }
    return out
  }

  static _compilePatterns(patterns: any, grammar: any, repository: any) {
    const compiled: any[] = []
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
          switch (includeRef.kind) {
            case 0:
            case 1:
              ruleId = RuleFactory.getCompiledRuleId(
                repository[pat.include],
                grammar,
                repository
              )
              break
            case 2: {
              const target = repository[includeRef.ruleName]
              if (target) {
                ruleId = RuleFactory.getCompiledRuleId(
                  target,
                  grammar,
                  repository
                )
              }
              break
            }
            case 3:
            case 4: {
              const scopeName = includeRef.scopeName
              const ruleName =
                includeRef.kind === 4 ? includeRef.ruleName : null
              const external = grammar.getExternalGrammar(scopeName, repository)
              if (external) {
                if (ruleName) {
                  const repoRule = external.repository[ruleName]
                  if (repoRule)
                    ruleId = RuleFactory.getCompiledRuleId(
                      repoRule,
                      grammar,
                      external.repository
                    )
                } else {
                  ruleId = RuleFactory.getCompiledRuleId(
                    external.repository.$self,
                    grammar,
                    external.repository
                  )
                }
              }
              break
            }
          }
        } else {
          ruleId = RuleFactory.getCompiledRuleId(pat, grammar, repository)
        }

        if (ruleId !== -1) {
          const rule = grammar._ruleId2rule[ruleId]

          // Only check for optimization if the rule is already fully registered.
          // If !rule, it means it is currently being compiled (recursion).
          // We MUST add the ID, otherwise the recursion chain is broken.
          if (rule) {
            let skip = false
            if (
              (rule instanceof IncludeOnlyRule ||
                rule instanceof BeginEndRule ||
                rule instanceof BeginWhileRule) &&
              rule.hasMissingPatterns &&
              rule.patterns.length === 0
            ) {
              skip = true
            }
            if (skip) continue
          }

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
  // Performance: Lazy initialization - undefined means not computed yet, null means no anchors
  private _anchorCache:
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
          // backslash, use charCodeAt
          const next = source.charCodeAt(index + 1)
          if (next === 122) {
            // 'z'
            parts.push(source.substring(start, index))
            parts.push('$(?!\\n)(?<!\\n)')
            start = index + 2
          } else if (next === 65 || next === 71) {
            // 'A' or 'G'
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
    // Performance: Don't build anchor cache in constructor, defer to first use
  }

  clone() {
    return new RegExpSource(this.source, this.ruleId)
  }

  setSource(nextSource: string) {
    if (this.source !== nextSource) {
      this.source = nextSource
      // Invalidate anchor cache
      if (this.hasAnchor) this._anchorCache = undefined
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

  // Performance: Lazy build of anchor cache
  private _getAnchorCache() {
    if (this._anchorCache === undefined) {
      this._anchorCache = this.hasAnchor ? this._buildAnchorCache() : null
    }
    return this._anchorCache
  }

  private _buildAnchorCache() {
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
      const cache = this._getAnchorCache()
      if (cache) {
        if (isFirstLine) return atAnchor ? cache.A1_G1 : cache.A1_G0
        return atAnchor ? cache.A0_G1 : cache.A0_G0
      }
    }
    return this.source
  }
}

export class RegExpSourceList {
  private _items: RegExpSource[] = []
  private _hasAnchors = false
  private _cached: CompiledRule | null = null
  private _anchorCache: {
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
    this._disposeCaches()
  }

  private _disposeCaches() {
    if (this._cached) {
      this._cached.dispose()
      this._cached = null
    }
    for (const key of ['A0_G0', 'A0_G1', 'A1_G0', 'A1_G1'] as const) {
      if (this._anchorCache[key]) {
        this._anchorCache[key]!.dispose()
        this._anchorCache[key] = null
      }
    }
  }

  push(value: RegExpSource) {
    this._items.push(value)
    this._hasAnchors = this._hasAnchors || value.hasAnchor
  }

  unshift(value: RegExpSource) {
    this._items.unshift(value)
    this._hasAnchors = this._hasAnchors || value.hasAnchor
  }

  length() {
    return this._items.length
  }

  setSource(index: number, source: string) {
    if (this._items[index].source !== source) {
      this._disposeCaches()
      this._items[index].setSource(source)
    }
  }

  compile(grammar: any) {
    if (!this._cached) {
      const sources = this._items.map((r) => r.source)
      this._cached = new CompiledRule(
        grammar,
        sources,
        this._items.map((r) => r.ruleId)
      )
    }
    return this._cached
  }

  compileAG(grammar: any, isFirstLine: boolean, atAnchor: boolean) {
    if (this._hasAnchors) {
      const key = isFirstLine
        ? atAnchor
          ? 'A1_G1'
          : 'A1_G0'
        : atAnchor
          ? 'A0_G1'
          : 'A0_G0'

      if (!this._anchorCache[key])
        this._anchorCache[key] = this._resolveAnchors(
          grammar,
          isFirstLine,
          atAnchor
        )
      return this._anchorCache[key]!
    }
    return this.compile(grammar)
  }

  private _resolveAnchors(
    grammar: any,
    isFirstLine: boolean,
    atAnchor: boolean
  ) {
    const sources = this._items.map((r) =>
      r.resolveAnchors(isFirstLine, atAnchor)
    )
    return new CompiledRule(
      grammar,
      sources,
      this._items.map((r) => r.ruleId)
    )
  }
}

export class CompiledRule {
  scanner: any
  public regExps: string[]
  public rules: number[]
  constructor(grammar: any, regExps: string[], rules: number[]) {
    this.regExps = regExps
    this.rules = rules
    this.scanner = grammar.createOnigScanner(regExps)
  }
  dispose() {
    if (typeof this.scanner.dispose === 'function') this.scanner.dispose()
  }
  toString() {
    const lines: string[] = []
    for (let index = 0; index < this.rules.length; index++) {
      lines.push('   - ' + this.rules[index] + ': ' + this.regExps[index])
    }
    return lines.join('\n')
  }
  findNextMatchSync(onigString: any, start: any, options: any) {
    const match = this.scanner.findNextMatchSync(onigString, start, options)
    return match
      ? {
          ruleId: this.rules[match.index],
          captureIndices: match.captureIndices,
        }
      : null
  }
}

// Dependencies & includes

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
  private _references: any[] = []
  private _seenReferenceKeys = new Set<string>()
  visitedRule = new Set<any>()
  get references() {
    return this._references
  }
  add(ref: any) {
    const key = ref.toKey()
    if (!this._seenReferenceKeys.has(key)) {
      this._seenReferenceKeys.add(key)
      this._references.push(ref)
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

    for (const ref of current)
      processDependency(ref, this.initialScopeName, this.repo, collector)

    for (const ref of collector.references) {
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
      { ...ctx, repository: ctx.selfGrammar.repository },
      collector
    )
  }
  if (ctx.selfGrammar.injections) {
    processRulePatterns(
      Object.values(ctx.selfGrammar.injections),
      { ...ctx, repository: ctx.selfGrammar.repository },
      collector
    )
  }
}

function processRulePatterns(
  patterns: any[],
  ctx: any,
  collector: ExternalReferenceCollector
) {
  for (const rule of patterns) {
    if (collector.visitedRule.has(rule)) continue
    collector.visitedRule.add(rule)

    const mergedRepo = rule.repository
      ? mergeObjects({}, ctx.repository, rule.repository)
      : ctx.repository

    if (Array.isArray(rule.patterns)) {
      processRulePatterns(
        rule.patterns,
        { ...ctx, repository: mergedRepo },
        collector
      )
    }

    const include = rule.include
    if (!include) continue

    const parsed = parseInclude(include)
    switch (parsed.kind) {
      case 0:
        processSelf({ ...ctx, selfGrammar: ctx.baseGrammar }, collector)
        break
      case 1:
        processSelf(ctx, collector)
        break
      case 2:
        processRepositoryRule(
          parsed.ruleName,
          { ...ctx, repository: mergedRepo },
          collector
        )
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
          const nextCtx = {
            baseGrammar: ctx.baseGrammar,
            selfGrammar: resolved,
            repository: mergedRepo,
          }
          if (parsed.kind === 4)
            processRepositoryRule(parsed.ruleName, nextCtx, collector)
          else processSelf(nextCtx, collector)
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

// Tokenization core

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
  for (const m of matchers) {
    const ruleId = RuleFactory.getCompiledRuleId(
      rawRule,
      grammar,
      ctx.repository
    )
    injections.push({
      debugSelector: selector,
      matcher: m.matcher,
      ruleId,
      grammar,
      priority: m.priority,
    })
  }
}

export function _tokenizeString(
  grammar: Grammar,
  onigLine: any, // OnigString
  isFirstLine: boolean,
  linePosition: number,
  stack: StateStackImplementation,
  lineTokens: LineTokens,
  lineFonts: LineFonts,
  checkWhileConditions: boolean,
  timeLimitMs: number
) {
  const produce = (state: StateStackImplementation, pos: number) => {
    lineTokens.produce(state, pos)
    lineFonts.produce(state, pos)
  }

  const lineLength = onigLine.content.length
  let done = false
  let anchorPosition = -1

  // Loop guard for “endless loop - case 3”.
  // Track states we’ve seen at the current linePosition. If we revisit the exact same
  // (stack, anchorPosition) at the same position, we’re in a cycle and must advance.
  let _loopGuardLinePosition = -1
  const _loopGuardSeen = new Map<any, Set<number>>()

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
        pos: number
      ) => {
        lineTokens.produce(state, pos)
        lineFonts.produce(state, pos)
      }

      let anchorPosition = stack.beginRuleCapturedEOL
        ? 0
        : stack.getAnchorPosition()
      const whileRules: Array<{
        rule: BeginWhileRule
        stack: StateStackImplementation
      }> = []

      for (let s: StateStackImplementation | null = stack; s; s = s.pop()) {
        const rule = s.getRule(grammar)
        if (rule instanceof BeginWhileRule) whileRules.push({ rule, stack: s })
      }

      for (let entry = whileRules.pop(); entry; entry = whileRules.pop()) {
        const { ruleScanner, findOptions } = prepareRuleSearch(
          entry.rule,
          grammar,
          entry.stack.endRule,
          isFirstLine,
          linePosition === anchorPosition
        )

        const match = ruleScanner.findNextMatchSync(
          lineText,
          linePosition,
          findOptions
        )
        if (DebugFlags.inDebugMode) {
          console.log('  scanning for while rule')
          console.log(ruleScanner.toString())
        }

        if (!match) {
          if (DebugFlags.inDebugMode)
            console.log(
              '  popping ' +
                entry.rule.debugName +
                ' - ' +
                entry.rule.debugWhileRegExp
            )
          stack = entry.stack.pop()!
          break
        }

        if (match.ruleId !== whileRuleId) {
          stack = entry.stack.pop()!
          break
        }

        if (match.captureIndices && match.captureIndices.length) {
          produceFromStack(entry.stack, match.captureIndices[0].start)
          handleCaptures(
            grammar,
            lineText,
            isFirstLine,
            entry.stack,
            lineTokens,
            lineFonts,
            entry.rule.whileCaptures,
            match.captureIndices
          )
          produceFromStack(entry.stack, match.captureIndices[0].end)

          anchorPosition = match.captureIndices[0].end
          if (match.captureIndices[0].end > linePosition) {
            linePosition = match.captureIndices[0].end
            isFirstLine = false
          }
        }
      }

      return { stack, linePosition, anchorPosition, isFirstLine }
    })(
      grammar,
      onigLine.content,
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
      _loopGuardLinePosition = linePosition
    }

    let _anchors = _loopGuardSeen.get(stack)
    if (!_anchors) {
      _anchors = new Set<number>()
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

      // End of line; finish.
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
    if (DebugFlags.inDebugMode) {
      console.log('')
      console.log(
        `@@scanNext ${linePosition}: |${onigLine.content
          .substr(linePosition)
          .replace(/\n$/, '\\n')}|`
      )
    }

    const match = (function matchRuleOrInjection(
      grammar: Grammar,
      onigLine: any,
      isFirstLine: boolean,
      linePosition: number,
      stack: StateStackImplementation,
      anchorPosition: number
    ) {
      const ruleMatch = (function matchRule(
        grammar: Grammar,
        onigLine: any,
        isFirstLine: boolean,
        linePosition: number,
        stack: StateStackImplementation,
        anchorPosition: number
      ) {
        const currentRule = stack.getRule(grammar)
        const { ruleScanner, findOptions } = prepareRuleSearch(
          currentRule,
          grammar,
          stack.endRule,
          isFirstLine,
          linePosition === anchorPosition
        )

        let start = 0
        if (DebugFlags.inDebugMode) start = performance.now()
        const match = ruleScanner.findNextMatchSync(
          onigLine,
          linePosition,
          findOptions
        )

        if (DebugFlags.inDebugMode) {
          const elapsed = performance.now() - start
          if (elapsed > 5)
            console.warn(
              `Rule ${currentRule.debugName} (${currentRule.id}) matching took ${elapsed} against '${onigLine}'`
            )
          console.log(
            `  scanning for (linePosition: ${linePosition}, anchorPosition: ${anchorPosition})`
          )
          console.log(ruleScanner.toString())
          if (match)
            console.log(
              `matched rule id: ${match.ruleId} from ${match.captureIndices[0].start} to ${match.captureIndices[0].end}`
            )
        }

        return match
          ? {
              captureIndices: match.captureIndices,
              matchedRuleId: match.ruleId,
            }
          : null
      })(grammar, onigLine, isFirstLine, linePosition, stack, anchorPosition)

      const injections = grammar.getInjections()
      if (injections.length === 0) return ruleMatch

      const injectionMatch = (function matchInjections(
        injections: any[],
        grammar: Grammar,
        onigLine: any,
        isFirstLine: boolean,
        linePosition: number,
        stack: StateStackImplementation,
        anchorPosition: number
      ) {
        let bestRuleId: number | undefined
        let bestStart = Number.MAX_VALUE
        let bestCaptures: any = null
        let bestPriority = 0

        const scopeNames = stack.contentNameScopesList.getScopeNames()

        for (let index = 0; index < injections.length; index++) {
          const injection = injections[index]
          if (!injection.matcher(scopeNames)) continue
          const rule = grammar.getRule(injection.ruleId)
          const { ruleScanner, findOptions } = prepareRuleSearch(
            rule,
            grammar,
            null,
            isFirstLine,
            linePosition === anchorPosition
          )
          const match = ruleScanner.findNextMatchSync(
            onigLine,
            linePosition,
            findOptions
          )
          if (!match) continue

          if (DebugFlags.inDebugMode) {
            console.log(`  matched injection: ${injection.debugSelector}`)
            console.log(ruleScanner.toString())
          }

          const start = match.captureIndices[0].start
          if (start > bestStart) continue
          if (start === bestStart && injection.priority <= bestPriority)
            continue

          bestStart = start
          bestCaptures = match.captureIndices
          bestRuleId = match.ruleId
          bestPriority = injection.priority
          if (bestStart === linePosition && bestPriority === 1) break
        }

        return bestCaptures
          ? {
              priorityMatch: bestPriority === -1,
              captureIndices: bestCaptures,
              matchedRuleId: bestRuleId!,
            }
          : null
      })(
        injections,
        grammar,
        onigLine,
        isFirstLine,
        linePosition,
        stack,
        anchorPosition
      )

      if (!injectionMatch) return ruleMatch
      if (!ruleMatch) return injectionMatch

      const ruleStart = ruleMatch.captureIndices[0].start
      const injStart = injectionMatch.captureIndices[0].start
      return injStart < ruleStart ||
        (injectionMatch.priorityMatch && injStart === ruleStart)
        ? injectionMatch
        : ruleMatch
    })(grammar, onigLine, isFirstLine, linePosition, stack, anchorPosition)

    if (!match) {
      if (DebugFlags.inDebugMode) console.log('  no more matches.')
      produce(stack, lineLength)
      done = true
      return
    }

    const captureIndices = match.captureIndices
    const matchedRuleId = match.matchedRuleId

    const hasAdvanced =
      !!(captureIndices && captureIndices.length > 0) &&
      captureIndices[0].end > linePosition

    if (matchedRuleId === endRuleId) {
      const rule = stack.getRule(grammar) as BeginEndRule
      if (DebugFlags.inDebugMode)
        console.log('  popping ' + rule.debugName + ' - ' + rule.debugEndRegExp)

      produce(stack, captureIndices[0].start)
      stack = stack.withContentNameScopesList(stack.nameScopesList)
      handleCaptures(
        grammar,
        onigLine.content,
        isFirstLine,
        stack,
        lineTokens,
        lineFonts,
        rule.endCaptures,
        captureIndices
      )
      produce(stack, captureIndices[0].end)

      const popped = stack
      stack = stack.parent!
      anchorPosition = popped.getAnchorPosition()

      // endless loop guard (case 1): pushed & popped without advancing
      if (!hasAdvanced && popped.getEnterPosition() === linePosition) {
        if (DebugFlags.inDebugMode) {
          console.error(
            '[1] - Grammar is in an endless loop - Grammar pushed & popped a rule without advancing'
          )
        }
        // Assume this was a grammar author mistake; restore and stop
        stack = popped
        produce(stack, lineLength)
        done = true
        return
      }
    } else {
      const rule = grammar.getRule(matchedRuleId)

      produce(stack, captureIndices[0].start)

      const parentState = stack
      const name = rule.getName(onigLine.content, captureIndices)
      const pushedNameScopes = stack.contentNameScopesList.pushAttributed(
        name,
        grammar
      )
      stack = stack.push(
        matchedRuleId,
        linePosition,
        anchorPosition,
        captureIndices[0].end === lineLength,
        null,
        pushedNameScopes,
        pushedNameScopes
      )

      if (rule instanceof BeginEndRule) {
        if (DebugFlags.inDebugMode)
          console.log(
            '  pushing ' + rule.debugName + ' - ' + rule.debugBeginRegExp
          )

        handleCaptures(
          grammar,
          onigLine.content,
          isFirstLine,
          stack,
          lineTokens,
          lineFonts,
          rule.beginCaptures,
          captureIndices
        )
        produce(stack, captureIndices[0].end)

        anchorPosition = captureIndices[0].end

        const contentName = rule.getContentName(
          onigLine.content,
          captureIndices
        )
        const pushedContentScopes = pushedNameScopes.pushAttributed(
          contentName,
          grammar
        )
        stack = stack.withContentNameScopesList(pushedContentScopes)

        if (rule.endHasBackReferences) {
          stack = stack.withEndRule(
            rule.getEndWithResolvedBackReferences(
              onigLine.content,
              captureIndices
            )
          )
        }

        if (!hasAdvanced && parentState.hasSameRuleAs(stack)) {
          if (DebugFlags.inDebugMode)
            console.error(
              '[2] - Grammar is in an endless loop - Grammar pushed the same rule without advancing'
            )
          stack = stack.pop()!
          produce(stack, lineLength)
          done = true
          return
        }
      } else if (rule instanceof BeginWhileRule) {
        if (DebugFlags.inDebugMode) console.log('  pushing ' + rule.debugName)

        handleCaptures(
          grammar,
          onigLine.content,
          isFirstLine,
          stack,
          lineTokens,
          lineFonts,
          rule.beginCaptures,
          captureIndices
        )
        produce(stack, captureIndices[0].end)

        anchorPosition = captureIndices[0].end

        const contentName = rule.getContentName(
          onigLine.content,
          captureIndices
        )
        const pushedContentScopes = pushedNameScopes.pushAttributed(
          contentName,
          grammar
        )
        stack = stack.withContentNameScopesList(pushedContentScopes)

        if (rule.whileHasBackReferences) {
          stack = stack.withEndRule(
            rule.getWhileWithResolvedBackReferences(
              onigLine.content,
              captureIndices
            )
          )
        }

        if (!hasAdvanced && parentState.hasSameRuleAs(stack)) {
          if (DebugFlags.inDebugMode)
            console.error(
              '[3] - Grammar is in an endless loop - Grammar pushed the same rule without advancing'
            )
          stack = stack.pop()!
          produce(stack, lineLength)
          done = true
          return
        }
      } else {
        if (DebugFlags.inDebugMode)
          console.log(
            '  matched ' +
              rule.debugName +
              ' - ' +
              (rule as MatchRule).debugMatchRegExp
          )

        handleCaptures(
          grammar,
          onigLine.content,
          isFirstLine,
          stack,
          lineTokens,
          lineFonts,
          (rule as MatchRule).captures,
          captureIndices
        )
        produce(stack, captureIndices[0].end)

        stack = stack.pop()!

        if (!hasAdvanced) {
          if (DebugFlags.inDebugMode)
            console.error(
              '[4] - Grammar is in an endless loop - Grammar is not advancing, nor is it pushing/popping'
            )
          stack = stack.safePop()
          produce(stack, lineLength)
          done = true
          return
        }
      }
    }

    if (captureIndices[0].end > linePosition) {
      linePosition = captureIndices[0].end
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
) {
  // Use the anchor-resolving (AG) path since our JS-based OnigScanner
  // doesn't support Oniguruma's FindOption flags (\A/\G semantics).
  return {
    ruleScanner: rule.compileAG(grammar, endRule, isFirstLine, atAnchor),
    findOptions: 0,
  }
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
  captureIndices: any[]
) {
  const produceFromScopes = (scopes: AttributedScopeStack, pos: number) => {
    lineTokens.produceFromScopes(scopes, pos)
    lineFonts.produceFromScopes(scopes, pos)
  }
  const produceFromStack = (state: StateStackImplementation, pos: number) => {
    lineTokens.produce(state, pos)
    lineFonts.produce(state, pos)
  }

  if (!captureRules || captureRules.length === 0) return

  const len = Math.min(captureRules.length, captureIndices.length)
  const localStack: LocalStackElement[] = []
  let localStackLen = 0
  const lineEnd = captureIndices[0].end

  for (let index = 0; index < len; index++) {
    const captureRuleId = captureRules[index]
    if (captureRuleId === null) continue

    const capture = captureIndices[index]
    if (!capture || capture.length === 0) continue
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
      const name = captureRule.getName(lineText, captureIndices)
      const nameScopes = stack.contentNameScopesList.pushAttributed(
        name,
        grammar
      )
      const contentName = captureRule.getContentName(lineText, captureIndices)
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

      const nestedOnig = grammar.createOnigString(
        lineText.substring(0, capture.end)
      )
      _tokenizeString(
        grammar,
        nestedOnig,
        isFirstLine && capture.start === 0,
        capture.start,
        nestedStack,
        lineTokens,
        lineFonts,
        false,
        0
      )
      disposeOnigString(nestedOnig)
      continue
    }

    const name = captureRule.getName(lineText, captureIndices)
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

// Attributed scope stacks + token emission

export class AttributedScopeStack {
  private _cachedScopeNames: string[] | null = null

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
      tmLogger.trace(
        'scope-stack',
        'pushAttributed called with null/empty scope, returning this'
      )
      return this
    }

    tmLogger.debug('scope-stack', `pushAttributed("${scopeName}")`, {
      currentStack: this.getScopeNames(),
    })

    // Fast path: most scope names don't have spaces
    const spaceIdx = scopeName.indexOf(' ')
    if (spaceIdx === -1) {
      const metadata = grammar.getMetadataForScope(scopeName, this)
      const result = new AttributedScopeStack(
        this,
        scopeName,
        metadata.tokenAttributes,
        metadata.styleAttributes
      )

      tmLogger.debug(
        'scope-stack',
        `Created new AttributedScopeStack for "${scopeName}"`,
        {
          tokenAttributes: metadata.tokenAttributes,
          foregroundId: EncodedTokenAttributes.getForeground(
            metadata.tokenAttributes
          ),
          fontStyle: EncodedTokenAttributes.getFontStyle(
            metadata.tokenAttributes
          ),
        }
      )

      return result
    }
    // Slow path: scopeName has multiple space-separated scopes
    tmLogger.trace('scope-stack', `Processing multi-scope: "${scopeName}"`)
    let currentStack: AttributedScopeStack = this
    let start = 0
    const scopeNameLength = scopeName.length
    while (start < scopeNameLength) {
      // Skip leading spaces
      while (start < scopeNameLength && scopeName.charCodeAt(start) === 32)
        start++
      if (start >= scopeNameLength) break
      // Find end of this scope
      let end = start + 1
      while (end < scopeNameLength && scopeName.charCodeAt(end) !== 32) end++
      const currentScopeName = scopeName.substring(start, end)
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
    if (this._cachedScopeNames) return this._cachedScopeNames

    const out: string[] = []
    let cur: AttributedScopeStack | null = this
    while (cur) {
      if (cur.scopeName) out.push(cur.scopeName)
      cur = cur.parent
    }
    out.reverse()
    this._cachedScopeNames = out
    return out
  }
}

export class LineTokens {
  // output is [startIndex0, metadata0, startIndex1, metadata1, ...]
  private tokens: number[] = []
  private tokensLen = 0
  private lastPosition = 0
  private lastMetadata = 0

  private emitBinaryTokens: boolean
  constructor(emitBinaryTokens: boolean) {
    this.emitBinaryTokens = emitBinaryTokens
  }

  reset() {
    this.tokensLen = 0
    this.lastPosition = 0
    this.lastMetadata = 0
  }

  produce(stack: StateStackImplementation, endPosition: number) {
    this.produceFromScopes(stack.contentNameScopesList, endPosition)
  }

  produceFromScopes(scopes: AttributedScopeStack, endPosition: number) {
    if (endPosition < this.lastPosition) {
      tmLogger.trace(
        'tokenize',
        `produceFromScopes skipped (endPos ${endPosition} <= lastPos ${this.lastPosition})`
      )
      return
    }
    const metadata = scopes.tokenAttributes >>> 0

    const foreground = EncodedTokenAttributes.getForeground(metadata)
    const fontStyle = EncodedTokenAttributes.getFontStyle(metadata)

    tmLogger.debug(
      'tokenize',
      `produceFromScopes: position ${this.lastPosition}-${endPosition}`,
      {
        scopeNames: scopes.getScopeNames(),
        metadata,
        foregroundId: foreground,
        fontStyle,
        isNewToken: this.tokensLen === 0 || this.lastMetadata !== metadata,
      }
    )

    if (this.tokensLen === 0 || this.lastMetadata !== metadata) {
      // Grow array if needed, reuse existing slots
      if (this.tokensLen + 2 > this.tokens.length) {
        // Grow by 32 slots at a time to reduce reallocations
        this.tokens.length = this.tokens.length + 32
      }
      this.tokens[this.tokensLen++] = this.lastPosition
      this.tokens[this.tokensLen++] = metadata

      tmLogger.trace(
        'tokenize',
        `Emitted token at index ${this.tokensLen - 2}`,
        {
          startPos: this.lastPosition,
          metadata,
          foregroundId: foreground,
        }
      )
    }
    this.lastPosition = endPosition
    this.lastMetadata = metadata
  }

  finalize(lineLength: number) {
    // Ensure last token ends at lineLength by just updating lastPos.
    this.lastPosition = lineLength
    // Trim to actual size
    const result = this.tokens.slice(0, this.tokensLen)
    return this.emitBinaryTokens ? new Uint32Array(result) : result
  }
}

export class LineFonts {
  // Optional: for variable fonts / family/size/lineHeight rendering, keep simple.
  // Mirrors LineTokens but holds font overrides. If you don't use it, it's harmless.
  private spans: Array<{
    start: number
    fontFamily: string | null
    fontSize: string | null
    lineHeight: number | null
  }> = []
  private lastPosition = 0
  private _lastFontFamily: string | null = null
  private _lastFontSize: string | null = null
  private _lastLineHeight: number | null = null

  reset() {
    this.spans = []
    this.lastPosition = 0
    this._lastFontFamily = null
    this._lastFontSize = null
    this._lastLineHeight = null
  }

  produce(stack: StateStackImplementation, endPosition: number) {
    this.produceFromScopes(stack.contentNameScopesList, endPosition)
  }

  produceFromScopes(scopes: AttributedScopeStack, endPosition: number) {
    if (endPosition <= this.lastPosition) return

    const fontFamily = this.getFontFamily(scopes)
    const fontSize = this.getFontSize(scopes)
    const lineHeight = this.getLineHeight(scopes)

    // If none are set anywhere in the parent chain, do nothing.
    if (!fontFamily && !fontSize && !lineHeight) {
      this.lastPosition = endPosition
      return
    }

    if (
      fontFamily !== this._lastFontFamily ||
      fontSize !== this._lastFontSize ||
      lineHeight !== this._lastLineHeight
    ) {
      this.spans.push({
        start: this.lastPosition,
        fontFamily: fontFamily || null,
        fontSize: fontSize || null,
        lineHeight: lineHeight || null,
      })
      this._lastFontFamily = fontFamily || null
      this._lastFontSize = fontSize || null
      this._lastLineHeight = lineHeight || null
    }

    this.lastPosition = endPosition
  }

  finalize(_lineLength: number) {
    return this.spans
  }

  private getFontFamily(scopesList: AttributedScopeStack): string | null {
    return this.getAttribute(scopesList, (styleAttributes) => {
      return styleAttributes.fontFamily
    })
  }

  private getFontSize(scopesList: AttributedScopeStack): string | null {
    return this.getAttribute(scopesList, (styleAttributes) => {
      return styleAttributes.fontSize
    })
  }

  private getLineHeight(scopesList: AttributedScopeStack): number | null {
    return this.getAttribute(scopesList, (styleAttributes) => {
      return styleAttributes.lineHeight
    })
  }

  private getAttribute<T>(
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

    return this.getAttribute(scopesList.parent, getAttr)
  }
}

export class StateStackImplementation {
  parent: StateStackImplementation | null
  ruleId: number
  private _enterPosition: number
  private _anchorPosition: number
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
    this._enterPosition = enterPosition
    this._anchorPosition = anchorPosition
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
    return this._enterPosition
  }

  getAnchorPosition() {
    return this._anchorPosition
  }

  /**
   * Reset enter/anchor positions to -1.
   * Must be called at the start of tokenizing each new line (except the first).
   * This ensures the endless loop guard works correctly by comparing
   * positions within the current line only.
   */
  reset(): void {
    StateStackImplementation._resetPositions(this)
  }

  private static _resetPositions(
    stateStack: StateStackImplementation | null
  ): void {
    while (stateStack) {
      stateStack._enterPosition = -1
      stateStack._anchorPosition = -1
      stateStack = stateStack.parent
    }
  }

  withContentNameScopesList(scopes: AttributedScopeStack) {
    return new StateStackImplementation(
      this.parent,
      this.ruleId,
      this._enterPosition,
      this._anchorPosition,
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
      this._enterPosition,
      this._anchorPosition,
      this.beginRuleCapturedEOL,
      endRule,
      this.nameScopesList,
      this.contentNameScopesList
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
      this._enterPosition === other._enterPosition &&
      this._anchorPosition === other._anchorPosition
    )
  }

  getRule(grammar: Grammar): Rule {
    return grammar.getRule(this.ruleId)
  }

  // Optional: stable string/serialization for caching
  toString() {
    const parts: string[] = []
    for (let s: StateStackImplementation | null = this; s; s = s.parent)
      parts.push(String(s.ruleId))
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
  patterns?: any[]
  repository?: Record<string, any>
  injections?: Record<string, any>
  injectionSelector?: string
}

export type GrammarRepository = {
  lookup: (scopeName: string) => IRawGrammar | null
  injections: (scopeName: string) => string[] | null
}

export class SyncRegistry {
  private _grammars = new Map<string, IRawGrammar>()
  private _injections = new Map<string, string[]>()
  private _theme: Theme | null = null

  setTheme(theme: Theme) {
    this._theme = theme
  }
  getTheme() {
    if (!this._theme) throw new Error('Missing theme in registry')
    return this._theme
  }

  addGrammar(grammar: IRawGrammar) {
    this._grammars.set(grammar.scopeName, grammar)
    // allow grammar.injectionSelector to inject into other grammars by scope name.
    // You can populate _injections externally as well.
  }

  lookup(scopeName: string) {
    return this._grammars.get(scopeName) || null
  }

  injections(scopeName: string) {
    return this._injections.get(scopeName) || null
  }

  addInjection(targetScope: string, injectorScope: string) {
    const arr = this._injections.get(targetScope) || []
    if (!arr.includes(injectorScope)) arr.push(injectorScope)
    this._injections.set(targetScope, arr)
  }
}

export type OnigLib = {
  createOnigScanner: (sources: string[]) => any
  createOnigString: (str: string) => any
}

export type ITokenizeLineResult = {
  tokens: Uint32Array | number[]
  ruleStack: StateStackImplementation
  stoppedEarly: boolean
  // Optional: font info
  fonts?: any
}

export class Grammar {
  private _ruleId = 0
  private _ruleId2rule: Rule[] = []
  private _injections: any[] = []
  private _injectionGrammarScopes: string[] = []

  readonly repository: Record<string, any>

  private _basicScopeAttributesProvider: BasicScopeAttributesProvider
  private _tokenTypeMatchers: ScopeMatcher
  private _balancedBracketMatchers: {
    matcher: (names: string[]) => boolean
  }[] = []

  // Performance: Pooled instances to reduce allocations
  private _lineTokensPool: LineTokens = new LineTokens(true)
  private _lineFontsPool: LineFonts = new LineFonts()

  scopeName: string
  private _rawGrammar: IRawGrammar
  private _languageId: number
  private _grammarRepository: GrammarRepository
  private _onigLib: OnigLib
  private _registry: SyncRegistry

  constructor(
    scopeName: string,
    rawGrammar: IRawGrammar,
    languageId: number,
    embeddedLanguages: Record<string, number> | null,
    tokenTypes: Record<string, number> | null,
    balancedBracketSelectors: string[] | null,
    grammarRepository: GrammarRepository,
    onigLib: OnigLib,
    registry: SyncRegistry
  ) {
    this.scopeName = scopeName
    this._rawGrammar = rawGrammar
    this._languageId = languageId
    this._grammarRepository = grammarRepository
    this._onigLib = onigLib
    this._registry = registry

    this.repository = mergeObjects({}, this._rawGrammar.repository || {})
    // Ensure $self / $base exist.
    if (!this.repository['$self']) this.repository['$self'] = this._rawGrammar
    if (!this.repository['$base']) this.repository['$base'] = this._rawGrammar

    this._basicScopeAttributesProvider = new BasicScopeAttributesProvider(
      this._languageId,
      embeddedLanguages || {}
    )
    this._tokenTypeMatchers = new ScopeMatcher(Object.entries(tokenTypes || {}))

    if (balancedBracketSelectors && balancedBracketSelectors.length) {
      for (const sel of balancedBracketSelectors) {
        const matchers = createMatchers(sel, nameMatcher)
        for (const m of matchers)
          this._balancedBracketMatchers.push({ matcher: m.matcher })
      }
    }

    // Register root rule
    RuleFactory.getCompiledRuleId(
      this.repository['$self'],
      this,
      this.repository
    )

    // Build injections (if any)
    this._collectInjections()
  }

  getRule(ruleId: number) {
    const r = this._ruleId2rule[ruleId]
    if (!r) {
      throw new Error(
        `Unknown ruleId ${ruleId} in grammar "${this.scopeName}". ` +
          `This grammar has ${this._ruleId} registered rules (max ruleId: ${this._ruleId}). ` +
          `This typically indicates a StateStack from a different grammar instance is being used.`
      )
    }
    return r
  }

  registerRule(factory: (id: number) => Rule) {
    const id = ++this._ruleId
    const rule = factory(id)
    this._ruleId2rule[id] = rule
    return id
  }
  createOnigScanner(sources: string[]) {
    return this._onigLib.createOnigScanner(sources)
  }

  createOnigString(str: string) {
    return this._onigLib.createOnigString(str)
  }

  getInjections() {
    return this._injections
  }

  getExternalGrammar(scopeName: string) {
    const raw = this._grammarRepository.lookup(scopeName)
    if (!raw) return null
    // we create a lightweight external wrapper where repository is raw.repository
    return {
      scopeName,
      repository: mergeObjects({}, raw.repository || {}, {
        $self: raw,
        $base: this._rawGrammar,
      }),
    }
  }

  getMetadataForScope(
    scope: string,
    parentScopes: AttributedScopeStack | null
  ): { tokenAttributes: number; styleAttributes: StyleAttributes | null } {
    tmLogger.debug('metadata', `getMetadataForScope("${scope}")`, {
      parentScopeNames: parentScopes ? parentScopes.getScopeNames() : [],
    })

    const basic =
      this._basicScopeAttributesProvider.getBasicScopeAttributes(scope)
    const tokenType = this._tokenTypeMatchers.match(scope) ?? basic.tokenType
    const containsBalanced = this._balancedBracketMatchers.some((m) =>
      m.matcher(
        (parentScopes ? parentScopes.getScopeNames() : []).concat([scope])
      )
    )

    // Theme matching: convert to ScopeStack for Theme.match
    const theme = this._registry.getTheme()
    const parentScopeNames = parentScopes ? parentScopes.getScopeNames() : []
    const ss = ScopeStack.push(null, parentScopeNames)
    const full = ss
      ? ScopeStack.push(ss, [scope])
      : ScopeStack.push(null, [scope])

    tmLogger.trace('metadata', `Built ScopeStack for theme matching`, {
      scope,
      fullStack: full?.getSegments(),
    })

    // Get the theme match result - may be null if no match
    const themeMatch = theme.match(full!)

    // Get parent's existing token attributes to inherit from
    const existingAttributes = parentScopes ? parentScopes.tokenAttributes : 0

    // If there's a theme match, use its values; otherwise use 0/-1 to preserve parent values
    // Note: -1 is the "NotSet" value for fontStyle which preserves existing
    let fontStyle = -1
    let foreground = 0
    let background = 0

    if (themeMatch !== null) {
      fontStyle = themeMatch.fontStyle
      foreground = themeMatch.foregroundId
      background = themeMatch.backgroundId
    }

    tmLogger.debug('metadata', `Theme match result for "${scope}"`, {
      foregroundId: foreground,
      fontStyle: fontStyle,
      backgroundId: background,
      usedDefaults: themeMatch === null,
      inheritingFromParent: themeMatch === null && parentScopes !== null,
    })

    const encoded = EncodedTokenAttributes.set(
      existingAttributes, // Use parent's attributes as base (0 if no parent)
      basic.languageId,
      tokenType,
      containsBalanced,
      fontStyle, // -1 (NotSet) preserves existing
      foreground, // 0 preserves existing
      background // 0 preserves existing
    )

    tmLogger.trace('metadata', `Encoded token attributes for "${scope}"`, {
      encoded: encoded >>> 0,
      decoded: {
        languageId: EncodedTokenAttributes.getLanguageId(encoded),
        tokenType: EncodedTokenAttributes.getTokenType(encoded),
        fontStyle: EncodedTokenAttributes.getFontStyle(encoded),
        foreground: EncodedTokenAttributes.getForeground(encoded),
        background: EncodedTokenAttributes.getBackground(encoded),
      },
    })

    return { tokenAttributes: encoded >>> 0, styleAttributes: themeMatch }
  }

  tokenizeLine(
    lineText: string,
    prevState: StateStackImplementation | null,
    timeLimitMs = 0
  ): ITokenizeLineResult {
    tmLogger.info('tokenize', `tokenizeLine called`, {
      lineText:
        lineText.substring(0, 100) + (lineText.length > 100 ? '...' : ''),
      lineLength: lineText.length,
      hasPrevState: !!prevState,
      scopeName: this.scopeName,
    })

    const rootMeta = this.getMetadataForScope(this.scopeName, null)
    const rootScopes = AttributedScopeStack.createRoot(
      this.scopeName,
      rootMeta.tokenAttributes,
      rootMeta.styleAttributes
    )

    let stack: StateStackImplementation
    if (prevState) {
      // Reset enter/anchor positions for the new line
      // This is critical for the endless loop guard to work correctly
      prevState.reset()
      stack = prevState
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

    const onigLine = this.createOnigString(lineText)

    // Performance: Reuse pooled instances instead of creating new ones
    const lineTokens = this._lineTokensPool
    const lineFonts = this._lineFontsPool
    lineTokens.reset()
    lineFonts.reset()

    // Only treat as first line if there is no previous state
    const isFirstLine = !prevState
    const result = _tokenizeString(
      this,
      onigLine,
      isFirstLine,
      0,
      stack,
      lineTokens,
      lineFonts,
      true,
      timeLimitMs
    )
    disposeOnigString(onigLine)

    const finalTokens = lineTokens.finalize(lineText.length)

    // Log token results
    const tokenSummary: Array<{
      start: number
      foregroundId: number
      fontStyle: number
    }> = []
    for (let i = 0; i < finalTokens.length; i += 2) {
      const startPos = finalTokens[i]
      const metadata = finalTokens[i + 1]
      tokenSummary.push({
        start: startPos,
        foregroundId: EncodedTokenAttributes.getForeground(metadata),
        fontStyle: EncodedTokenAttributes.getFontStyle(metadata),
      })
    }

    tmLogger.info('tokenize', `tokenizeLine complete`, {
      tokenCount: finalTokens.length / 2,
      tokens: tokenSummary,
    })

    return {
      tokens: finalTokens,
      ruleStack: result.stack,
      stoppedEarly: result.stoppedEarly,
      fonts: lineFonts.finalize(lineText.length),
    }
  }

  // Injections: match based on injectionSelector from other grammars registered in registry
  private _collectInjections() {
    // If the raw grammar has injections, compile them.
    if (this._rawGrammar.injections) {
      for (const selector in this._rawGrammar.injections) {
        const rawRule = (this._rawGrammar.injections as any)[selector]
        createGrammarInjection(this._injections, selector, rawRule, this, {
          repository: this.repository,
        })
      }
    }

    // Also include injections provided by registry mappings.
    const injectorScopes =
      this._grammarRepository.injections(this.scopeName) || []
    for (const injectorScope of injectorScopes) {
      if (this._injectionGrammarScopes.includes(injectorScope)) continue
      this._injectionGrammarScopes.push(injectorScope)
      const inj = this._grammarRepository.lookup(injectorScope)
      if (!inj || !inj.injectionSelector) continue

      const selector = inj.injectionSelector
      const rawRule = inj.repository?.['$self'] || inj
      createGrammarInjection(this._injections, selector, rawRule, this, {
        repository: mergeObjects({}, inj.repository || {}, { $self: inj }),
      })
    }
  }
}

// Public TextMate Registry helper used by `create-tokenizer`.

export type StateStack = StateStackImplementation | null
export type IGrammar = Grammar
export const INITIAL: StateStack = null

export type RegistryOptions = {
  onigLib: Promise<OnigLib> | OnigLib
  loadGrammar: (scopeName: string) => Promise<IRawGrammar | null>
}

export class Registry {
  private _syncRegistry = new SyncRegistry()
  private _onigLibPromise: Promise<OnigLib>
  private _loadGrammar: (scopeName: string) => Promise<IRawGrammar | null>

  private _rawGrammars = new Map<string, IRawGrammar>()
  private _compiledGrammars = new Map<string, Grammar>()
  private _injectionScopes = new Set<string>()
  private _hasTheme = false

  // Prevent race conditions by deduplicating concurrent grammar loads/compilations
  private _loadingGrammars = new Map<string, Promise<void>>()
  private _compilingGrammars = new Map<string, Promise<Grammar | null>>()

  constructor(options: RegistryOptions) {
    this._onigLibPromise = Promise.resolve(options.onigLib)
    this._loadGrammar = options.loadGrammar
  }

  setTheme(rawTheme: IRawTheme) {
    tmLogger.info('theme-parse', 'Registry.setTheme called', {
      hasSettings: !!rawTheme?.settings,
      hasTokenColors: !!(rawTheme as any)?.tokenColors,
      settingsCount:
        rawTheme?.settings?.length ??
        (rawTheme as any)?.tokenColors?.length ??
        0,
    })

    const theme = Theme.createFromRawTheme(rawTheme, null)

    const colorMap = theme.getColorMap()
    tmLogger.info('theme-parse', 'Theme created', {
      colorMapSize: colorMap.length,
      sampleColors: colorMap.slice(0, 10),
      defaults: {
        foregroundId: theme.getDefaults().foregroundId,
        backgroundId: theme.getDefaults().backgroundId,
        fontStyle: theme.getDefaults().fontStyle,
      },
    })

    this._syncRegistry.setTheme(theme)
    this._hasTheme = true
  }

  getColorMap() {
    if (!this._hasTheme) {
      this._syncRegistry.setTheme(Theme.createFromRawTheme(undefined, null))
      this._hasTheme = true
    }
    return this._syncRegistry.getTheme().getColorMap()
  }

  async loadGrammar(scopeName: string): Promise<Grammar | null> {
    // Check if already compiled
    const existing = this._compiledGrammars.get(scopeName)
    if (existing) return existing

    // Check if already compiling (prevent race conditions)
    const existingCompile = this._compilingGrammars.get(scopeName)
    if (existingCompile) return existingCompile

    // Start compiling and track the promise
    const compilePromise = this._doCompileGrammar(scopeName)
    this._compilingGrammars.set(scopeName, compilePromise)

    try {
      return await compilePromise
    } finally {
      // Clean up after compilation completes
      this._compilingGrammars.delete(scopeName)
    }
  }

  private async _doCompileGrammar(scopeName: string): Promise<Grammar | null> {
    await this._ensureGrammarAndDependencies(scopeName)

    const rawGrammar = this._rawGrammars.get(scopeName)
    if (!rawGrammar) return null

    // Double-check after async operation
    const existing = this._compiledGrammars.get(scopeName)
    if (existing) return existing

    if (!this._hasTheme) {
      this._syncRegistry.setTheme(Theme.createFromRawTheme(undefined, null))
      this._hasTheme = true
    }

    const onigLib = await this._onigLibPromise

    const grammar = createGrammar(
      scopeName,
      rawGrammar,
      0,
      null,
      null,
      null,
      {
        registry: this._syncRegistry,
        lookup: (s: string) => this._syncRegistry.lookup(s),
        injections: (s: string) => this._syncRegistry.injections(s),
      },
      onigLib
    ) as Grammar

    this._compiledGrammars.set(scopeName, grammar)
    return grammar
  }

  private async _ensureGrammarAndDependencies(initialScopeName: string) {
    await this._ensureRawGrammarLoaded(initialScopeName)

    const processor = new ScopeDependencyProcessor(
      this._syncRegistry,
      initialScopeName
    )

    while (processor.queue.length > 0) {
      processor.processQueue()
      for (const ref of processor.queue) {
        await this._ensureRawGrammarLoaded(ref.scopeName)
      }
    }
  }

  private async _ensureRawGrammarLoaded(scopeName: string) {
    // Check if already loaded
    if (this._rawGrammars.has(scopeName)) return

    // Check if already loading (prevent race conditions)
    const existingLoad = this._loadingGrammars.get(scopeName)
    if (existingLoad) {
      await existingLoad
      return
    }

    // Start loading and track the promise
    const loadPromise = this._doLoadRawGrammar(scopeName)
    this._loadingGrammars.set(scopeName, loadPromise)

    try {
      await loadPromise
    } finally {
      // Clean up after loading completes
      this._loadingGrammars.delete(scopeName)
    }
  }

  private async _doLoadRawGrammar(scopeName: string) {
    const rawGrammar = await this._loadGrammar(scopeName)
    if (!rawGrammar) return

    // Deep clone the grammar to ensure all nested objects are mutable.
    // Grammar files may be frozen (e.g., via Object.freeze) and the TextMate
    // implementation needs to add `id` properties to rule objects.
    const clonedGrammar = clone(rawGrammar)

    this._rawGrammars.set(scopeName, clonedGrammar)
    this._syncRegistry.addGrammar(clonedGrammar)

    if (rawGrammar.injectionSelector) {
      this._injectionScopes.add(scopeName)
    }

    // Make all known injection grammars available for all known scopes.
    for (const targetScope of this._rawGrammars.keys()) {
      for (const injectorScope of this._injectionScopes) {
        this._syncRegistry.addInjection(targetScope, injectorScope)
      }
    }
  }
}

export function createGrammar(
  scopeName: string,
  rawGrammar: any,
  languageId: number,
  embeddedLanguages: any,
  tokenTypes: any,
  balancedBracketSelectors: any,
  grammarRepository: any,
  onigLib: any
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
    onigLib,
    registry
  )
}

// ==================== DIAGNOSTIC HELPERS ====================
/**
 * Call this after tokenization to dump a summary of what happened.
 * Useful for debugging why colors are missing.
 */
export function dumpTextMateDiagnostics() {
  tmLogger.dumpSummary()
}

/**
 * Get all diagnostic logs for programmatic analysis.
 */
export function getTextMateDiagnosticLogs() {
  return tmLogger.getLogs()
}

/**
 * Clear accumulated diagnostic logs.
 */
export function clearTextMateDiagnosticLogs() {
  tmLogger.clearLogs()
}

/**
 * Configure diagnostic logging level and categories.
 * @param options Configuration options
 */
export function configureTextMateLogging(options: {
  enabled?: boolean
  level?: LogLevel
  categories?: string[]
}) {
  if (options.enabled !== undefined) {
    tmLogger.setEnabled(options.enabled)
  }
  if (options.level !== undefined) {
    tmLogger.setLevel(options.level)
  }
  if (options.categories !== undefined) {
    tmLogger.setCategories(options.categories)
  }
}

/**
 * Analyze token results to identify potential color issues.
 * @param tokens The token array from tokenizeLine
 * @param colorMap The color map from the registry
 * @param lineText The original line text
 */
export function analyzeTokenColors(
  tokens: Uint32Array | number[],
  colorMap: string[],
  lineText: string
) {
  const analysis: Array<{
    startPos: number
    endPos: number
    text: string
    foregroundId: number
    foregroundColor: string | undefined
    fontStyle: number
    issue?: string
  }> = []

  for (let i = 0; i < tokens.length; i += 2) {
    const startPos = tokens[i]
    const metadata = tokens[i + 1]
    const endPos = i + 2 < tokens.length ? tokens[i + 2] : lineText.length

    const foregroundId = EncodedTokenAttributes.getForeground(metadata)
    const fontStyle = EncodedTokenAttributes.getFontStyle(metadata)
    const foregroundColor = colorMap[foregroundId]

    const entry: (typeof analysis)[0] = {
      startPos,
      endPos,
      text: lineText.substring(startPos, endPos),
      foregroundId,
      foregroundColor,
      fontStyle,
    }

    // Check for potential issues
    if (foregroundId === 0) {
      entry.issue = 'No foreground color assigned (id=0)'
    } else if (
      foregroundId === 1 &&
      colorMap[1]?.toUpperCase() === colorMap[0]?.toUpperCase()
    ) {
      entry.issue = 'Using default foreground color'
    } else if (!foregroundColor) {
      entry.issue = `Color ID ${foregroundId} not found in color map`
    }

    analysis.push(entry)
  }

  return analysis
}
