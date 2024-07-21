import type { SourceFile } from 'ts-morph'

/** Trims empty export statements added when coercing source text into module. */
export function getTrimmedSourceFileText(sourceFile: SourceFile) {
  const sourceText = sourceFile.getFullText()
  const sourceTextLines = sourceText.split('\n')

  // If tokens contain an "export { }" statement, remove it
  const exportStatementLineIndex = sourceTextLines.findIndex((line) =>
    line.includes('export { }')
  )

  if (exportStatementLineIndex > -1) {
    // trim the export statement and the following line break
    return sourceTextLines.slice(0, exportStatementLineIndex - 1).join('\n')
  }

  return sourceText
}
