'use client'
import React from 'react'
import { getExports } from '../utils/get-exports'

export async function ClientComponent({ code }: { code: string }) {
  const { default: Component } = await getExports(code)

  if (Component === null) {
    return null
  }

  return <Component />
}
