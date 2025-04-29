import React from 'react'
import { APIReference, TypeDisplay } from 'renoun/components'

export function BasicUsage() {
  return (
    <section>
      <h2>API Reference</h2>
      <APIReference
        source="./GitProvider.tsx"
        workingDirectory={import.meta.url}
      >
        <TypeDisplay />
      </APIReference>
    </section>
  )
}
