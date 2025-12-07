import type { Root, Node } from 'mdast'
import { visit } from 'unist-util-visit'

const VISITED_NODES = new Set(['text', 'inlineCode', 'paragraph'])

const IGNORED_HTML_ELEMENTS = new Set(['code', 'pre', 'kbd', 'style', 'script'])

function isIgnoredMdxElement(parent: Node | null | undefined): boolean {
  if (
    parent === null ||
    parent === undefined ||
    (parent.type !== 'mdxJsxTextElement' && parent.type !== 'mdxJsxFlowElement')
  ) {
    return false
  }

  if (!('name' in parent)) return false

  const name = (parent as { name?: unknown }).name

  return typeof name === 'string' && IGNORED_HTML_ELEMENTS.has(name)
}

function check(
  node: Node,
  _index: number | undefined,
  parent: Node | null | undefined
) {
  return (
    parent !== null &&
    parent !== undefined &&
    !isIgnoredMdxElement(parent) &&
    VISITED_NODES.has(node.type) &&
    (isLiteral(node) || isParagraph(node))
  )
}

/**
 * remark plugin to apply smart typography transformations without external
 * dependencies.
 */
export default function remarkTypography() {
  return (tree: Root) => {
    let allText = ''
    let startIndex = 0
    const nodes: (Literal | Node)[] = []

    visit(tree, check, (node) => {
      if (isLiteral(node)) {
        allText +=
          node.type === 'text' ? node.value : 'A'.repeat(node.value.length)
      } else if (isParagraph(node)) {
        // Inject a space to help detect opening quotes at the start of
        // paragraphs.
        allText += ' '
      }
      nodes.push(node)
    })

    const processed = transformText(allText)

    for (const node of nodes) {
      if (isLiteral(node)) {
        const endIndex = startIndex + node.value.length
        if (node.type === 'text') {
          node.value = processed.slice(startIndex, endIndex).join('')
        }
        startIndex = endIndex
      } else if (isParagraph(node)) {
        startIndex += 1
      }
    }
  }
}

function transformText(value: string): string[] {
  const output = new Array<string>(value.length).fill('')
  let index = 0

  while (index < value.length) {
    const character = value[index]

    if (character === '.') {
      const runEnd = findRunEnd(value, index, '.')
      const runLength = runEnd - index

      if (runLength >= 3) {
        let remaining = runLength
        while (remaining >= 3) {
          output[index] = '…'
          output[index + 1] = ''
          output[index + 2] = ''
          index += 3
          remaining -= 3
        }
        while (remaining > 0) {
          output[index] = '.'
          index += 1
          remaining -= 1
        }
        continue
      }
    }

    if (character === '-' && value[index + 1] === '-') {
      output[index] = '—'
      output[index + 1] = ''
      index += 2
      continue
    }

    if (character === '"' || character === "'") {
      if (character === '"' && value[index + 1] === '"') {
        // Handle empty quotes like "" as an opening–closing pair.
        output[index] = '“'
        output[index + 1] = '”'
        index += 2
        continue
      }

      output[index] =
        character === '"'
          ? transformDoubleQuote(value, index)
          : transformSingleQuote(value, index)
      index += 1
      continue
    }

    output[index] = character
    index += 1
  }

  return output
}

function nextSemanticChar(value: string, index: number) {
  for (let pos = index + 1; pos < value.length; pos++) {
    const ch = value[pos]
    if (isWhitespace(ch) || ch === '.') continue
    return ch
  }
  return undefined
}

