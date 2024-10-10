import React from 'react'
import { APIReference } from 'renoun/components'

export function FilePath() {
  return (
    <APIReference
      source="./GitProvider.tsx"
      workingDirectory={import.meta.url}
    />
  )
}
