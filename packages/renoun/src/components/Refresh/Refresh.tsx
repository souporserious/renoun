import React from 'react'

/**
 * Refreshes the development server when a source file changes.
 * @internal
 */
export async function Refresh() {
  if (process.env.NODE_ENV === 'development') {
    const { RefreshClient } = await import('./RefreshClient.js')
    const port = process.env.RENOUN_SERVER_PORT
    const id = process.env.RENOUN_SERVER_ID

    if (!port || !id) {
      return null
    }

    return <RefreshClient port={port} id={id} />
  }

  return null
}
