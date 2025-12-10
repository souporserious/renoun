type EmphasisMarker = '*' | '_' | '~'

interface EmphasisToken {
  marker: EmphasisMarker
  length: number
  index: number
  line: number
}

type InlineMathKind = 'paren' | 'bracket'

interface InlineMathToken {
  kind: InlineMathKind // \( ... \) or \[ ... \]
  index: number
  line: number
}

interface InlineDollarToken {
  index: number
  line: number
}

interface ScanResult {
  emphasisStack: EmphasisToken[]
  inlineMathStack: InlineMathToken[]
  inlineDollarStack: InlineDollarToken[]
  inInlineCode: boolean
  inMathBlock: boolean
  inlineCodeStartIndex: number | null
  mathBlockStartIndex: number | null
}

interface LinkCandidate {
  isImage: boolean
  bracketStart: number // index of '['
  linkStart: number // index of '('
  urlStart: number // first url char after '('
  urlEnd: number | null
  parenDepth: number
}

const NO_TAIL_CUTOFF = Number.POSITIVE_INFINITY

interface ScanAndHealBaseResult {
  /** The base text after fixing incomplete links/images at the tail. */
  baseText: string
  /** Scanner state computed in the same pass. */
  scan: ScanResult
  /**
   * Any markers that start at or after this index are considered part of the
   * truncated / replaced tail and are ignored when adding synthetic closers.
   *
   * Uses indices relative to the original input string.
   */
  tailCutoffIndex: number
}

/**
 * Lightweight helpers
 */
function isWhitespace(character: string): boolean {
  return (
    character === ' ' ||
    character === '\n' ||
    character === '\t' ||
    character === '\r' ||
    character === '\f' ||
    character === '\v'
  )
}

function isWordCharacter(character: string): boolean {
  if (!character) return false
  const code = character.charCodeAt(0)
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    character === '_'
  )
}

function isValidAsteriskRun(
  previousCharacter: string,
  nextCharacter: string
): boolean {
  // Disallow word-internal runs like foo*bar
  if (isWordCharacter(previousCharacter) && isWordCharacter(nextCharacter)) {
    return false
  }
  // Require some non-whitespace content after
  if (!nextCharacter || isWhitespace(nextCharacter)) {
    return false
  }
  return true
}

function isPunctuation(character: string): boolean {
  if (!character) return false
  return !isWhitespace(character) && !isWordCharacter(character)
}

function computeEmphasisFlanking(
  marker: EmphasisMarker,
  previousCharacter: string,
  nextCharacter: string
): { canOpen: boolean; canClose: boolean } {
  const prevIsWhitespace =
    previousCharacter === '' || isWhitespace(previousCharacter)
  const nextIsWhitespace = nextCharacter === '' || isWhitespace(nextCharacter)
  const prevIsPunct = isPunctuation(previousCharacter)
  const nextIsPunct = isPunctuation(nextCharacter)

  let canOpen =
    !nextIsWhitespace && !(nextIsPunct && !prevIsWhitespace && !prevIsPunct)
  let canClose =
    !prevIsWhitespace && !(prevIsPunct && !nextIsWhitespace && !nextIsPunct)

  // Disallow word-internal runs for '*' and '_' to match our healing rules.
  if (
    (marker === '*' || marker === '_') &&
    isWordCharacter(previousCharacter) &&
    isWordCharacter(nextCharacter)
  ) {
    canOpen = false
    canClose = false
  }

  if (marker === '_') {
    canOpen = canOpen && (!canClose || prevIsPunct || prevIsWhitespace)
    canClose = canClose && (!canOpen || nextIsPunct || nextIsWhitespace)
  }

  return { canOpen, canClose }
}

/**
 * Handle:
 *   - Incomplete links: [text](url   →   [text](streamdown:incomplete-link)
 *   - Incomplete images: ![alt](url  →   removed entirely
 */
// The single-pass scanner below replaces the older two-pass
// fixIncompleteLinksAndImages + scanUnmatchedMarkers helpers.

