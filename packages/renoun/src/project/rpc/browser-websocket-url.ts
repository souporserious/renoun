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
): string {
  const runtimeHost =
    typeof runtime.host === 'string' && runtime.host.trim().length > 0
      ? runtime.host.trim()
      : undefined
  const browserHost =
    typeof location?.hostname === 'string' && location.hostname.trim().length > 0
      ? location.hostname.trim()
      : undefined

  if (runtimeHost) {
    return formatWebSocketAuthority(runtimeHost, runtime.port)
  }

  // The current RPC server only exposes a plain `ws://` endpoint and only binds
  // loopback hosts. Avoid proxy-visible hostnames here because the browser would
  // target an endpoint the server does not actually serve.
  if (browserHost && isLoopbackHost(browserHost)) {
    return formatWebSocketAuthority(browserHost, runtime.port)
  }

  return formatWebSocketAuthority('localhost', runtime.port)
}

export function resolveBrowserWebSocketUrl(
  runtime: BrowserRuntimeLike,
  location: BrowserLocationLike | undefined =
    typeof window === 'undefined' ? undefined : window.location
): string {
  return `ws://${resolveWebSocketAuthority(runtime, location)}`
}
