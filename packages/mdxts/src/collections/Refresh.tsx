'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()

  if (ws === undefined) {
    ws = new WebSocket(`ws://localhost:${port}`)
  }

  useEffect(() => {
    function handleWatch() {
      ws.send(JSON.stringify({ type: 'refresh:watch', data: { directory } }))
    }

    function handleUnwatch() {
      ws.send(JSON.stringify({ type: 'refresh:unwatch', data: { directory } }))
    }

    function handleMessage(event: MessageEvent) {
      const message = JSON.parse(event.data)
      if (
        message.type === 'refresh:update' &&
        message.data.directory === directory
      ) {
        if ('hmrRefresh' in router) {
          // @ts-expect-error - private Next.js API
          router.hmrRefresh()
        } else if ('fastRefresh' in router) {
          // @ts-expect-error - private Next.js API
          router.fastRefresh()
        } else {
          router.refresh()
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
  }, [router])

  return null
}