function computeTailFix(
  text: string,
  candidates: LinkCandidate[]
): { baseText: string; tailCutoffIndex: number } {
  // Only care about the last incomplete candidate at the tail
  for (
    let candidateIndex = candidates.length - 1;
    candidateIndex >= 0;
    candidateIndex -= 1
  ) {
    const candidate = candidates[candidateIndex]
    if (candidate.urlEnd != null) continue

    if (candidate.isImage) {
      // Drop incomplete image entirely
      const bangIndex = candidate.bracketStart - 1
      const removeStart =
        bangIndex >= 0 && text.charCodeAt(bangIndex) === 33 /* '!' */
          ? bangIndex
          : candidate.bracketStart
      return {
        baseText: text.slice(0, removeStart),
        tailCutoffIndex: removeStart,
      }
    }

    // Replace partial URL with sentinel, keeping everything before the URL
    const beforeUrl = text.slice(0, candidate.urlStart)
    return {
      baseText: beforeUrl + 'streamdown:incomplete-link)',
      tailCutoffIndex: candidate.urlStart,
    }
  }

  return { baseText: text, tailCutoffIndex: NO_TAIL_CUTOFF }
}

function scanAndHealBase(text: string): ScanAndHealBaseResult {
  const emphasisStack: EmphasisToken[] = []
  const inlineMathStack: InlineMathToken[] = []
  const inlineDollarStack: InlineDollarToken[] = []
  const bracketStack: Array<{ index: number; isImage: boolean }> = []
  const candidates: LinkCandidate[] = []

  let inCodeBlock = false
  let inInlineCode = false
  let inMathBlock = false
  let inInlineMath = false
  let isEscaped = false

  let lineNumber = 0
  let currentLineStartIndex = 0

  let inlineCodeStartIndex: number | null = null
  let mathBlockStartIndex: number | null = null

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    // Newline always matters for line/column tracking
    if (character === '\n') {
      lineNumber += 1
      currentLineStartIndex = index + 1
      // Newline itself cannot start any markers, so we can continue
      isEscaped = false
      continue
    }

    // If the previous character was a backslash escape, this one is literal
    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (!inCodeBlock && !inInlineCode && !inMathBlock && !inInlineMath) {
      /**
       * Link / image candidate tracking (same rules as the old
       * fixIncompleteLinksAndImages implementation).
       */
      if (character === '[') {
        const isImage = index > 0 && text.charCodeAt(index - 1) === 33 // '!'
        bracketStack.push({ index, isImage })
        continue
      }

      if (character === ']') {
        const bracket = bracketStack.pop()
        if (!bracket) continue

        // Immediate "(" after "]" starts a potential URL
        if (
          index + 1 < text.length &&
          text.charCodeAt(index + 1) === 40 /* '(' */
        ) {
          candidates.push({
            isImage: bracket.isImage,
            bracketStart: bracket.index,
            linkStart: index + 1,
            urlStart: index + 2,
            urlEnd: null,
            parenDepth: 1,
          })
        }
        continue
      }

      if (character === '(') {
        // Nested parens inside URLs
        for (const candidate of candidates) {
          if (candidate.urlEnd == null) candidate.parenDepth += 1
        }
        continue
      }

      if (character === ')') {
        for (
          let candidateIndex = candidates.length - 1;
          candidateIndex >= 0;
          candidateIndex -= 1
        ) {
          const candidate = candidates[candidateIndex]
          if (candidate.urlEnd == null && candidate.parenDepth > 0) {
            candidate.parenDepth -= 1
            if (candidate.parenDepth === 0) {
              candidate.urlEnd = index + 1
            }
            break
          }
        }
        continue
      }
    }

    // Bail out if this character doesn't start any constructs we care about
    if (
      character !== '\\' &&
      character !== '`' &&
      character !== '$' &&
      character !== '*' &&
      character !== '_' &&
      character !== '~'
    ) {
      continue
    }

    // Backslash may be an escape or KaTeX inline math delimiter
    if (character === '\\') {
      const nextCharacter = text[index + 1] ?? ''

      if (!inCodeBlock && !inInlineCode && !inMathBlock) {
        if (nextCharacter === '(' || nextCharacter === '[') {
          inlineMathStack.push({
            kind: nextCharacter === '(' ? 'paren' : 'bracket',
            index,
            line: lineNumber,
          })
          inInlineMath = true
          index += 1
          continue
        }
        if (nextCharacter === ')' || nextCharacter === ']') {
          if (inlineMathStack.length > 0) {
            const expectedKind: InlineMathKind =
              nextCharacter === ')' ? 'paren' : 'bracket'
            for (
              let stackIndex = inlineMathStack.length - 1;
              stackIndex >= 0;
              stackIndex -= 1
            ) {
              if (inlineMathStack[stackIndex].kind === expectedKind) {
                inlineMathStack.splice(stackIndex, 1)
                break
              }
            }
            if (inlineMathStack.length === 0) {
              inInlineMath = false
            }
          }
          index += 1
          continue
        }
      }

      isEscaped = true
      continue
    }

    let isLineStart = true
    for (
      let lineIndex = currentLineStartIndex;
      lineIndex < index;
      lineIndex++
    ) {
      if (!isWhitespace(text[lineIndex])) {
        isLineStart = false
        break
      }
    }

    // Fenced code ``` at column 0
    if (!inInlineCode && !inMathBlock && !inInlineMath && character === '`') {
      const isFence = text.startsWith('```', index)
      if (!inCodeBlock && isFence && isLineStart) {
        inCodeBlock = true
        index += 2
        continue
      }
      if (inCodeBlock && isFence && isLineStart) {
        inCodeBlock = false
        index += 2
        continue
      }
    }

    // Block math $$...$$
    if (!inCodeBlock && !inInlineMath && character === '$') {
      const nextCharacter = text[index + 1] ?? ''

      // Double Dollar $$
      if (nextCharacter === '$') {
        if (!inMathBlock) {
          inMathBlock = true
          mathBlockStartIndex = index
        } else {
          inMathBlock = false
          mathBlockStartIndex = null
        }
        index += 1
        continue
      }
    }

    if (inCodeBlock || inMathBlock || inInlineMath) {
      continue
    }

    // Inline code `code`
    if (character === '`') {
      if (!inInlineCode) {
        inInlineCode = true
        inlineCodeStartIndex = index
      } else {
        inInlineCode = false
        inlineCodeStartIndex = null
      }
      continue
    }

    if (inInlineCode) {
      continue
    }

    // Inline math with single dollars $...$
    if (character === '$') {
      if (inlineDollarStack.length > 0) {
        inlineDollarStack.pop()
      } else {
        inlineDollarStack.push({ index, line: lineNumber })
      }
      continue
    }

    // Emphasis / strikethrough
    if (character === '*' || character === '_' || character === '~') {
      const marker = character as EmphasisMarker
      let runLength = 1
      const maxRunLength = marker === '~' ? 2 : 3

      while (
        index + runLength < text.length &&
        text[index + runLength] === marker &&
        runLength < maxRunLength
      ) {
        runLength += 1
      }

      const previousCharacter = index === 0 ? '' : text[index - 1]
      const nextIndex = index + runLength
      const nextCharacter = nextIndex < text.length ? text[nextIndex] : ''

      // "* " at line start is list bullet, not emphasis
      if (
        marker === '*' &&
        (index === 0 || previousCharacter === '\n') &&
        (nextCharacter === ' ' || nextCharacter === '\t')
      ) {
        index += runLength - 1
        continue
      }

      let { canOpen, canClose } = computeEmphasisFlanking(
        marker,
        previousCharacter,
        nextCharacter
      )

      // Additional marker-specific constraints.
      if (marker === '*') {
        if (!isValidAsteriskRun(previousCharacter, nextCharacter)) {
          canOpen = false
          canClose = false
        }
      } else if (marker === '~' && runLength < 2) {
        canOpen = false
        canClose = false
      }

      let normalizedLength = runLength
      if (marker === '_') {
        normalizedLength = runLength > 2 ? 2 : runLength
      } else if (marker === '~') {
        normalizedLength = 2
      }

      let handled = false
      if (canClose) {
        for (
          let stackIndex = emphasisStack.length - 1;
          stackIndex >= 0;
          stackIndex -= 1
        ) {
          const existing = emphasisStack[stackIndex]
          if (
            existing.marker === marker &&
            existing.length === normalizedLength
          ) {
            emphasisStack.splice(stackIndex, 1)
            handled = true
            break
          }
        }
      }

      if (!handled && canOpen) {
        emphasisStack.push({
          marker,
          length: normalizedLength,
          index,
          line: lineNumber,
        })
      }

      index += runLength - 1
    }
  }

  const scan: ScanResult = {
    emphasisStack,
    inlineMathStack,
    inlineDollarStack,
    inInlineCode,
    inMathBlock,
    inlineCodeStartIndex,
    mathBlockStartIndex,
  }

  const { baseText, tailCutoffIndex } = computeTailFix(text, candidates)

  return { baseText, scan, tailCutoffIndex }
}

