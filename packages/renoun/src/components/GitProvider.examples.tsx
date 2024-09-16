import React from 'react'
import { GitProviderLink, GitProviderLogo } from 'renoun/components'

export function Icon() {
  return <GitProviderLink />
}

export function Text() {
  return <GitProviderLink>View Source</GitProviderLink>
}

export function Custom() {
  return (
    <GitProviderLink
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
    >
      <GitProviderLogo width="1em" height="1em" />
      <span>View Source</span>
    </GitProviderLink>
  )
}
