import type { Project } from 'ts-morph'

import { getDiagnosticMessageText } from './get-diagnostic-message.js'

/** Transpile a source file into JavaScript. */
export function transpileSourceFile(filePath: string, project: Project) {
  const sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    throw new Error(
      `[renoun] No source file found while transpiling "${filePath}"`
    )
  }

  const emitOutput = sourceFile.getEmitOutput()

  if (emitOutput.getEmitSkipped()) {
    const diagnostics = emitOutput.getDiagnostics()
    if (diagnostics.length) {
      const messages = diagnostics.map((diagnostic) =>
        getDiagnosticMessageText(diagnostic.getMessageText())
      )
      throw new Error(
        `[renoun] Failed to transpile "${filePath}":\n${messages.map((message) => `  ⓧ ${message}`).join('\n')}`
      )
    }
  }

  const [outputFile] = sourceFile.getEmitOutput().getOutputFiles()

  if (outputFile) {
    return outputFile.getText()
  }

  throw new Error(`[renoun] Failed to transpile "${filePath}"`)
}
