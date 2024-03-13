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
    const listener = (event: MessageEvent) => {
      const message = JSON.parse(event.data)
      if (message.type === 'refresh' && 'fastRefresh' in router) {
        // @ts-expect-error - private Next API
        router.fastRefresh()
      }
    }

    // Send the MDX and TS paths to the server so it knows which files to watch.
    ws.send(JSON.stringify({ mdxPath, tsPath }))

    // Listen for refresh messages from the server.
    ws.addEventListener('message', listener)

    return () => {
      ws.removeEventListener('message', listener)
    }
  }, [])

  return null
}
