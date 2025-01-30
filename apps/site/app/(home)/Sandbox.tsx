'use client'
import { useEffect } from 'react'
import sdk from '@stackblitz/sdk'

export function Sandbox() {
  useEffect(() => {
    sdk.embedProjectId('sandbox', 'renoun-blog-example', {
      forceEmbedLayout: true,
      height: 600,
      hideExplorer: true,
      openFile: 'collections.ts',
      theme: 'dark',
    })
  }, [])

  return (
    <div
      css={{
        width: '100%',
        padding: '1rem',
        paddingBottom: '0',
        boxShadow: '0 0 0 1px #354553',
        backgroundColor: '#2f3139',
        borderRadius: '0.25rem',
        iframe: {
          border: 0,
        },
      }}
    >
      <iframe id="sandbox" />
    </div>
  )
}
