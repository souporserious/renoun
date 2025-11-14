export interface FrontMatterParseResult {
  content: string
  frontMatter?: Record<string, unknown>
}

export function parseFrontMatter(source: string): FrontMatterParseResult {
  if (!source) {
    return { content: source }
  }

  const hasBom = source.charCodeAt(0) === 0xfeff
  const startOffset = hasBom ? 1 : 0

  if (!source.startsWith('---', startOffset)) {
    return { content: source }
  }

  const firstLineEnd = findLineEnd(source, startOffset)
  const delimiter = source.slice(startOffset, firstLineEnd).trim()

  if (delimiter !== '---') {
    return { content: source }
  }

  const frontMatterStart = skipNewline(source, firstLineEnd)
  let cursor = frontMatterStart
  let closingLineStart = -1

  while (cursor <= source.length) {
    if (cursor >= source.length) {
      break
    }

    const lineEnd = findLineEnd(source, cursor)
    const line = source.slice(cursor, lineEnd).trim()

    if (line === '---') {
      closingLineStart = cursor
      break
    }

    cursor = skipNewline(source, lineEnd)
  }

  if (closingLineStart === -1) {
    return { content: source }
  }

  const frontMatterRaw = source.slice(frontMatterStart, closingLineStart)
  const contentStart = skipNewline(source, findLineEnd(source, closingLineStart))
  const content = stripLeadingBlankLines(source.slice(contentStart))

  const parsed = parseFrontMatterBlock(frontMatterRaw)

  return parsed === undefined
    ? { content }
    : { content, frontMatter: parsed }
}

function stripLeadingBlankLines(value: string): string {
  if (!value) {
    return value
  }

  return value.replace(/^(?:[ \t]*\r?\n)+/, '')
}

interface LineToken {
  indent: number
  content: string
}

function parseFrontMatterBlock(raw: string): Record<string, unknown> | undefined {
  const normalized = raw.replace(/\r\n?/g, '\n')
  const rawLines = normalized.split('\n')
  const lines: LineToken[] = []

  for (const rawLine of rawLines) {
    const expanded = rawLine.replace(/\t/g, '  ')
    const trimmed = expanded.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    lines.push({
      indent: countIndent(expanded),
      content: trimmed,
    })
  }

  if (lines.length === 0) {
    return {}
  }

  let index = 0

  const parseValue = (indent: number): any => {
    if (index >= lines.length) {
      return {}
    }

    const line = lines[index]

    if (line.content.startsWith('- ')) {
      return parseArray(line.indent)
    }

    return parseObject(indent)
  }

  const parseObject = (indent: number): Record<string, unknown> => {
    const result: Record<string, unknown> = {}

    while (index < lines.length) {
      const line = lines[index]

      if (line.indent < indent) {
        break
      }

      if (line.indent > indent) {
        break
      }

      if (line.content.startsWith('- ')) {
        break
      }

      index += 1

      const colonIndex = line.content.indexOf(':')

      if (colonIndex === -1) {
        result[line.content] = true
        continue
      }

      const key = line.content.slice(0, colonIndex).trim()
      const rawValue = line.content.slice(colonIndex + 1).trim()

      if (rawValue !== '') {
        result[key] = parseScalar(rawValue)
        continue
      }

      if (index >= lines.length || lines[index].indent <= indent) {
        result[key] = {}
        continue
      }

      const next = lines[index]

      if (next.content.startsWith('- ')) {
        result[key] = parseArray(next.indent)
      } else {
        result[key] = parseObject(next.indent)
      }
    }

    return result
  }

  const parseArray = (indent: number): any[] => {
    const result: any[] = []

    while (index < lines.length) {
      const line = lines[index]

      if (line.indent < indent) {
        break
      }

      if (!line.content.startsWith('- ')) {
        break
      }

      index += 1

      const rawValue = line.content.slice(2).trim()
      let item: any

      if (rawValue === '') {
        if (index < lines.length && lines[index].indent > indent) {
          const next = lines[index]
          item = next.content.startsWith('- ')
            ? parseArray(next.indent)
            : parseObject(next.indent)
        } else {
          item = null
        }
      } else if (
        rawValue.includes(':') &&
        !rawValue.startsWith('"') &&
        !rawValue.startsWith("'")
      ) {
        const colonIndex = rawValue.indexOf(':')
        const key = rawValue.slice(0, colonIndex).trim()
        const rest = rawValue.slice(colonIndex + 1).trim()
        const value: Record<string, unknown> = {}

        if (rest !== '') {
          value[key] = parseScalar(rest)
        } else if (index < lines.length && lines[index].indent > indent) {
          const next = lines[index]
          value[key] = next.content.startsWith('- ')
            ? parseArray(next.indent)
            : parseObject(next.indent)
        } else {
          value[key] = {}
        }

        item = value

        while (
          index < lines.length &&
          lines[index].indent > indent &&
          !lines[index].content.startsWith('- ')
        ) {
          const nested = parseObject(lines[index].indent)
          Object.assign(value, nested)
        }
      } else {
        item = parseScalar(rawValue)

        while (
          index < lines.length &&
          lines[index].indent > indent &&
          !lines[index].content.startsWith('- ')
        ) {
          const nested = parseObject(lines[index].indent)

          if (
            item !== null &&
            typeof item === 'object' &&
            !Array.isArray(item)
          ) {
            Object.assign(item, nested)
          } else if (item === null) {
            item = nested
          } else if (
            typeof nested === 'object' &&
            nested !== null &&
            !Array.isArray(nested)
          ) {
            nested.value = item
            item = nested
          }
        }
      }

      result.push(item)
    }

    return result
  }

  const parsedValue = parseValue(lines[0]!.indent)

  if (
    parsedValue &&
    typeof parsedValue === 'object' &&
    !Array.isArray(parsedValue)
  ) {
    return parsedValue as Record<string, unknown>
  }

  if (parsedValue === undefined) {
    return undefined
  }

  return { value: parsedValue }
}

