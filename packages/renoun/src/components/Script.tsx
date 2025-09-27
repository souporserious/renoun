import React from 'react'

/** Determines how the script is included in the HTML */
type ScriptVariants =
  /** Renders a script tag with the `defer` attribute. */
  | 'defer'
  /** Renders a script tag with an async data URL to load the script as soon as possible. */
  | 'hoist'
  /** Renders a script tag with the script content inline. */
  | 'inline'

interface ScriptProps {
  /** The variant of script to render. Defaults to `defer`. */
  variant?: ScriptVariants

  /** A nonce for Content Security Policy */
  nonce?: string

  /**
   * A promise that resolves to a module with a default export containing the
   * script content. The script should be contained entirely within the default
   * export. Only types can be external to the default export.
   */
  children: Promise<any>
}

/** Renders a script tag with the provided script content. */
export async function Script({
  variant = 'defer',
  nonce,
  children,
}: ScriptProps) {
  const script = await children
  const body = getBody(script.default)
  if (variant === 'hoist') {
    const base64 = Buffer.from(body, 'utf8').toString('base64')
    return (
      <script
        nonce={nonce}
        async
        src={`data:text/javascript;base64,${base64}`}
      />
    )
  }
  return <script nonce={nonce} defer={variant === 'defer'} children={body} />
}

/** Extracts the body of a function as a string. */
function getBody(fn: Function): string {
  const string = Function.prototype.toString.call(fn).trim()

  if (string.startsWith('function') || string.startsWith('async function')) {
    const open = string.indexOf('{', string.indexOf(')'))
    return open !== -1 ? extractBalancedBlock(string, open) : ''
  }

  const arrowIndex = findTopLevelArrow(string)
  if (arrowIndex !== -1) {
    const brace = string.indexOf('{', arrowIndex)
    if (brace !== -1) return extractBalancedBlock(string, brace)
    const expression = string
      .slice(arrowIndex + 2)
      .trim()
      .replace(/^\(|\);?$/g, '')
    return `void (${expression});`
  }

  return ''
}

/** Returns the substring inside the balanced braces that start at `openIndex`. */
function extractBalancedBlock(source: string, openIndex: number): string {
  let depth = 1
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false
  let templateExprDepth = 0

  for (let index = openIndex + 1; index < source.length; index++) {
    const character = source[index]
    const prev = source[index - 1]
    const next = source[index + 1]

    if (inLineComment) {
      if (character === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (prev === '*' && character === '/') inBlockComment = false
      continue
    }

    if (inSingle) {
      if (!escaped && character === "'") inSingle = false
      escaped = character === '\\' && !escaped
      if (character !== '\\') escaped = false
      continue
    }
    if (inDouble) {
      if (!escaped && character === '"') inDouble = false
      escaped = character === '\\' && !escaped
      if (character !== '\\') escaped = false
      continue
    }
    if (inTemplate) {
      if (!escaped && character === '`' && templateExprDepth === 0) {
        inTemplate = false
        continue
      }
      if (!escaped && character === '{' && prev === '$') {
        templateExprDepth++
        continue
      }
      if (!escaped && character === '}' && templateExprDepth > 0) {
        templateExprDepth--
        continue
      }
      escaped = character === '\\' && !escaped
      if (character !== '\\') escaped = false
      continue
    }

    if (character === '/' && next === '/') {
      inLineComment = true
      index++
      continue
    }
    if (character === '/' && next === '*') {
      inBlockComment = true
      index++
      continue
    }

    if (character === "'") {
      inSingle = true
      continue
    }
    if (character === '"') {
      inDouble = true
      continue
    }
    if (character === '`') {
      inTemplate = true
      templateExprDepth = 0
      continue
    }

    if (character === '{') {
      depth++
      continue
    }
    if (character === '}') {
      depth--
      if (depth === 0) return source.slice(openIndex + 1, index)
      continue
    }
  }
  return ''
}

/** Finds the first top-level `=>` (ignoring strings/comments/templates). */
function findTopLevelArrow(source: string): number {
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false
  let templateExprDepth = 0

  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    const prev = source[index - 1]
    const next = source[index + 1]

    if (inLineComment) {
      if (character === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (prev === '*' && character === '/') inBlockComment = false
      continue
    }

    if (inSingle) {
      if (!escaped && character === "'") inSingle = false
      escaped = character === '\\' && !escaped
      if (character !== '\\') escaped = false
      continue
    }
    if (inDouble) {
      if (!escaped && character === '"') inDouble = false
      escaped = character === '\\' && !escaped
      if (character !== '\\') escaped = false
      continue
    }

    if (inTemplate) {
      if (!escaped && character === '`' && templateExprDepth === 0) {
        inTemplate = false
        continue
      }
      if (!escaped && character === '{' && prev === '$') {
        templateExprDepth++
        continue
      }
      if (!escaped && character === '}' && templateExprDepth > 0) {
        templateExprDepth--
        continue
      }
      escaped = character === '\\' && !escaped
      if (character !== '\\') escaped = false
      continue
    }

    if (character === '/' && next === '/') {
      inLineComment = true
      index++
      continue
    }
    if (character === '/' && next === '*') {
      inBlockComment = true
      index++
      continue
    }

    if (character === "'") {
      inSingle = true
      continue
    }
    if (character === '"') {
      inDouble = true
      continue
    }
    if (character === '`') {
      inTemplate = true
      templateExprDepth = 0
      continue
    }

    if (character === '=' && next === '>') return index
  }
  return -1
}
