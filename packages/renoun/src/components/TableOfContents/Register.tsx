'use client'
import React, { useEffect } from 'react'

/**
 * A component that registers heading ids with the `TableOfContentsScript`.
 * @internal
 */
export function Register({ ids }: { ids: string[] }) {
  useEffect(() => {
    // TODO: fix navigation flickering from v DOM update
    window.__TableOfContents__?.register(ids)
  }, [])

  return (
    <script>{`window.__TableOfContents__?.register(${JSON.stringify(ids)});`}</script>
  )
}
