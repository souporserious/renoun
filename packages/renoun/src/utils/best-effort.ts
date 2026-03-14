import { getDebugLogger } from './debug.ts'

function toBestEffortErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return String(error)
}

/**
 * Record a non-fatal error from a best-effort path without breaking callers.
 */
export function reportBestEffortError(context: string, error: unknown): void {
  const logger = getDebugLogger()
  if (!logger.isEnabled('debug')) {
    return
  }

  const message = toBestEffortErrorMessage(error)

  try {
    logger.debug('Best-effort operation failed', () => ({
      operation: 'best-effort',
      data: {
        context,
        error: message,
      },
    }))
  } catch (loggingError) {
    // Logging must never fail the caller when handling a suppressed error.
    void loggingError
  }
}
