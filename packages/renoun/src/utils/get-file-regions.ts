import { getTsMorph } from './ts-morph.ts'
import type { Project, ts } from './ts-morph.ts'

import { getDebugLogger } from './debug.ts'
import type { DeclarationPosition } from './get-declaration-location.ts'

const tsMorph = getTsMorph()

export interface FileRegion {
  bannerText: string
  autoCollapse: boolean
  kind?: 'Region'
  textSpan: ts.TextSpan
  hintSpan: ts.TextSpan
  position: DeclarationPosition
}

/** Returns the TypeScript `//#region` spans for a file. */
export function getFileRegions(
  filePath: string,
  project: Project
): FileRegion[] {
  return getDebugLogger().trackOperation(
    'get-file-regions',
    (): FileRegion[] => {
      let sourceFile = project.getSourceFile(filePath)

      if (!sourceFile) {
        sourceFile = project.addSourceFileAtPath(filePath)
      }

      const outliningSpans =
        project
          .getLanguageService()
          .compilerObject.getOutliningSpans(sourceFile.getFilePath()) ?? []

      const regionKind =
        tsMorph.ts.OutliningSpanKind?.Region ??
        ('region' as ts.OutliningSpanKind | undefined)

      return outliningSpans
        .filter((span) => span.kind === regionKind)
        .map((span) => {
          const start = span.textSpan.start
          const end = span.textSpan.start + span.textSpan.length

          return {
            bannerText: span.bannerText,
            autoCollapse: span.autoCollapse,
            kind: 'Region',
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
  ) as FileRegion[]
}
