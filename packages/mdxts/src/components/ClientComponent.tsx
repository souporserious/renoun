'use client'
import React from 'react'
import { executeCode } from '../utils/execute-code'

/** Executes the provided `code` and renders the default export as a React Client Component. */
export async function ClientComponent({ code }: { code: string }) {
  const { default: Component } = await executeCode(code)

  if (Component === null) {
    return null
  }

  return <Component />
}
