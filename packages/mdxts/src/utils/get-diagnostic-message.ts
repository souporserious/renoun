import type { DiagnosticMessageChain } from 'ts-morph'

/** Parses a diagnostic message into a string. */
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
