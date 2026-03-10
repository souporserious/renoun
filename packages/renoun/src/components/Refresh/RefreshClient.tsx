'use client'
import { useEffect } from 'react'

import { getAnalysisServerRuntimeKey } from '../../analysis/browser-runtime.ts'
import {
  onAnalysisClientBrowserRefreshNotification,
  retainAnalysisClientBrowserRuntime,
} from '../../analysis/client.ts'

declare global {
  var __WAKU_RSC_RELOAD_LISTENERS__: (() => void)[] | undefined
}

/**
 * Subscribes to the development server and refreshes the page when a source file changes.
 * @internal
 */
export function RefreshClient({
  port,
  id,
  host,
  emitRefreshNotifications,
}: {
  port: string
  id: string
  host?: string
  emitRefreshNotifications?: boolean
}) {
  const runtimeKey = getAnalysisServerRuntimeKey({
    port,
    id,
    host,
    emitRefreshNotifications,
  })

  useEffect(() => {
    if (port === undefined) {
      return
    }

    const releaseRuntime = retainAnalysisClientBrowserRuntime({
      port,
      id,
      host,
      emitRefreshNotifications,
    })
    const unsubscribe = onAnalysisClientBrowserRefreshNotification((message) => {
      if (
        message.type === 'refresh' &&
        message.runtimeKey === runtimeKey &&
        'nd' in window
      ) {
        // @ts-ignore - private Next.js API
        const router = window.nd.router

        if ('hmrRefresh' in router) {
          router.hmrRefresh()
        } else if ('fastRefresh' in router) {
          router.fastRefresh()
        } else if ('__WAKU_RSC_RELOAD_LISTENERS__' in globalThis) {
          globalThis.__WAKU_RSC_RELOAD_LISTENERS__?.forEach((callback) =>
            callback()
          )
        }
      }
    })

    return () => {
      unsubscribe()
      releaseRuntime()
    }
  }, [emitRefreshNotifications, host, id, port, runtimeKey])

  return null
}
