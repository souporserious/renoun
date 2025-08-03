/** Parses JSON with comments. */
export function parseJsonWithComments<Output = unknown>(input: string): Output {
  let stringChar: '"' | "'" = '"'
  let inString = false
  let commentType: '//' | '/*' = '//'
  let inComment = false
  let output = ''
  let previous = ''

  for (let index = 0; index < input.length; index++) {
    const current = input[index]
    const next = input[index + 1]

    if (inComment) {
      if (
        (commentType === '/*' && previous === '*' && current === '/') ||
        (commentType === '//' && (current === '\n' || current === '\r'))
      ) {
        inComment = false
        previous = ''
        if (commentType === '//') {
          output += current
        }
      } else {
        previous = current
        continue
      }
      continue
    }

    if (inString) {
      if (current === '\\') {
        output += current + (next ?? '')
        index++
        continue
      }
      if (current === stringChar) {
        inString = false
      }
      output += current
      continue
    }

    // outside string/comment
    if (current === '"' || current === "'") {
      stringChar = current as '"' | "'"
      inString = true
    } else if (current === '/' && next === '*') {
      commentType = '/*'
      inComment = true
      index++
      continue
    } else if (current === '/' && next === '/') {
      commentType = '//'
      inComment = true
      index++
      continue
    }

    output += current
    previous = current
  }

  if (inString) {
    throw new SyntaxError('[renoun] Unterminated string literal.')
  }

  if (inComment && commentType === '/*') {
    throw new SyntaxError('[renoun] Unterminated block comment.')
  }

  return JSON.parse(output) as Output
}
