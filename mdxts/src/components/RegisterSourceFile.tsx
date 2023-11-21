'use client'
import { useLayoutEffect } from 'react'
import { project } from './project'

/** Registers code block source files on the client. */
export function RegisterSourceFile({
  filename,
  source,
}: {
  filename: string
  source: string
}) {
  useLayoutEffect(() => {
    if (!source) {
      return
    }

    const sourceFile = project.getSourceFile(filename)

    if (!sourceFile) {
      project.createSourceFile(filename, source)
    }
  }, [])

  return null
}
