import React from 'react'
import { bundle } from '../utils/bundle'
import { ClientComponent } from './ClientComponent'
import { project } from './project'

export async function Preview({ source }: { source: string }) {
  const code = await bundle(project, source)

  if (!code) {
    return null
  }

  // TODO: add check for use client directive in code blocks
  return <ClientComponent code={code} />
}
