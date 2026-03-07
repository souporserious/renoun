interface BrowserLocationLike {
  protocol?: string
  hostname?: string
}

function normalizeBrowserWebSocketHostname(hostname: string | undefined): string {
  if (typeof hostname !== 'string') {
    return 'localhost'
  }

  const trimmedHostname = hostname.trim()
  if (trimmedHostname.length === 0) {
    return 'localhost'
  }

  if (
    trimmedHostname.includes(':') &&
    !trimmedHostname.startsWith('[') &&
    !trimmedHostname.endsWith(']')
  ) {
    return `[${trimmedHostname}]`
  }

  return trimmedHostname
}

export function resolveBrowserWebSocketUrl(
  port: string,
  location: BrowserLocationLike | undefined =
    typeof window === 'undefined' ? undefined : window.location
): string {
  const protocol = location?.protocol === 'https:' ? 'wss' : 'ws'
  const host = normalizeBrowserWebSocketHostname(location?.hostname)
  return `${protocol}://${host}:${port}`
}
