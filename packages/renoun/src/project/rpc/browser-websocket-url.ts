interface BrowserLocationLike {
  protocol?: string
  hostname?: string
  port?: string
}

interface BrowserRuntimeLike {
  port: string
  host?: string
}

type ResolvedWebSocketEndpoint = {
  protocol: 'ws' | 'wss'
  authority: string
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

function normalizePort(port: string | undefined): string | undefined {
  if (typeof port !== 'string') {
    return undefined
  }

  const normalizedPort = port.trim()
  return normalizedPort.length > 0 ? normalizedPort : undefined
}

function formatWebSocketAuthority(host: string, port?: string): string {
  const formattedHost = formatWebSocketHost(host)
  const normalizedPort = normalizePort(port)
  return normalizedPort ? `${formattedHost}:${normalizedPort}` : formattedHost
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
  const browserPort = normalizePort(location?.port)

  // When the page is served through a proxy or tunnel, prefer the browser's
  // same-origin authority if the exported runtime only exposes a loopback
  // address. The proxy typically terminates on the browser-visible port, not
  // the server's internal websocket port.
  if (
    browserHost &&
    !isLoopbackHost(browserHost) &&
    (!runtimeHost || isLoopbackHost(runtimeHost))
  ) {
    return {
      protocol: location?.protocol === 'https:' ? 'wss' : 'ws',
      authority: formatWebSocketAuthority(browserHost, browserPort),
    }
  }

  if (runtimeHost) {
    return {
      protocol:
        location?.protocol === 'https:' && !isLoopbackHost(runtimeHost)
          ? 'wss'
          : 'ws',
      authority: formatWebSocketAuthority(runtimeHost, runtime.port),
    }
  }

  if (browserHost) {
    return {
      protocol: 'ws',
      authority: formatWebSocketAuthority(browserHost, runtime.port),
    }
  }

  return {
    protocol: 'ws',
    authority: formatWebSocketAuthority('localhost', runtime.port),
  }
}

export function resolveBrowserWebSocketUrl(
  runtime: BrowserRuntimeLike,
  location: BrowserLocationLike | undefined =
    typeof window === 'undefined' ? undefined : window.location
): string {
  const endpoint = resolveWebSocketEndpoint(runtime, location)
  return `${endpoint.protocol}://${endpoint.authority}`
}
