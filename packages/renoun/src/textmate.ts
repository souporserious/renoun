export const DebugFlags = {
  inDebugMode: false,
} as const

export const UseOnigurumaFindOptions = false as const

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
    for (let i = 0; i < aLen; i++) {
      const cmp = stringCompare(a[i], b[i])
      if (cmp !== 0) return cmp
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
  constructor(
    private fn: (arg: T) => R,
    private maxSize = 0
  ) {}
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
  constructor(
    private fn: (arg: string) => R,
    private maxSize = 0
  ) {}
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
  pos = 0
  len: number
  line = 1
  char = 0
  constructor(public source: string) {
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
      state.pos +
      ': ' +
      message +
      ' ~~~' +
      state.source.substr(state.pos, 50) +
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
  let pos = state.pos
  const len = state.len
  let line = state.line
  let column = state.char

  while (true) {
    if (pos >= len) return false
    ch = src.charCodeAt(pos)
    if (ch !== 32 && ch !== 9 && ch !== 13) {
      if (ch !== 10) break
      pos++
      line++
      column = 0
    } else {
      pos++
      column++
    }
  }

  token.offset = pos
  token.line = line
  token.char = column

  if (ch === 34) {
    // string
    token.type = 1
    pos++
    column++
    while (true) {
      if (pos >= len) return false
      ch = src.charCodeAt(pos)
      pos++
      column++
      if (ch === 92) {
        pos++
        column++
      } else if (ch === 34) {
        break
      }
    }
    token.value = src
      .substring(token.offset + 1, pos - 1)
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
    pos++
    column++
  } else if (ch === 123) {
    token.type = 3 // {
    pos++
    column++
  } else if (ch === 93) {
    token.type = 4 // ]
    pos++
    column++
  } else if (ch === 125) {
    token.type = 5 // }
    pos++
    column++
  } else if (ch === 58) {
    token.type = 6 // :
    pos++
    column++
  } else if (ch === 44) {
    token.type = 7 // ,
    pos++
    column++
  } else if (ch === 110) {
    token.type = 8 // null
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 117) return false
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 108) return false
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 108) return false
    pos++
    column++
  } else if (ch === 116) {
    token.type = 9 // true
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 114) return false
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 117) return false
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 101) return false
    pos++
    column++
  } else if (ch === 102) {
    token.type = 10 // false
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 97) return false
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 108) return false
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 115) return false
    pos++
    column++
    ch = src.charCodeAt(pos)
    if (ch !== 101) return false
    pos++
    column++
  } else {
    token.type = 11 // number
    while (true) {
      if (pos >= len) return false
      ch = src.charCodeAt(pos)
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
      pos++
      column++
    }
  }

  token.len = pos - token.offset
  if (token.value === null) token.value = src.substr(token.offset, token.len)

  state.pos = pos
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

  constructor(
    private _colorMap: ColorMap,
    private _defaults: StyleAttributes,
    private _root: ThemeTrieElement
  ) {
    this._cachedMatchRoot = new StringCachedFn((scope) =>
      this._root.match(scope)
    )
  }

  static createFromRawTheme(
    rawTheme: IRawTheme | undefined,
    colorMap: string[]
  ) {
    return this.createFromParsedTheme(parseTheme(rawTheme), colorMap)
  }

  static createFromParsedTheme(rules: ParsedThemeRule[], colorMap: string[]) {
    return (function buildTheme(
      sortedRules: ParsedThemeRule[],
      colorMap: string[]
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

      while (sortedRules.length >= 1 && sortedRules[0].scope === '') {
        const rule = sortedRules.shift()!
        if (rule.fontStyle !== -1) defaultFontStyle = rule.fontStyle
        if (rule.foreground !== null) defaultForeground = rule.foreground
        if (rule.background !== null) defaultBackground = rule.background
        if (rule.fontFamily !== null) defaultFontFamily = rule.fontFamily
        if (rule.fontSize !== null) defaultFontSize = rule.fontSize
        if (rule.lineHeight !== null) defaultLineHeight = rule.lineHeight
      }

      const cm = new ColorMap(colorMap)
      const defaults = new StyleAttributes(
        defaultFontStyle,
        cm.getId(defaultForeground),
        cm.getId(defaultBackground),
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

      for (let i = 0, n = sortedRules.length; i < n; i++) {
        const rule = sortedRules[i]
        root.insert(
          0,
          rule.scope,
          rule.parentScopes,
          rule.fontStyle,
          cm.getId(rule.foreground),
          cm.getId(rule.background),
          rule.fontFamily,
          rule.fontSize,
          rule.lineHeight
        )
      }

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
    if (scope === null) return this._defaults

    const scopeName = scope.scopeName
    const match = this._cachedMatchRoot.get(scopeName).find((rule: any) => {
      if (rule.parentScopes.length === 0) return true

      let parent = scope.parent
      const parentScopes = rule.parentScopes
      for (let i = 0; i < parentScopes.length; i++) {
        let selector = parentScopes[i]
        let immediate = false
        if (selector === '>') {
          if (i === parentScopes.length - 1) return false
          selector = parentScopes[++i]
          immediate = true
        }
        while (parent && !scopeMatches(parent.scopeName, selector)) {
          if (immediate) return false
          parent = parent.parent
        }
        if (!parent) return false
        parent = parent.parent
      }
      return true
    })

    return match ? match.getStyleAttributes() : null
  }
}

export class ScopeStack {
  constructor(
    public parent: ScopeStack | null,
    public scopeName: string
  ) {}

  static push(
    stack: ScopeStack | null,
    scopeNames: string[]
  ): ScopeStack | null {
    for (const scope of scopeNames) stack = new ScopeStack(stack, scope)
    return stack
  }

  static from(...scopes: string[]): ScopeStack | null {
    let stack: ScopeStack | null = null
    for (let i = 0; i < scopes.length; i++)
      stack = new ScopeStack(stack, scopes[i])
    return stack
  }

  push(scope: string) {
    return new ScopeStack(this, scope)
  }

  getSegments() {
    let cur: ScopeStack | null = this
    const segments: string[] = []
    while (cur) {
      segments.push(cur.scopeName)
      cur = cur.parent
    }
    segments.reverse()
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
  if (expected === actual) return true
  const expLen = expected.length
  return (
    actual.length > expLen &&
    actual.charCodeAt(expLen) === 46 && // 46 = '.'
    actual.lastIndexOf(expected, 0) === 0
  ) // faster startsWith
}

export class StyleAttributes {
  constructor(
    public fontStyle: number,
    public foregroundId: number,
    public backgroundId: number,
    public fontFamily: string | null,
    public fontSize: string | null,
    public lineHeight: number | null
  ) {}
}

export function parseTheme(theme: IRawTheme | undefined) {
  if (!theme) return []
  if (!theme.settings || !Array.isArray(theme.settings)) return []

  const settings = theme.settings
  const parsed: ParsedThemeRule[] = []
  let ruleIndex = 0

  for (let i = 0, n = settings.length; i < n; i++) {
    const entry = settings[i]
    if (!entry.settings) continue

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
    if (
      typeof entry.settings.foreground === 'string' &&
      isValidHexColor(entry.settings.foreground)
    ) {
      foreground = entry.settings.foreground
    }

    let background: string | null = null
    if (
      typeof entry.settings.background === 'string' &&
      isValidHexColor(entry.settings.background)
    ) {
      background = entry.settings.background
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
      parsed[ruleIndex++] = new ParsedThemeRule(
        scope,
        parentScopes,
        i,
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
  constructor(
    public scope: string,
    public parentScopes: string[] | null,
    public index: number,
    public fontStyle: number,
    public foreground: string | null,
    public background: string | null,
    public fontFamily: string | null,
    public fontSize: string | null,
    public lineHeight: number | null
  ) {}
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
      for (let i = 0, n = initialColorMap.length; i < n; i++) {
        this._color2id[initialColorMap[i]] = i
        this._id2color[i] = initialColorMap[i]
      }
    } else {
      this._isFrozen = false
    }
  }

  getId(color: string | null) {
    if (color === null) return 0
    // Check both original and uppercase to avoid toUpperCase call when already cached
    let id = this._color2id[color]
    if (id !== undefined) return id
    const upper = color.toUpperCase()
    id = this._color2id[upper]
    if (id !== undefined) {
      // Cache the original case too for faster future lookups
      this._color2id[color] = id
      return id
    }
    if (this._isFrozen) throw new Error(`Missing color in color map - ${color}`)
    id = ++this._lastColorId
    this._color2id[upper] = id
    this._color2id[color] = id
    this._id2color[id] = upper
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

  constructor(
    public scopeDepth: number,
    parentScopes: readonly string[] | null,
    public fontStyle: number,
    public foreground: number,
    public background: number,
    public fontFamily: string | null,
    public fontSize: string | null,
    public lineHeight: number | null
  ) {
    this.parentScopes = parentScopes || EMPTY_PARENT_SCOPES
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
    for (let i = 0, n = rules.length; i < n; i++) out[i] = rules[i].clone()
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
  constructor(
    private _mainRule: ThemeTrieElementRule,
    private _rulesWithParentScopes: ThemeTrieElementRule[] = [],
    private _children: Record<string, ThemeTrieElement> = {}
  ) {}

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
      if (this._children.hasOwnProperty(head))
        return this._children[head].match(tail)
    }

    const rules = this._rulesWithParentScopes.concat(this._mainRule)
    rules.sort(ThemeTrieElement._cmpBySpecificity)
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
      for (let i = 0, len = rules.length; i < len; i++) {
        const rule = rules[i]
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
  constructor(
    public languageId: number,
    public tokenType: number
  ) {}
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
  private _name: string | null
  private _nameIsCapturing: boolean
  private _contentName: string | null
  private _contentNameIsCapturing: boolean

  constructor(
    public $location: any,
    id: number,
    name: string | null,
    contentName: string | null
  ) {
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
  constructor(
    location: any,
    id: number,
    name: string | null,
    contentName: string | null,
    public retokenizeCapturedWithRuleId: number
  ) {
    super(location, id, name, contentName)
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
    this._end = new RegExpSource(end || '\uFFFF', -1)
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
      this._cachedCompiledWhilePatterns.setSource(0, end || '\uFFFF')
    }
    return this._cachedCompiledWhilePatterns
  }
}

export class RuleFactory {
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
    if (!rawRule.id) {
      grammar.registerRule((newId: number) => {
        if (((rawRule.id = newId), rawRule.match)) {
          return new MatchRule(
            rawRule.$textmateLocation,
            rawRule.id,
            rawRule.name,
            rawRule.match,
            RuleFactory._compileCaptures(rawRule.captures, grammar, repository)
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
            rawRule.id,
            rawRule.name,
            rawRule.contentName,
            RuleFactory._compilePatterns(patterns, grammar, repository)
          )
        }

        if (rawRule.while) {
          return new BeginWhileRule(
            rawRule.$textmateLocation,
            rawRule.id,
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
            RuleFactory._compilePatterns(rawRule.patterns, grammar, repository)
          )
        }

        return new BeginEndRule(
          rawRule.$textmateLocation,
          rawRule.id,
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
      })
    }
    return rawRule.id
  }

  static _compileCaptures(captures: any, grammar: any, repository: any) {
    const out: any[] = []
    if (captures) {
      let maxCaptureId = 0
      for (const key in captures) {
        if (key === '$textmateLocation') continue
        const n = parseInt(key, 10)
        if (n > maxCaptureId) maxCaptureId = n
      }
      for (let i = 0; i <= maxCaptureId; i++) out[i] = null

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
      for (let i = 0, n = patterns.length; i < n; i++) {
        const pat = patterns[i]
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
              if (target)
                ruleId = RuleFactory.getCompiledRuleId(
                  target,
                  grammar,
                  repository
                )
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
          const rule = grammar.getRule(ruleId)
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

      for (let i = 0; i < length; i++) {
        if (source.charCodeAt(i) === 92 && i + 1 < length) {
          // backslash, use charCodeAt
          const next = source.charCodeAt(i + 1)
          if (next === 122) {
            // 'z'
            parts.push(source.substring(start, i))
            parts.push('$(?!\\n)(?<!\\n)')
            start = i + 2
          } else if (next === 65 || next === 71) {
            // 'A' or 'G'
            hasAnchor = true
          }
          i++
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
    // Find positions of \A and \G anchors
    const src = this.source
    const len = src.length
    const anchorPositions: Array<{ pos: number; type: 'A' | 'G' }> = []

    for (let i = 0; i < len - 1; i++) {
      if (src.charCodeAt(i) === 92) {
        // backslash
        const next = src.charCodeAt(i + 1)
        if (next === 65)
          anchorPositions.push({ pos: i + 1, type: 'A' }) // 'A'
        else if (next === 71) anchorPositions.push({ pos: i + 1, type: 'G' }) // 'G'
        i++ // skip next char
      }
    }

    // If no anchors, all variants are the same
    if (anchorPositions.length === 0) {
      return { A0_G0: src, A0_G1: src, A1_G0: src, A1_G1: src }
    }

    // Build each variant by replacing anchors appropriately
    const build = (replaceA: string, replaceG: string): string => {
      const parts: string[] = []
      let lastEnd = 0
      for (const { pos, type } of anchorPositions) {
        parts.push(src.substring(lastEnd, pos))
        parts.push(type === 'A' ? replaceA : replaceG)
        lastEnd = pos + 1
      }
      parts.push(src.substring(lastEnd))
      return parts.join('')
    }

    return {
      A0_G0: build('\uFFFF', '\uFFFF'),
      A0_G1: build('\uFFFF', 'G'),
      A1_G0: build('A', '\uFFFF'),
      A1_G1: build('A', 'G'),
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
  constructor(
    grammar: any,
    public regExps: string[],
    public rules: number[]
  ) {
    this.scanner = grammar.createOnigScanner(regExps)
  }
  dispose() {
    if (typeof this.scanner.dispose === 'function') this.scanner.dispose()
  }
  toString() {
    const lines: string[] = []
    for (let i = 0; i < this.rules.length; i++)
      lines.push('   - ' + this.rules[i] + ': ' + this.regExps[i])
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
  constructor(public scopeName: string) {}
  toKey() {
    return this.scopeName
  }
}

export class TopLevelRepositoryRuleReference {
  constructor(
    public scopeName: string,
    public ruleName: string
  ) {}
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

  constructor(
    public repo: SyncRegistry,
    public initialScopeName: string
  ) {
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
  constructor(public ruleName: string) {}
}
export class TopLevelReference {
  kind = 3 as const
  constructor(public scopeName: string) {}
}
export class TopLevelRepositoryReference {
  kind = 4 as const
  constructor(
    public scopeName: string,
    public ruleName: string
  ) {}
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
  constructor(
    public stack: StateStackImplementation,
    public stoppedEarly: boolean
  ) {}
}

// Forward declaration for nameMatcher
function nameMatcher(names: string[], scopeSegments: string[]): boolean {
  const scopes = new Set(scopeSegments)
  for (const name of names) {
    for (const scope of scopes) {
      if (scopeMatches(scope, name)) return true
    }
  }
  return false
}

// Forward declaration for createGrammarInjection
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
  linePos: number,
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
  let anchorPos = -1

  if (checkWhileConditions) {
    const res = (function applyWhileRules(
      grammar: Grammar,
      lineText: string,
      isFirstLine: boolean,
      linePos: number,
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

      let anchorPosition = stack.beginRuleCapturedEOL ? 0 : -1
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
          linePos === anchorPosition
        )

        const match = ruleScanner.findNextMatchSync(
          lineText,
          linePos,
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
          if (match.captureIndices[0].end > linePos) {
            linePos = match.captureIndices[0].end
            isFirstLine = false
          }
        }
      }

      return { stack, linePos, anchorPosition, isFirstLine }
    })(
      grammar,
      onigLine.content,
      isFirstLine,
      linePos,
      stack,
      lineTokens,
      lineFonts
    )

    stack = res.stack
    linePos = res.linePos
    isFirstLine = res.isFirstLine
    anchorPos = res.anchorPosition
  }

  const startTime = Date.now()

  while (!done) {
    if (timeLimitMs !== 0 && Date.now() - startTime > timeLimitMs)
      return new TokenizeStringResult(stack, true)
    scanNext()
  }

  return new TokenizeStringResult(stack, false)

  function scanNext() {
    if (DebugFlags.inDebugMode) {
      console.log('')
      console.log(
        `@@scanNext ${linePos}: |${onigLine.content
          .substr(linePos)
          .replace(/\n$/, '\\n')}|`
      )
    }

    const match = (function matchRuleOrInjection(
      grammar: Grammar,
      onigLine: any,
      isFirstLine: boolean,
      linePos: number,
      stack: StateStackImplementation,
      anchorPos: number
    ) {
      const ruleMatch = (function matchRule(
        grammar: Grammar,
        onigLine: any,
        isFirstLine: boolean,
        linePos: number,
        stack: StateStackImplementation,
        anchorPos: number
      ) {
        const currentRule = stack.getRule(grammar)
        const { ruleScanner, findOptions } = prepareRuleSearch(
          currentRule,
          grammar,
          stack.endRule,
          isFirstLine,
          linePos === anchorPos
        )

        let start = 0
        if (DebugFlags.inDebugMode) start = performance.now()
        const match = ruleScanner.findNextMatchSync(
          onigLine,
          linePos,
          findOptions
        )

        if (DebugFlags.inDebugMode) {
          const elapsed = performance.now() - start
          if (elapsed > 5)
            console.warn(
              `Rule ${currentRule.debugName} (${currentRule.id}) matching took ${elapsed} against '${onigLine}'`
            )
          console.log(
            `  scanning for (linePos: ${linePos}, anchorPosition: ${anchorPos})`
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
      })(grammar, onigLine, isFirstLine, linePos, stack, anchorPos)

      const injections = grammar.getInjections()
      if (injections.length === 0) return ruleMatch

      const injectionMatch = (function matchInjections(
        injections: any[],
        grammar: Grammar,
        onigLine: any,
        isFirstLine: boolean,
        linePos: number,
        stack: StateStackImplementation,
        anchorPos: number
      ) {
        let bestRuleId: number | undefined
        let bestStart = Number.MAX_VALUE
        let bestCaptures: any = null
        let bestPriority = 0

        const scopeNames = stack.contentNameScopesList.getScopeNames()

        for (let i = 0; i < injections.length; i++) {
          const inj = injections[i]
          if (!inj.matcher(scopeNames)) continue
          const rule = grammar.getRule(inj.ruleId)
          const { ruleScanner, findOptions } = prepareRuleSearch(
            rule,
            grammar,
            null,
            isFirstLine,
            linePos === anchorPos
          )
          const match = ruleScanner.findNextMatchSync(
            onigLine,
            linePos,
            findOptions
          )
          if (!match) continue

          if (DebugFlags.inDebugMode) {
            console.log(`  matched injection: ${inj.debugSelector}`)
            console.log(ruleScanner.toString())
          }

          const start = match.captureIndices[0].start
          if (start > bestStart) continue
          if (start === bestStart && inj.priority <= bestPriority) continue

          bestStart = start
          bestCaptures = match.captureIndices
          bestRuleId = match.ruleId
          bestPriority = inj.priority
          if (bestStart === linePos && bestPriority === 1) break
        }

        return bestCaptures
          ? {
              priorityMatch: bestPriority === 1,
              captureIndices: bestCaptures,
              matchedRuleId: bestRuleId!,
            }
          : null
      })(injections, grammar, onigLine, isFirstLine, linePos, stack, anchorPos)

      if (!injectionMatch) return ruleMatch
      if (!ruleMatch) return injectionMatch

      const ruleStart = ruleMatch.captureIndices[0].start
      const injStart = injectionMatch.captureIndices[0].start
      return injStart < ruleStart ||
        (injectionMatch.priorityMatch && injStart === ruleStart)
        ? injectionMatch
        : ruleMatch
    })(grammar, onigLine, isFirstLine, linePos, stack, anchorPos)

    if (!match) {
      if (DebugFlags.inDebugMode) console.log('  no more matches.')
      produce(stack, lineLength)
      done = true
      return
    }

    const captureIndices = match.captureIndices
    const matchedRuleId = match.matchedRuleId

    const advanced =
      !!(captureIndices && captureIndices.length > 0) &&
      captureIndices[0].end > linePos

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
      anchorPos = popped.getAnchorPos()

      if (!advanced && popped.getEnterPos() === linePos) {
        if (DebugFlags.inDebugMode)
          console.error(
            '[1] - Grammar is in an endless loop - Grammar pushed & popped a rule without advancing'
          )
        produce((stack = popped), lineLength)
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
        linePos,
        anchorPos,
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

        anchorPos = captureIndices[0].end

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

        if (!advanced && parentState.hasSameRuleAs(stack)) {
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

        anchorPos = captureIndices[0].end

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

        if (!advanced && parentState.hasSameRuleAs(stack)) {
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

        if (!advanced) {
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

    if (captureIndices[0].end > linePos) {
      linePos = captureIndices[0].end
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
  if (UseOnigurumaFindOptions) {
    return {
      ruleScanner: rule.compile(grammar, endRule),
      findOptions: getFindOptions(isFirstLine, atAnchor),
    }
  }
  return {
    ruleScanner: rule.compileAG(grammar, endRule, isFirstLine, atAnchor),
    findOptions: 0,
  }
}

function getFindOptions(isFirstLine: any, atAnchor: any) {
  let options = 0
  if (!isFirstLine) options |= 1
  if (!atAnchor) options |= 4
  return options
}

export class LocalStackElement {
  constructor(
    public scopes: AttributedScopeStack,
    public endPos: number
  ) {}
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

  for (let i = 0; i < len; i++) {
    const captureRule = captureRules[i]
    if (captureRule === null) continue

    const capture = captureIndices[i]
    if (!capture || capture.length === 0) continue
    if (capture.start > lineEnd) break

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

  constructor(
    public parent: AttributedScopeStack | null,
    public scopeName: string | null,
    public tokenAttributes: number
  ) {}

  static createRoot(
    scopeName: string,
    tokenAttributes: number
  ): AttributedScopeStack {
    return new AttributedScopeStack(null, scopeName, tokenAttributes >>> 0)
  }

  pushAttributed(
    scopeName: string | null,
    grammar: Grammar
  ): AttributedScopeStack {
    if (!scopeName) return this
    // Fast path: most scope names don't have spaces
    const spaceIdx = scopeName.indexOf(' ')
    if (spaceIdx === -1) {
      const attrs = grammar.getMetadataForScope(scopeName, this)
      return new AttributedScopeStack(this, scopeName, attrs)
    }
    // Slow path: scopeName has multiple space-separated scopes
    let cur: AttributedScopeStack = this
    let start = 0
    const len = scopeName.length
    while (start < len) {
      // Skip leading spaces
      while (start < len && scopeName.charCodeAt(start) === 32) start++
      if (start >= len) break
      // Find end of this scope
      let end = start + 1
      while (end < len && scopeName.charCodeAt(end) !== 32) end++
      const p = scopeName.substring(start, end)
      const attrs = grammar.getMetadataForScope(p, cur)
      cur = new AttributedScopeStack(cur, p, attrs)
      start = end + 1
    }
    return cur
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
  private lastPos = 0
  private lastMetadata = 0

  constructor(private emitBinaryTokens: boolean) {}

  reset() {
    this.tokensLen = 0
    this.lastPos = 0
    this.lastMetadata = 0
  }

  produce(stack: StateStackImplementation, endPos: number) {
    this.produceFromScopes(stack.contentNameScopesList, endPos)
  }

  produceFromScopes(scopes: AttributedScopeStack, endPos: number) {
    if (endPos <= this.lastPos) return
    const metadata = scopes.tokenAttributes >>> 0
    if (this.tokensLen === 0 || this.lastMetadata !== metadata) {
      // Grow array if needed, reuse existing slots
      if (this.tokensLen + 2 > this.tokens.length) {
        // Grow by 32 slots at a time to reduce reallocations
        this.tokens.length = this.tokens.length + 32
      }
      this.tokens[this.tokensLen++] = this.lastPos
      this.tokens[this.tokensLen++] = metadata
    }
    this.lastPos = endPos
    this.lastMetadata = metadata
  }

  finalize(lineLength: number) {
    // Ensure last token ends at lineLength by just updating lastPos.
    this.lastPos = lineLength
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
  private lastPos = 0

  reset() {
    this.spans = []
    this.lastPos = 0
  }

  produce(stack: StateStackImplementation, endPos: number) {
    this.produceFromScopes(stack.contentNameScopesList, endPos)
  }

  produceFromScopes(_scopes: AttributedScopeStack, endPos: number) {
    if (endPos <= this.lastPos) return
    // In this simplified version, style attributes are not carried on AttributedScopeStack.
    // If you've extended token metadata to include font family/size/lineHeight, wire it here.
    // For now we just keep a single span boundary list (empty by default).
    this.lastPos = endPos
  }

  finalize(_lineLength: number) {
    return this.spans
  }
}

export class StateStackImplementation {
  constructor(
    public parent: StateStackImplementation | null,
    public ruleId: number,
    private _enterPos: number,
    private _anchorPos: number,
    public beginRuleCapturedEOL: boolean,
    public endRule: string | null,
    public nameScopesList: AttributedScopeStack,
    public contentNameScopesList: AttributedScopeStack
  ) {}

  static create(rootRuleId: number, rootScopes: AttributedScopeStack) {
    return new StateStackImplementation(
      null,
      rootRuleId,
      0,
      -1,
      false,
      null,
      rootScopes,
      rootScopes
    )
  }

  getEnterPos() {
    return this._enterPos
  }

  getAnchorPos() {
    return this._anchorPos
  }

  withContentNameScopesList(scopes: AttributedScopeStack) {
    return new StateStackImplementation(
      this.parent,
      this.ruleId,
      this._enterPos,
      this._anchorPos,
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
      this._enterPos,
      this._anchorPos,
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
      this._enterPos === other._enterPos &&
      this._anchorPos === other._anchorPos
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

  constructor(
    public scopeName: string,
    private _rawGrammar: IRawGrammar,
    private _languageId: number,
    embeddedLanguages: Record<string, number> | null,
    tokenTypes: Record<string, number> | null,
    balancedBracketSelectors: string[] | null,
    private _grammarRepository: GrammarRepository,
    private _onigLib: OnigLib,
    private _registry: SyncRegistry
  ) {
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
    if (!r) throw new Error(`Unknown ruleId ${ruleId}`)
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
  ) {
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
    const ss = ScopeStack.push(
      null,
      parentScopes ? parentScopes.getScopeNames() : []
    )
    const full = ss
      ? ScopeStack.push(ss, [scope])
      : ScopeStack.push(null, [scope])
    const style = theme.match(full!) || theme.getDefaults()

    const encoded = EncodedTokenAttributes.set(
      0,
      basic.languageId,
      tokenType,
      containsBalanced,
      style.fontStyle,
      style.foregroundId,
      style.backgroundId
    )
    return encoded >>> 0
  }

  tokenizeLine(
    lineText: string,
    prevState: StateStackImplementation | null,
    timeLimitMs = 0
  ): ITokenizeLineResult {
    const rootScopes = AttributedScopeStack.createRoot(
      this.scopeName,
      this.getMetadataForScope(this.scopeName, null)
    )

    const stack =
      prevState ||
      StateStackImplementation.create(
        RuleFactory.getCompiledRuleId(
          this.repository['$self'],
          this,
          this.repository
        ),
        rootScopes
      )

    const onigLine = this.createOnigString(lineText)

    // Performance: Reuse pooled instances instead of creating new ones
    const lineTokens = this._lineTokensPool
    const lineFonts = this._lineFontsPool
    lineTokens.reset()
    lineFonts.reset()

    const result = _tokenizeString(
      this,
      onigLine,
      true,
      0,
      stack,
      lineTokens,
      lineFonts,
      true,
      timeLimitMs
    )
    disposeOnigString(onigLine)

    return {
      tokens: lineTokens.finalize(lineText.length),
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

// Public createGrammar helper

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
