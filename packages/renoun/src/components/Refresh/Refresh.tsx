import React from 'react'

/** Refreshes the development server when a source file changes. */
export async function Refresh() {
  if (process.env.NODE_ENV === 'development') {
    const { RefreshClient } = await import('./RefreshClient.js')
    const port = process.env.RENOUN_SERVER_PORT
    const id = process.env.RENOUN_SERVER_ID

    if (!port || !id) {
      throw new Error(
        '[renoun] The Refresh component requires the renoun development server to be running.'
      )
    }

    return <RefreshClient port={port} id={id} />
  }

  return null
}
