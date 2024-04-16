'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ws = new WebSocket(`ws://localhost:${process.env.MDXTS_REFRESH_PORT}/ws`)

export function ContentRefresh({
  mdxPath,
  tsPath,
}: {
  mdxPath?: string
  tsPath?: string
}) {
  const router = useRouter()

  useEffect(() => {
    function sendPaths() {
      ws.send(JSON.stringify({ mdxPath, tsPath }))
    }

    ws.addEventListener('open', sendPaths)

    function listener(event: MessageEvent) {
      const message = JSON.parse(event.data)
      if (message.type === 'refresh' && 'fastRefresh' in router) {
        // @ts-expect-error - private Next.js API
        router.fastRefresh()
      }
    }

    ws.addEventListener('message', listener)

    return () => {
      ws.removeEventListener('open', sendPaths)
      ws.removeEventListener('message', listener)
    }
  }, [])

  return null
}
