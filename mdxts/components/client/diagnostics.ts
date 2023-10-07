import type { Diagnostic, DiagnosticMessageChain } from 'ts-morph'

export function hasDiagnosticsForToken(
  token: any,
  tokenIndex: number,
  lineIndex: number,
  tokens: any[],
  diagnostics: Diagnostic[],
  code: string
) {
  const linesBeforeToken = code.split('\n').slice(0, lineIndex)
  const charsBeforeTokenLine = linesBeforeToken.reduce(
    (sum, line) => sum + line.length + 1, // +1 for the newline character
    0
  )

  // Calculate position of the token within its line by summing up lengths of previous tokens in the same line
  const positionWithinLine = tokens[lineIndex]
    .slice(0, tokenIndex)
    .reduce((sum, prevToken) => sum + prevToken.content.length, 0)
  const tokenStart = charsBeforeTokenLine + positionWithinLine

  const tokenEnd = tokenStart + token.content.length

  // Iterate over the diagnostics to see if any of them overlap with the token's position.
  for (let diagnostic of diagnostics) {
    const diagnosticStart = diagnostic.getStart()
    const diagnosticEnd = diagnosticStart + diagnostic.getLength()

    if (
      (diagnosticStart >= tokenStart && diagnosticStart <= tokenEnd) ||
      (diagnosticEnd >= tokenStart && diagnosticEnd <= tokenEnd) ||
      (diagnosticStart <= tokenStart && diagnosticEnd >= tokenEnd)
    ) {
      return true
    }
  }

  return false
}

export function getDiagnosticMessageText(
  message: string | DiagnosticMessageChain
): string {
  if (typeof message === 'string') {
    return message
  } else {
    const nextMessage = message.getNext()
    let result = message.getMessageText()

    if (Array.isArray(nextMessage)) {
      for (const msg of nextMessage) {
        result += '\n' + getDiagnosticMessageText(msg)
      }
    } else if (nextMessage) {
      result += '\n' + getDiagnosticMessageText(nextMessage)
    }

    return result
  }
}