function parseScalar(value: string): any {
  if (value === '~') {
    return null
  }

  const lower = value.toLowerCase()

  if (lower === 'null') {
    return null
  }

  if (lower === 'true') {
    return true
  }

  if (lower === 'false') {
    return false
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value)
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const quote = value[0]
    const inner = value.slice(1, -1)
    return inner
      .replace(new RegExp(`\\\\${quote}`, 'g'), quote)
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const array = parseInlineArray(value.slice(1, -1))
    if (array !== undefined) {
      return array
    }
  }

  if (value.startsWith('{') && value.endsWith('}')) {
    const object = parseInlineObject(value.slice(1, -1))
    if (object !== undefined) {
      return object
    }
  }

  return value
}

function parseInlineArray(source: string): any[] | undefined {
  const trimmed = source.trim()

  if (!trimmed) {
    return []
  }

  const items: any[] = []
  let buffer = ''
  let depth = 0
  let inQuotes = false
  let quote: string | undefined

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]

    if (inQuotes) {
      buffer += char

      if (char === quote && trimmed[index - 1] !== '\\') {
        inQuotes = false
        quote = undefined
      }

      continue
    }

    if (char === '"' || char === "'") {
      inQuotes = true
      quote = char
      buffer += char
      continue
    }

    if (char === '[' || char === '{') {
      depth += 1
      buffer += char
      continue
    }

    if (char === ']' || char === '}') {
      depth -= 1
      buffer += char
      continue
    }

    if (char === ',' && depth === 0) {
      if (buffer.trim()) {
        items.push(parseScalar(buffer.trim()))
      }
      buffer = ''
      continue
    }

    buffer += char
  }

  if (buffer.trim()) {
    items.push(parseScalar(buffer.trim()))
  }

  return items
}

function parseInlineObject(source: string): Record<string, unknown> | undefined {
  const trimmed = source.trim()

  if (!trimmed) {
    return {}
  }

  const result: Record<string, unknown> = {}
  let buffer = ''
  let depth = 0
  let inQuotes = false
  let quote: string | undefined
  const pairs: string[] = []

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]

    if (inQuotes) {
      buffer += char

      if (char === quote && trimmed[index - 1] !== '\\') {
        inQuotes = false
        quote = undefined
      }

      continue
    }

    if (char === '"' || char === "'") {
      inQuotes = true
      quote = char
      buffer += char
      continue
    }

    if (char === '{' || char === '[') {
      depth += 1
      buffer += char
      continue
    }

    if (char === '}' || char === ']') {
      depth -= 1
      buffer += char
      continue
    }

    if (char === ',' && depth === 0) {
      if (buffer.trim()) {
        pairs.push(buffer.trim())
      }
      buffer = ''
      continue
    }

    buffer += char
  }

  if (buffer.trim()) {
    pairs.push(buffer.trim())
  }

  for (const pair of pairs) {
    const colonIndex = pair.indexOf(':')

    if (colonIndex === -1) {
      continue
    }

    const rawKey = pair.slice(0, colonIndex).trim()
    const key =
      rawKey.startsWith('"') || rawKey.startsWith("'")
        ? rawKey.slice(1, -1)
        : rawKey
    const rawValue = pair.slice(colonIndex + 1).trim()
    result[key] = parseScalar(rawValue)
  }

  return result
}

function countIndent(line: string): number {
  let indent = 0

  for (const char of line) {
    if (char === ' ') {
      indent += 1
    } else {
      break
    }
  }

  return indent
}

function findLineEnd(source: string, start: number): number {
  let index = start

  while (index < source.length) {
    const char = source[index]

    if (char === '\n' || char === '\r') {
      break
    }

    index += 1
  }

  return index
}

function skipNewline(source: string, index: number): number {
  if (index >= source.length) {
    return index
  }

  if (source[index] === '\r' && source[index + 1] === '\n') {
    return index + 2
  }

  if (source[index] === '\r' || source[index] === '\n') {
    return index + 1
  }

  return index
}
