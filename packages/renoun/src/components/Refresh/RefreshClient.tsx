'use client'
import { useEffect } from 'react'

import type { WebSocketNotification } from '../../project/rpc/server.js'

/**
 * Subscribes to the development server and refreshes the page when a source file changes.
 * @internal
 */
export function RefreshClient({ port }: { port: string }) {
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
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

    const ws = new WebSocket(`ws://localhost:${port}`)
    ws.addEventListener('message', handleMessage)

    return () => {
      ws.removeEventListener('message', handleMessage)
      ws.close()
    }
  }, [port])

  return null
}
