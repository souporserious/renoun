interface BrowserLocationLike {
  protocol?: string
  hostname?: string
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

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

function resolveBrowserWebSocketHostname(hostname: string | undefined): string {
  const normalizedHostname = normalizeBrowserWebSocketHostname(hostname)
  if (!LOOPBACK_HOSTNAMES.has(normalizedHostname.toLowerCase())) {
    return 'localhost'
  }

  return normalizedHostname
}

export function resolveBrowserWebSocketUrl(
  port: string,
  location: BrowserLocationLike | undefined =
    typeof window === 'undefined' ? undefined : window.location
): string {
  const protocol = location?.protocol === 'https:' ? 'wss' : 'ws'
  const host = resolveBrowserWebSocketHostname(location?.hostname)
  return `${protocol}://${host}:${port}`
}