/** Heal a full markdown string that may have incomplete markdown at the tail. */
function healMarkdownString(input: string): string {
  if (!input) return input

  const { baseText, scan, tailCutoffIndex } = scanAndHealBase(input)

  let result = baseText

  // Close unbalanced inline code, but only if its opener is not in the
  // truncated / replaced tail.
  if (
    scan.inInlineCode &&
    scan.inlineCodeStartIndex !== null &&
    scan.inlineCodeStartIndex < tailCutoffIndex
  ) {
    result += '`'
  }

  // Close unbalanced block math $$...$$, subject to the same tail cutoff.
  if (
    scan.inMathBlock &&
    scan.mathBlockStartIndex !== null &&
    scan.mathBlockStartIndex < tailCutoffIndex
  ) {
    result += '$$'
  }

  // Close any remaining inline math delimiters, skipping ones that originated
  // in the truncated / replaced tail.
  if (scan.inlineMathStack.length > 0) {
    for (
      let stackIndex = scan.inlineMathStack.length - 1;
      stackIndex >= 0;
      stackIndex -= 1
    ) {
      const inlineMathToken = scan.inlineMathStack[stackIndex]
      if (inlineMathToken.index >= tailCutoffIndex) continue
      result += inlineMathToken.kind === 'paren' ? '\\)' : '\\]'
    }
  }

  // Close any remaining single-dollar inline math delimiters, skipping ones
  // that originated in the truncated / replaced tail.
  if (scan.inlineDollarStack.length > 0) {
    for (
      let stackIndex = scan.inlineDollarStack.length - 1;
      stackIndex >= 0;
      stackIndex -= 1
    ) {
      const inlineDollarToken = scan.inlineDollarStack[stackIndex]
      if (inlineDollarToken.index >= tailCutoffIndex) continue
      result += '$'
    }
  }

  // For emphasis, we continue to only heal the last line of the document.
  // We do this by finding the maximum line index among tokens that are not
  // part of the truncated / replaced tail and then closing only those tokens.
  let maxLine = -1
  for (const token of scan.emphasisStack) {
    if (token.index >= tailCutoffIndex) continue
    if (token.line > maxLine) maxLine = token.line
  }

  if (maxLine !== -1) {
    for (
      let stackIndex = scan.emphasisStack.length - 1;
      stackIndex >= 0;
      stackIndex -= 1
    ) {
      const token = scan.emphasisStack[stackIndex]
      if (token.index >= tailCutoffIndex) continue
      if (token.line !== maxLine) continue

      let closing: string
      if (token.marker === '~') {
        closing = '~~'
      } else {
        closing = token.marker.repeat(token.length)
      }
      result += closing
    }
  }

  return result
}

/**
 * Heal a sliding window of the input string.
 *
 * - Always includes the entire last line.
 * - Work per call is bounded by windowSize instead of input length.
 */
export function healMarkdown(input: string, windowSize: number = 4096): string {
  if (!input) {
    return input
  }

  if (input.length <= windowSize) {
    return healMarkdownString(input)
  }

  const approximateStartIndex = input.length - windowSize

  // Ensure we start the tail at a line boundary, so last-line logic is preserved.
  const lastNewlineBeforeWindow = input.lastIndexOf('\n', approximateStartIndex)
  const tailStartIndex =
    lastNewlineBeforeWindow === -1 ? 0 : lastNewlineBeforeWindow + 1

  if (tailStartIndex === 0) {
    const prefix = input.slice(0, approximateStartIndex)
    const tail = input.slice(approximateStartIndex)
    const healedTail = healMarkdownString(tail)
    return prefix + healedTail
  }

  const prefix = input.slice(0, tailStartIndex)
  const tail = input.slice(tailStartIndex)
  const healedTail = healMarkdownString(tail)

  return prefix + healedTail
}
