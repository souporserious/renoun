import React from 'react'
import { bundle } from '../utils/bundle'
import { ClientComponent } from './ClientComponent'
import { project } from './project'
import { waitUntilAllCodeComponentsAdded } from './state'

/** Compiles and renders a preview of source code on the file system or in a relative code block. */
export async function Preview({ source }: { source: string }) {
  // TODO: this is hacky and currently suffers from race conditions
  await waitUntilAllCodeComponentsAdded()

  const code = await bundle(project, source)

  if (!code) {
    return null
  }

  // TODO: add check for use client directive in code blocks
  return <ClientComponent code={code} />
}
