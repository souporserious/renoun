export interface BlockAnnotationInstruction {
  tag: string
  props: Record<string, any>
  start: number
  end: number
}

export interface InlineAnnotationInstruction {
  tag: string
  props: Record<string, any>
  index: number
}

export interface AnnotationInstructions {
  block: BlockAnnotationInstruction[]
  inline: InlineAnnotationInstruction[]
}

export interface AnnotationParseResult extends AnnotationInstructions {
  value: string
}

export function hasAnnotationCandidates(
  value: string,
  annotations: Iterable<string>
): boolean {
  const tags = new Set<string>(annotations)

  if (tags.size === 0) return false

  let searchIndex = value.indexOf('/*')

  while (searchIndex !== -1) {
    const afterMarker = searchIndex + 2

    if (afterMarker >= value.length) {
      break
    }

    let tagStart = afterMarker

    if (value.charCodeAt(tagStart) === ASTERISK) {
      tagStart += 1
    }

    if (tagStart >= value.length) {
      break
    }

    const firstCodePoint = value.charCodeAt(tagStart)

    if (!isTagLead(firstCodePoint)) {
      searchIndex = value.indexOf('/*', afterMarker)
      continue
    }

    const tagEnd = scanTagEnd(value, tagStart)
    const tag = value.slice(tagStart, tagEnd)

    if (tag.length > 0 && tags.has(tag)) {
      return true
    }

    searchIndex = value.indexOf('/*', afterMarker)
  }

  return false
}

export function parseAnnotations(
  value: string,
  annotations: Iterable<string>
): AnnotationParseResult {
  const tags = new Set<string>(annotations)

  if (tags.size === 0) {
    return { value, block: [], inline: [] }
  }

  const block: BlockAnnotationInstruction[] = []
  const inline: InlineAnnotationInstruction[] = []
  const stack: Array<{
    tag: string
    props: Record<string, any>
    start: number
  }> = []
  const segments: string[] = []
  let cleanLength = 0
  let lastIndex = 0

  let scanIndex = 0
  while (scanIndex < value.length) {
    const commentStart = value.indexOf('/*', scanIndex)
    if (commentStart === -1) break

    const afterMarker = commentStart + 2
    if (afterMarker >= value.length) break

    const endMarkerIndex = value.indexOf('*/', afterMarker)
    if (endMarkerIndex === -1) {
      // No closing delimiter found; append remainder and stop scanning
      segments.push(value.slice(lastIndex))
      cleanLength += value.length - lastIndex
      lastIndex = value.length
      break
    }

    const commentEnd = endMarkerIndex + 2

    let type: 'open' | 'close' | 'self' = 'open'
    let tagStart = afterMarker

    if (value.charCodeAt(tagStart) === ASTERISK) {
      type = 'close'
      tagStart += 1
    }

    if (tagStart >= endMarkerIndex) {
      const segment = value.slice(lastIndex, commentEnd)
      segments.push(segment)
      cleanLength += segment.length
      lastIndex = commentEnd
      scanIndex = commentEnd
      continue
    }

    const tagEnd = scanTagEnd(value, tagStart, endMarkerIndex)
    const tag = value.slice(tagStart, tagEnd)

    if (tag.length === 0 || !tags.has(tag)) {
      const segment = value.slice(lastIndex, commentEnd)
      segments.push(segment)
      cleanLength += segment.length
      lastIndex = commentEnd
      scanIndex = commentEnd
      continue
    }

    let propsEnd = endMarkerIndex
    while (
      propsEnd > tagEnd &&
      isWhitespaceChar(value.charCodeAt(propsEnd - 1))
    ) {
      propsEnd -= 1
    }

    if (type === 'open' && propsEnd > tagEnd) {
      if (value.charCodeAt(propsEnd - 1) === ASTERISK) {
        type = 'self'
        propsEnd -= 1
        while (
          propsEnd > tagEnd &&
          isWhitespaceChar(value.charCodeAt(propsEnd - 1))
        ) {
          propsEnd -= 1
        }
      }
    }

    const propsString =
      type === 'close' || propsEnd <= tagEnd
        ? ''
        : value.slice(tagEnd, propsEnd)
    const props =
      type === 'close' ? {} : parseAnnotationProps(propsString)

    const lineStart = value.lastIndexOf('\n', commentStart - 1) + 1
    const lineEndIndex = value.indexOf('\n', commentEnd)
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
    const beforeText = value.slice(Math.max(lineStart, lastIndex), commentStart)
    const afterText = value.slice(commentEnd, lineEnd)
    const isLineOnly =
      beforeText.trim().length === 0 && afterText.trim().length === 0

    let segmentStart =
      isLineOnly && lineStart >= lastIndex ? lineStart : commentStart

    // If this is a line-only annotation on the final line of the file,
    // also remove the preceding newline so we don't leave a trailing newline
    // in the cleaned output.
    if (isLineOnly && lineEndIndex === -1 && lineStart > lastIndex) {
      const prevIndex = lineStart - 1
      if (value[prevIndex] === '\n') {
        // Handle CRLF as well
        if (prevIndex - 1 >= lastIndex && value[prevIndex - 1] === '\r') {
          segmentStart = prevIndex - 1
        } else {
          segmentStart = prevIndex
        }
      }
    }

    const segment = value.slice(lastIndex, segmentStart)
    segments.push(segment)
    cleanLength += segment.length

    lastIndex = commentEnd
    if (isLineOnly && lineEndIndex !== -1) {
      lastIndex = lineEndIndex + 1
    }

    if (type === 'open') {
      stack.push({ tag, props, start: cleanLength })
    } else if (type === 'close') {
      for (let index = stack.length - 1; index >= 0; index--) {
        const frame = stack[index]
        if (frame.tag !== tag) continue
        stack.splice(index, 1)
        block.push({
          tag,
          props: frame.props,
          start: frame.start,
          end: cleanLength,
        })
        break
      }
    } else {
      inline.push({ tag, props, index: cleanLength })
    }

    scanIndex = commentEnd
  }

  segments.push(value.slice(lastIndex))

  if (stack.length > 0) {
    const unclosed = Array.from(new Set(stack.map((frame) => frame.tag)))
    const list = unclosed.join(', ')
    throw new Error(
      `[renoun] Unclosed annotation${unclosed.length > 1 ? 's' : ''}: "${list}" use '/**${list}*/' to close the previously opened '/*${list}*/'.`
    )
  }

  return {
    value: segments.join(''),
    block,
    inline,
  }
}

