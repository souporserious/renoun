import React from 'react'

/** Refreshes the development server when a source file changes. */
export async function Refresh() {
  if (process.env.NODE_ENV === 'development') {
    const { RefreshClient } = await import('./RefreshClient.js')
    const port = process.env.RENOUN_SERVER_PORT!

    return <RefreshClient port={port} />
  }

  return null
}
