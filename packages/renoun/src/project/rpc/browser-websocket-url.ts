interface BrowserLocationLike {
  protocol?: string
  hostname?: string
  port?: string
}

interface BrowserRuntimeLike {
  port: string
  host?: string
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

function resolveWebSocketAuthority(
  runtime: BrowserRuntimeLike,
  location?: BrowserLocationLike
): {
  host: string
  authority: string
} {
  const runtimeHost =
    typeof runtime.host === 'string' && runtime.host.trim().length > 0
      ? runtime.host.trim()
      : undefined
  const browserHost =
    typeof location?.hostname === 'string' && location.hostname.trim().length > 0
      ? location.hostname.trim()
      : undefined

  // When the browser is connected through a tunnel or preview proxy, loopback
  // runtime hosts are not browser-reachable. Reuse the current page hostname so
  // the proxy can forward the runtime port and secure origins can use `wss://`.
  const resolvedHost =
    browserHost &&
    !isLoopbackHost(browserHost) &&
    (!runtimeHost || isLoopbackHost(runtimeHost))
      ? browserHost
      : runtimeHost ?? (browserHost && isLoopbackHost(browserHost)
          ? browserHost
          : 'localhost')

  return {
    host: resolvedHost,
    authority: formatWebSocketAuthority(resolvedHost, runtime.port),
  }
}

function resolveWebSocketProtocol(
  host: string,
  location?: BrowserLocationLike
): 'ws' | 'wss' {
  return location?.protocol === 'https:' && !isLoopbackHost(host)
    ? 'wss'
    : 'ws'
}

export function resolveBrowserWebSocketUrl(
  runtime: BrowserRuntimeLike,
  location: BrowserLocationLike | undefined =
    typeof window === 'undefined' ? undefined : window.location
): string {
  const { host, authority } = resolveWebSocketAuthority(runtime, location)
  return `${resolveWebSocketProtocol(host, location)}://${authority}`
}
