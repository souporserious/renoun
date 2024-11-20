'use client'
import type { WebSocketNotification } from '../project/rpc/server.js'

let startedWatching = false

/**
 * Refreshes the Next.js development server when a source file changes.
 * @internal
 */
export function Refresh() {
  if (!startedWatching && typeof window !== 'undefined') {
    new WebSocket(`ws://localhost:5996`).addEventListener(
      'message',
      (event: MessageEvent) => {
        const message = JSON.parse(event.data) as WebSocketNotification

        if (message.type === 'refresh' && 'nd' in window) {
          // @ts-ignore - private Next.js API
          const router = window.nd.router

          if ('hmrRefresh' in router) {
            router.hmrRefresh()
          } else if ('fastRefresh' in router) {
            router.fastRefresh()
          }
        }
      }
    )

    startedWatching = true
  }

  return null
}
