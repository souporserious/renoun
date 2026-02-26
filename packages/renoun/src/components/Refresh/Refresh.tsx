import React from 'react'
import { getServerRuntimeFromProcessEnv } from '../../project/runtime-env.ts'

/**
 * Refreshes the development server when a source file changes.
 * @internal
 */
export async function Refresh() {
  if (process.env.NODE_ENV === 'development') {
    const { RefreshClient } = await import('./RefreshClient.ts')
    const runtime = getServerRuntimeFromProcessEnv()

    if (!runtime) {
      return null
    }

    return <RefreshClient port={runtime.port} id={runtime.id} />
  }

  return null
}
