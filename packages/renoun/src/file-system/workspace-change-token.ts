export const WORKSPACE_TOKEN_UNTRUSTED_IGNORED_ONLY_MARKER = ';ignored-only:1'
export const WORKSPACE_TOKEN_UNTRUSTED_INCLUDE_GIT_IGNORED_MARKER =
  ';include-gitignored:1'

export function markWorkspaceTokenForGitIgnoredSnapshots(
  token: string | null | undefined
): string | null {
  if (!token) {
    return null
  }

  if (token.includes(WORKSPACE_TOKEN_UNTRUSTED_INCLUDE_GIT_IGNORED_MARKER)) {
    return token
  }

  return `${token}${WORKSPACE_TOKEN_UNTRUSTED_INCLUDE_GIT_IGNORED_MARKER}`
}

export function isTrustedWorkspaceChangeToken(
  token: string | null | undefined
): token is string {
  if (!token) {
    return false
  }

  return (
    !token.includes(WORKSPACE_TOKEN_UNTRUSTED_IGNORED_ONLY_MARKER) &&
    !token.includes(WORKSPACE_TOKEN_UNTRUSTED_INCLUDE_GIT_IGNORED_MARKER)
  )
}