const ASTERISK = '*'.charCodeAt(0)
const FORWARD_SLASH = '/'.charCodeAt(0)

function isWhitespaceChar(code: number): boolean {
  return (
    code === 32 ||
    code === 9 ||
    code === 10 ||
    code === 13 ||
    code === 12 ||
    code === 11
  )
}

function isTagLead(code: number): boolean {
  return code !== ASTERISK && code !== FORWARD_SLASH && !isWhitespaceChar(code)
}

function scanTagEnd(value: string, start: number, limit?: number): number {
  const end = limit ?? value.length

  let index = start
  while (index < end) {
    const code = value.charCodeAt(index)
    if (code === ASTERISK || code === FORWARD_SLASH || isWhitespaceChar(code)) {
      break
    }
    index += 1
  }

  return index
}

export function remapAnnotationInstructions(
  instructions: AnnotationInstructions,
  originalValue: string,
  formattedValue: string
): AnnotationInstructions {
  if (originalValue === formattedValue) {
    return {
      block: instructions.block.map((instruction) => ({ ...instruction })),
      inline: instructions.inline.map((instruction) => ({ ...instruction })),
    }
  }

  const mapIndex = createIndexMapper(originalValue, formattedValue)

  return {
    block: instructions.block.map((instruction) => {
      const mappedStart = mapIndex(instruction.start)
      let mappedEnd = mapIndex(instruction.end)

      // Guard against degenerate zero-length ranges after formatting/rounding.
      if (instruction.end > instruction.start && mappedEnd <= mappedStart) {
        mappedEnd = Math.min(formattedValue.length, mappedStart + 1)
      }

      return {
        ...instruction,
        start: mappedStart,
        end: mappedEnd,
      }
    }),
    inline: instructions.inline.map((instruction) => ({
      ...instruction,
      index: mapIndex(instruction.index),
    })),
  }
}

