import type { Diagnostic, DiagnosticMessageChain } from 'ts-morph'
import type { Token } from './highlighter'

export function getDiagnosticsForToken(
  token: Token,
  diagnostics: Diagnostic[]
): Diagnostic[] {
  let tokenDiagnostics: Diagnostic[] = []

  for (let diagnostic of diagnostics) {
    const diagnosticStart = diagnostic.getStart()
    const diagnosticEnd = diagnosticStart + diagnostic.getLength()

    if (token.start >= diagnosticStart && token.end <= diagnosticEnd) {
      tokenDiagnostics.push(diagnostic)
    }
  }

  return tokenDiagnostics
}

export function getDiagnosticMessageText(
  message: string | DiagnosticMessageChain
): string {
  if (typeof message === 'string') {
    return message
  } else {
    const nextMessages = message.getNext()
    let result = message.getMessageText()

    if (Array.isArray(nextMessages)) {
      for (const nextMessage of nextMessages) {
        result += '\n' + getDiagnosticMessageText(nextMessage)
      }
    } else if (nextMessages) {
      result += '\n' + getDiagnosticMessageText(nextMessages)
    }

    return result
  }
}
