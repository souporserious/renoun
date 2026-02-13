const PUBLIC_ERROR_CODE_KEY = '__renounPublicErrorCode'
const PUBLIC_ERROR_MESSAGE_KEY = '__renounPublicErrorMessage'

export const RENOUN_PUBLIC_ERROR_CODES = {
  GET_TOKENS_DIAGNOSTICS: 'RENOUN_GET_TOKENS_DIAGNOSTICS',
} as const

export type RenounPublicErrorCode =
  (typeof RENOUN_PUBLIC_ERROR_CODES)[keyof typeof RENOUN_PUBLIC_ERROR_CODES]

export interface RenounPublicError {
  code: RenounPublicErrorCode
  message: string
}

const RENOUN_PUBLIC_ERROR_CODE_SET = new Set<RenounPublicErrorCode>(
  Object.values(RENOUN_PUBLIC_ERROR_CODES)
)

type PublicErrorTarget = Error & Record<string, unknown>

export function attachPublicError(
  error: Error,
  details: RenounPublicError
): Error {
  const target = error as unknown as PublicErrorTarget
  target[PUBLIC_ERROR_CODE_KEY] = details.code
  target[PUBLIC_ERROR_MESSAGE_KEY] = details.message
  return error
}

export function readPublicError(error: unknown): RenounPublicError | undefined {
  if (!(error instanceof Error)) {
    return undefined
  }

  const candidate = error as unknown as PublicErrorTarget
  const code = candidate[PUBLIC_ERROR_CODE_KEY]
  const message = candidate[PUBLIC_ERROR_MESSAGE_KEY]

  if (
    typeof code !== 'string' ||
    !RENOUN_PUBLIC_ERROR_CODE_SET.has(code as RenounPublicErrorCode) ||
    typeof message !== 'string' ||
    message.length === 0
  ) {
    return undefined
  }

  return {
    code: code as RenounPublicErrorCode,
    message,
  }
}
