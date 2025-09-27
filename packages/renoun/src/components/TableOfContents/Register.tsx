'use client'
import React, { useLayoutEffect } from 'react'

/**
 * A component that registers heading ids with the `TableOfContentsScript`.
 * @internal
 */
export function Register({ ids }: { ids: string[] }) {
  useLayoutEffect(() => {
    window.__TableOfContents__?.register(ids)
  }, [])

  return (
    <script>{`window.__TableOfContents__?.register(${JSON.stringify(ids)});`}</script>
  )
}
