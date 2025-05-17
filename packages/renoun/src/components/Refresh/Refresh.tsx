import React from 'react'

/** Refreshes the development server when a source file changes. */
export async function Refresh() {
  if (process.env.NODE_ENV === 'development') {
    const { RefreshClient } = await import('./RefreshClient.js')
    const port = process.env.RENOUN_SERVER_PORT!
    const secret = process.env.RENOUN_SERVER_SECRET!

    return <RefreshClient port={port} secret={secret} />
  }

  return null
}
