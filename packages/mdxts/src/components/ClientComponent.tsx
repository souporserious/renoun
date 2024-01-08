'use client'
import React from 'react'
import { getExports } from '../utils/get-exports'

/** Executes the provided `code` and renders the default export as a React Client Component. */
export async function ClientComponent({ code }: { code: string }) {
  const { default: Component } = await getExports(code)

  if (Component === null) {
    return null
  }

  return <Component />
}
