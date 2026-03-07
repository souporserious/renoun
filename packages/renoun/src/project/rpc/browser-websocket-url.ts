interface BrowserLocationLike {
  protocol?: string
  hostname?: string
}

export function resolveBrowserWebSocketUrl(
  port: string,
  _location: BrowserLocationLike | undefined =
    typeof window === 'undefined' ? undefined : window.location
): string {
  // The current RPC server only listens on loopback over plain WebSocket.
  return `ws://localhost:${port}`
}
