'use client'
import { useEffect } from 'react'

import {
  subscribeToAnalysisClientBrowserRuntimeRefresh,
} from '../../analysis/browser-client.ts'
import type { AnalysisServerRuntime } from '../../analysis/runtime-env.ts'

declare global {
  var __WAKU_RSC_RELOAD_LISTENERS__: (() => void)[] | undefined
}

/**
 * Subscribes to the development server and refreshes the page when a source file changes.
 * @internal
 */
export function RefreshClient({
  runtime,
}: {
  runtime: AnalysisServerRuntime
}) {
  const {
    port,
    id,
    host,
    emitRefreshNotifications,
    clientRuntime,
  } = runtime

  useEffect(() => {
    if (port === undefined) {
      return
    }

    return subscribeToAnalysisClientBrowserRuntimeRefresh(
      runtime,
      (message) => {
        if (message.type === 'refresh') {
          refreshDevelopmentRouter()
        }
      }
    )
  }, [
    clientRuntime?.consumeRefreshNotifications,
    clientRuntime?.rpcCacheTtlMs,
    clientRuntime?.useRpcCache,
    emitRefreshNotifications,
    host,
    id,
    port,
    runtime,
  ])

  return null
}

function refreshDevelopmentRouter(): void {
  if ('nd' in window) {
    // @ts-ignore - private Next.js API
    const router = window.nd.router

    if ('hmrRefresh' in router) {
      router.hmrRefresh()
      return
    }

    if ('fastRefresh' in router) {
      router.fastRefresh()
      return
    }
  }

  if ('__WAKU_RSC_RELOAD_LISTENERS__' in globalThis) {
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__?.forEach((callback) => callback())
  }
}