function transformDoubleQuote(text: string, index: number) {
  const previousImmediate =
    index > 0 ? (text[index - 1] as string | undefined) : undefined
  const previousSemantic = findPreviousSemanticChar(text, index)
  const next = findNextVisibleCharacter(text, index)
  const nextSemantic = nextSemanticChar(text, index)

  const previousSemanticIsWord = isWordCharacter(previousSemantic)
  const nextIsWord = isWordCharacter(next)
  const nextSemanticIsWord = isWordCharacter(nextSemantic)

  const previousImmediateIsWhitespace =
    previousImmediate !== undefined && isWhitespace(previousImmediate)
  const previousImmediateIsSoftOpenPunct =
    previousImmediate !== undefined && /[,;:]/.test(previousImmediate)

  // Start of text, or after visible whitespace: usually opening.
  if (
    (previousImmediate === undefined ||
      previousImmediateIsWhitespace ||
      previousSemantic === undefined) &&
    (nextIsWord || nextSemanticIsWord)
  ) {
    return '“'
  }

  // After a "soft" punctuation mark (comma / colon / semicolon),
  // where the semantic char before that punctuation is a word,
  // and we're starting a new word: treat as opening.
  if (
    previousImmediateIsSoftOpenPunct &&
    previousSemanticIsWord &&
    (nextIsWord || nextSemanticIsWord)
  ) {
    return '“'
  }

  // Otherwise, fall back to the semantic heuristic:
  // opening when not following a word; closing otherwise.
  if (!previousSemanticIsWord && (nextIsWord || nextSemanticIsWord)) {
    return '“'
  }

  return '”'
}

function transformSingleQuote(text: string, index: number) {
  const previousImmediate =
    index > 0 ? (text[index - 1] as string | undefined) : undefined
  const next = findNextVisibleCharacter(text, index)

  const previousIsWord = isWordCharacter(previousImmediate)
  const nextIsWord = isWordCharacter(next)

  // 1. Inside or at the end of a word: contractions / possessives -> apostrophe
  if (previousIsWord) {
    return '’'
  }

  // 2. Leading decade / number-like: '90s, '01 -> apostrophe
  if (!previousIsWord && next !== undefined && /\d/.test(next)) {
    return '’'
  }

  // 3. Leading apostrophe at start of a word with no closing quote in same token:
  //    'Twas, 'tis, 'cause, 'em, etc. -> apostrophe
  if (
    !previousIsWord &&
    nextIsWord &&
    !hasClosingSingleQuoteInToken(text, index)
  ) {
    return '’'
  }

  // 4. Otherwise, treat as a real quote: opening if it starts a word…
  if (!previousIsWord && nextIsWord) {
    return '‘'
  }

  // 5. …everything else falls back to closing
  return '’'
}

function hasClosingSingleQuoteInToken(text: string, index: number): boolean {
  // Scan forward until we hit whitespace or a hard boundary,
  // and see if there's another single quote.
  for (let pos = index + 1; pos < text.length; pos++) {
    const ch = text[pos]

    if (isWhitespace(ch)) return false
    if (ch === "'") return true

    // Optional: treat some chars as token boundaries too
    if (/[)\]\}]/.test(ch)) return false
  }
  return false
}

function findRunEnd(value: string, index: number, target: string) {
  let position = index
  while (position < value.length && value[position] === target) {
    position += 1
  }
  return position
}

const TRAILING_PUNCT = /[.,!?;:]/

function findPreviousSemanticChar(value: string, index: number) {
  let seenPunct = false
  for (let pos = index - 1; pos >= 0; pos--) {
    const ch = value[pos]
    if (isWhitespace(ch)) continue
    if (!seenPunct && TRAILING_PUNCT.test(ch)) {
      // First trailing punct immediately before the quote: skip it,
      // but remember we saw it, so we don't skip arbitrary punctuation.
      seenPunct = true
      continue
    }
    return ch
  }
  return undefined
}

function findNextVisibleCharacter(value: string, index: number) {
  for (let position = index + 1; position < value.length; position += 1) {
    const character = value[position]
    if (!isWhitespace(character)) return character
  }
  return undefined
}

function isWordCharacter(character: string | undefined) {
  return character !== undefined && /[A-Za-z0-9]/.test(character)
}

function isWhitespace(character: string) {
  return (
    character === ' ' ||
    character === '\n' ||
    character === '\t' ||
    character === '\r' ||
    character === '\u00A0'
  )
}

interface Literal extends Node {
  value: string
}

function isLiteral(node: Node): node is Literal {
  return 'value' in node && typeof (node as Literal).value === 'string'
}

function isParagraph(node: Node): node is Node {
  return node.type === 'paragraph'
}
