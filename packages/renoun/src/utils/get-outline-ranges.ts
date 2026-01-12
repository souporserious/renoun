import type { Project, ts } from './ts-morph.ts'

import { getDebugLogger } from './debug.ts'
import type { DeclarationPosition } from './get-declaration-location.ts'

export interface OutlineRange {
  bannerText: string
  autoCollapse: boolean
  kind: ts.OutliningSpanKind
  textSpan: ts.TextSpan
  hintSpan: ts.TextSpan
  position: DeclarationPosition
}

/** Returns the TypeScript outlining spans for a file. */
export function getOutlineRanges(
  filePath: string,
  project: Project
): OutlineRange[] {
  return getDebugLogger().trackOperation(
    'get-outline-ranges',
    (): OutlineRange[] => {
      let sourceFile = project.getSourceFile(filePath)

      if (!sourceFile) {
        sourceFile = project.addSourceFileAtPath(filePath)
      }

      const outliningSpans =
        project
          .getLanguageService()
          .compilerObject.getOutliningSpans(sourceFile.getFilePath()) ?? []

      return outliningSpans.map((span) => {
        const start = span.textSpan.start
        const end = span.textSpan.start + span.textSpan.length

        return {
          bannerText: span.bannerText,
          autoCollapse: span.autoCollapse,
          kind: span.kind,
          textSpan: span.textSpan,
          hintSpan: span.hintSpan,
          position: {
            start: sourceFile.getLineAndColumnAtPos(start),
            end: sourceFile.getLineAndColumnAtPos(end),
          },
        }
      })
    },
    { data: { filePath } }
  ) as OutlineRange[]
}