function parseAnnotationProps(raw: string): Record<string, any> {
  const props: Record<string, any> = {}
  const trimmed = raw.trim()

  if (!trimmed) {
    return props
  }

  // Tokenize while respecting quoted strings and brace groups
  for (const property of tokenizeProps(trimmed)) {
    if (!property) continue

    const equalsIndex = property.indexOf('=')

    if (equalsIndex === -1) {
      props[property] = true
      continue
    }

    const key = property.slice(0, equalsIndex)
    const rawValue = property.slice(equalsIndex + 1)
    const quotedMatch = rawValue.match(/^(['\"])(.*)\1$/)

    if (quotedMatch) {
      props[key] = quotedMatch[2]
      continue
    }

    const bracedMatch = rawValue.match(/^\{(.+)\}$/)

    if (bracedMatch) {
      const value = bracedMatch[1]
      const nestedQuote = value.match(/^(['\"])(.*)\1$/)

      if (nestedQuote) {
        props[key] = nestedQuote[2]
      } else if (value === 'true' || value === 'false') {
        props[key] = value === 'true'
      } else {
        const number = Number(value)
        props[key] = Number.isNaN(number) ? value : number
      }
      continue
    }

    if (rawValue === 'true' || rawValue === 'false') {
      props[key] = rawValue === 'true'
      continue
    }

    const number = Number(rawValue)
    if (!Number.isNaN(number)) {
      props[key] = number
      continue
    }

    props[key] = rawValue
  }

  return props
}

function tokenizeProps(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let braceDepth = 0
  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (quote) {
      current += char
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }

    if (char === '{') {
      braceDepth++
      current += char
      continue
    }

    if (char === '}' && braceDepth > 0) {
      braceDepth--
      current += char
      continue
    }

    // Split on whitespace only when not inside quotes or braces
    if (braceDepth === 0 && /\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

function createIndexMapper(originalValue: string, formattedValue: string) {
  const anchors = buildAnchors(originalValue, formattedValue)
  const lastAnchor = anchors[anchors.length - 1]
  const formattedLength = lastAnchor.formatted

  return (position: number) => {
    if (position <= 0) {
      return 0
    }

    if (position >= lastAnchor.original) {
      return formattedLength
    }

    let previous = anchors[0]

    for (let index = 1; index < anchors.length; index++) {
      const current = anchors[index]

      if (position === current.original) {
        return current.formatted
      }

      if (position < current.original) {
        const originalDelta = current.original - previous.original

        if (originalDelta === 0) {
          return current.formatted
        }

        const formattedDelta = current.formatted - previous.formatted
        const ratio = (position - previous.original) / originalDelta
        const mapped = previous.formatted + ratio * formattedDelta

        if (!Number.isFinite(mapped)) {
          return current.formatted
        }

        if (formattedDelta >= 0) {
          return Math.round(
            Math.min(Math.max(mapped, previous.formatted), current.formatted)
          )
        }

        return Math.round(
          Math.min(Math.max(mapped, current.formatted), previous.formatted)
        )
      }

      previous = current
    }

    return formattedLength
  }
}

interface Anchor {
  original: number
  formatted: number
}

function buildAnchors(originalValue: string, formattedValue: string): Anchor[] {
  const anchors: Anchor[] = [{ original: 0, formatted: 0 }]
  let originalIndex = 0
  let formattedIndex = 0

  while (
    originalIndex < originalValue.length &&
    formattedIndex < formattedValue.length
  ) {
    const originalChar = originalValue[originalIndex]
    const formattedChar = formattedValue[formattedIndex]

    if (originalChar === formattedChar) {
      anchors.push({ original: originalIndex, formatted: formattedIndex })
      originalIndex++
      formattedIndex++
      continue
    }

    if (isWhitespace(originalValue.charCodeAt(originalIndex))) {
      originalIndex++
      continue
    }

    if (isWhitespace(formattedValue.charCodeAt(formattedIndex))) {
      formattedIndex++
      continue
    }

    const nextFormattedMatch = formattedValue.indexOf(
      originalChar,
      formattedIndex + 1
    )
    const nextOriginalMatch = originalValue.indexOf(
      formattedChar,
      originalIndex + 1
    )

    if (
      nextFormattedMatch !== -1 &&
      (nextOriginalMatch === -1 ||
        nextFormattedMatch - formattedIndex <=
          nextOriginalMatch - originalIndex)
    ) {
      formattedIndex = nextFormattedMatch
      continue
    }

    if (nextOriginalMatch !== -1) {
      originalIndex = nextOriginalMatch
      continue
    }

    originalIndex++
    formattedIndex++
  }

  anchors.push({
    original: originalValue.length,
    formatted: formattedValue.length,
  })

  anchors.sort((left, right) => {
    if (left.original === right.original) {
      return left.formatted - right.formatted
    }
    return left.original - right.original
  })

  const deduped: Anchor[] = []
  for (const anchor of anchors) {
    const last = deduped[deduped.length - 1]
    if (last && last.original === anchor.original) {
      deduped[deduped.length - 1] = anchor
    } else {
      deduped.push(anchor)
    }
  }

  return deduped
}

function isWhitespace(code: number): boolean {
  return (
    code === 9 ||
    code === 10 ||
    code === 11 ||
    code === 12 ||
    code === 13 ||
    code === 32 ||
    code === 160 ||
    code === 0x2028 ||
    code === 0x2029
  )
}
