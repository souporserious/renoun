'use client'

let ws: WebSocket

/**
 * Refreshes the Next.js development server when a source file changes.
 * @internal
 */
export function Refresh({
  port,
  directory,
}: {
  port: string
  directory: string
}) {
  if (ws === undefined) {
    ws = new WebSocket(`ws://localhost:${port}`)

    ws.onopen = function handleOpen() {
      ws.send(JSON.stringify({ type: 'refresh:watch', data: { directory } }))
    }

    ws.onmessage = function handleMessage(event: MessageEvent) {
      const message = JSON.parse(event.data)
      if (
        message.type === 'refresh:update' &&
        message.data.directory === directory
      ) {
        // @ts-ignore - private Next.js API
        const router = window.nd.router
        if ('hmrRefresh' in router) {
          router.hmrRefresh()
        } else if ('fastRefresh' in router) {
          router.fastRefresh()
        } else if ('refresh' in router) {
          router.refresh()
        } else {
          throw new Error(
            'Could not refresh the development server. Please file an issue if you see this error.'
          )
        }
      }
    }
  }

  return null
}
