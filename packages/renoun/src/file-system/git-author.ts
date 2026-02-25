const GITHUB_NOREPLY_DOMAIN = '@users.noreply.github.com'
const GITHUB_USERNAME_PATTERN =
  /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i

export function normalizeGitHubUsername(
  value: string | undefined
): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim().replace(/^@+/, '')
  if (!trimmed) {
    return undefined
  }

  if (!GITHUB_USERNAME_PATTERN.test(trimmed)) {
    return undefined
  }

  return trimmed
}

export function extractGitHubUsernameFromEmail(
  email: string | undefined
): string | undefined {
  if (typeof email !== 'string') {
    return undefined
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail.endsWith(GITHUB_NOREPLY_DOMAIN)) {
    return undefined
  }

  const localPart = normalizedEmail.slice(0, -GITHUB_NOREPLY_DOMAIN.length)
  if (!localPart) {
    return undefined
  }

  const plusIndex = localPart.indexOf('+')
  const candidate =
    plusIndex === -1 ? localPart : localPart.slice(plusIndex + 1)

  return normalizeGitHubUsername(candidate)
}

export function resolveGitHubUsername(options: {
  githubLogin?: string
  email?: string
}): string | undefined {
  return (
    normalizeGitHubUsername(options.githubLogin) ??
    extractGitHubUsernameFromEmail(options.email)
  )
}

export function toGitHubProfileUrl(
  username: string | undefined
): string | undefined {
  const normalizedUsername = normalizeGitHubUsername(username)
  if (!normalizedUsername) {
    return undefined
  }

  return `https://github.com/${normalizedUsername}`
}
