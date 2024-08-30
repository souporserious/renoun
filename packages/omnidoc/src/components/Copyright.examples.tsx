import React from 'react'
import { Copyright } from 'omnidoc/components'

export function Basic() {
  return <Copyright />
}

export function HideLabel() {
  return (
    <div style={{ display: 'flex' }}>
      <Copyright showLabel={false} /> souporserious
    </div>
  )
}

export function StartYear() {
  return (
    <div style={{ display: 'flex' }}>
      <Copyright startYear={2020} /> JSXUI
    </div>
  )
}
