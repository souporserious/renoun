'use client'
import { Button } from './Button'

export function Basic() {
  return <Button>Basic Usage</Button>
}

export function Events() {
  return <Button onClick={() => alert('cool')}>Click Actions</Button>
}
