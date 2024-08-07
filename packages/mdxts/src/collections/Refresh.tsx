'use client'
import { useEffect } from 'react'

import type {
  WebSocketRequest,
  WebSocketNotification,
} from '../project/rpc/server'

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
  }

  useEffect(() => {
    function handleWatch() {
      ws.send(
        JSON.stringify({
          method: 'refreshWatch',
          params: { directory },
        } satisfies WebSocketRequest)
      )
    }

    function handleUnwatch() {
      ws.send(
        JSON.stringify({
          method: 'refreshUnwatch',
          params: { directory },
        } satisfies WebSocketRequest)
      )
    }

    function handleMessage(event: MessageEvent) {
      const message = JSON.parse(event.data) as WebSocketNotification

      if (
        message.method === 'refreshUpdate' &&
        message.params.directory === directory
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

    if (ws.readyState === WebSocket.OPEN) {
      handleWatch()
    } else {
      ws.addEventListener('open', handleWatch)
    }

    ws.addEventListener('message', handleMessage)

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        handleUnwatch()
      } else {
        ws.removeEventListener('open', handleWatch)
      }
      ws.removeEventListener('message', handleMessage)
    }
  }, [])

  return null
}
