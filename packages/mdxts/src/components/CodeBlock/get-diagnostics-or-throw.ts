import type { Diagnostic, ts } from 'ts-morph'
import { SourceFile } from 'ts-morph'
import { getDiagnosticMessageText } from '@tsxmod/utils'
import { join, sep } from 'node:path'
import chalk from 'chalk'

import { getHighlighter } from './get-highlighter'

type Tokens = ReturnType<
  Awaited<ReturnType<typeof getHighlighter>>['codeToTokens']
>['tokens']

/** Retrieves diagnostics from a source file and throws an error if errors are found. */
export async function getDiagnosticsOrThrow(
  sourceFile: SourceFile | undefined,
  allowErrors: string | boolean = false,
  showErrors: boolean = false,
  tokens: Tokens
): Promise<Diagnostic<ts.Diagnostic>[]> {
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
      const errorMessages = diagnostics.map((diagnostic) => {
        const message = getDiagnosticMessageText(diagnostic.getMessageText())
        const start = diagnostic.getStart()
        const code = diagnostic.getCode()

        if (!start) {
          return `${chalk.red('ⓧ')}  ${message} ${chalk.dim(`ts(${code})`)}`
        }

        const startLineAndCol = sourceFile.getLineAndColumnAtPos(start)

        return `${chalk.red('ⓧ')}  ${message} ${chalk.dim(`ts(${code}) [Ln ${startLineAndCol.line}, Col ${startLineAndCol.column}]`)}`
      })
      const formattedErrors = errorMessages.join('\n')
      const errorMessage = `${tokensToHighlightedText(tokens)}\n\n${formattedErrors}`

      throw new Error(
        `[mdxts] ${chalk.bold('CodeBlock')} type errors found for filename "${chalk.bold(filePath)}"\n\n${errorMessage}\n\n`
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

/** Converts tokens to colored text. */
function tokensToHighlightedText(tokens: Tokens) {
  let styledOutput = ''

  for (const line of tokens) {
    for (const token of line) {
      if (token.color) {
        const color = chalk.hex(token.color)
        styledOutput += color(token.content)
      } else {
        styledOutput += token.content
      }
    }
    styledOutput += '\n'
  }

  return styledOutput
}
