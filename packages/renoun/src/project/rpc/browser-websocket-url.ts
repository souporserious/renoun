interface BrowserLocationLike {
  protocol?: string
  hostname?: string
}

interface BrowserRuntimeLike {
  port: string
  host?: string
}

type ResolvedWebSocketEndpoint = {
  protocol: 'ws' | 'wss'
  host: string
}

function normalizeHost(host: string): string {
  return host.trim().replace(/^\[/, '').replace(/\]$/, '')
}

function formatWebSocketHost(host: string): string {
  const normalizedHost = normalizeHost(host)
  return normalizedHost.includes(':')
    ? `[${normalizedHost}]`
    : normalizedHost
}

function isLoopbackHost(host: string | undefined): boolean {
  if (typeof host !== 'string' || host.length === 0) {
    return false
  }

  const normalizedHost = normalizeHost(host).toLowerCase()
  return (
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '::1'
  )
}

function resolveWebSocketEndpoint(
  runtime: BrowserRuntimeLike,
  location?: BrowserLocationLike
): ResolvedWebSocketEndpoint {
  const runtimeHost =
    typeof runtime.host === 'string' && runtime.host.trim().length > 0
      ? runtime.host.trim()
      : undefined
  const browserHost =
    typeof location?.hostname === 'string' && location.hostname.trim().length > 0
      ? location.hostname.trim()
      : undefined

  // When the page is served through a proxy or tunnel, prefer the browser's
  // same-origin host if the exported runtime only exposes a loopback address.
  if (
    browserHost &&
    !isLoopbackHost(browserHost) &&
    (!runtimeHost || isLoopbackHost(runtimeHost))
  ) {
    return {
      protocol: location?.protocol === 'https:' ? 'wss' : 'ws',
      host: browserHost,
    }
  }

  if (runtimeHost) {
    return {
      protocol:
        location?.protocol === 'https:' && !isLoopbackHost(runtimeHost)
          ? 'wss'
          : 'ws',
      host: runtimeHost,
    }
  }

  if (browserHost) {
    return {
      protocol: 'ws',
      host: browserHost,
    }
  }

  return {
    protocol: 'ws',
    host: 'localhost',
  }
}

export function resolveBrowserWebSocketUrl(
  runtime: BrowserRuntimeLike,
  location: BrowserLocationLike | undefined =
    typeof window === 'undefined' ? undefined : window.location
): string {
  const endpoint = resolveWebSocketEndpoint(runtime, location)
  return `${endpoint.protocol}://${formatWebSocketHost(endpoint.host)}:${runtime.port}`
}
