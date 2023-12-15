'use client'
import { project } from './project'

/** Registers code block source files on the client. */
export function RegisterSourceFile({
  filename,
  source,
}: {
  filename: string
  source: string | undefined
}) {
  if (!source) {
    return
  }

  const sourceFile = project.getSourceFile(filename)

  if (!sourceFile) {
    project.createSourceFile(filename, source)
  }

  return null
}
