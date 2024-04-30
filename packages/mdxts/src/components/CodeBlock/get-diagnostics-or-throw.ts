import { SourceFile } from 'ts-morph'
import { getDiagnosticMessageText } from '@tsxmod/utils'
import { join, sep } from 'node:path'

/** Retrieves diagnostics from a source file and throws an error if errors are found. */
export function getDiagnosticsOrThrow(
  sourceFile: SourceFile | undefined,
  allowErrors: string | boolean = false,
  showErrors: boolean = false
): any[] {
  const allowedErrorCodes: number[] =
    typeof allowErrors === 'string'
      ? allowErrors.split(',').map((code) => parseInt(code, 10))
      : []

  if (!sourceFile) {
    return []
  }

  const diagnostics = sourceFile
    .getPreEmitDiagnostics()
    .filter((diagnostic) => diagnostic.getSourceFile())

  if (showErrors) {
    if (allowedErrorCodes.length > 0) {
      return diagnostics.filter((diagnostic) => {
        return allowedErrorCodes.includes(diagnostic.getCode())
      })
    }

    return diagnostics
  }

  if (allowErrors === false) {
    if (diagnostics.length > 0) {
      const workingDirectory = join(process.cwd(), 'mdxts', sep)
      const filePath = sourceFile.getFilePath().replace(workingDirectory, '')
      const errorDetails = diagnostics
        .map((diagnostic) => {
          const message = getDiagnosticMessageText(diagnostic.getMessageText())
          const line = diagnostic.getLineNumber()
          return `line ${line} (${diagnostic.getCode()}): ${message.replaceAll(workingDirectory, '')}`
        })
        .join('\n\n')

      throw new Error(
        `[mdxts] CodeBlock type errors found for filename "${filePath}"\n\n${errorDetails}`
      )
    }

    return []
  }

  if (allowErrors && allowedErrorCodes.length === 0) {
    return []
  }

  return diagnostics.filter((diagnostic) => {
    return !allowedErrorCodes.includes(diagnostic.getCode())
  })
}
