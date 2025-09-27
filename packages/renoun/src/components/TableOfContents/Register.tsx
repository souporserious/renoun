'use client'
import React, { useInsertionEffect } from 'react'

/**
 * A component that registers heading ids with the `TableOfContentsScript`.
 * @internal
 */
export function Register({ ids }: { ids: string[] }) {
  useInsertionEffect(() => {
    window.__TableOfContents__?.register(ids)
  }, [])

  return (
    <script>{`window.__TableOfContents__?.register(${JSON.stringify(ids)});`}</script>
  )
}
