import { getDebugLogger } from './debug.ts'
import type { DeclarationPosition } from './get-declaration-location.ts'
import { hashString } from './stable-serialization.ts'
import {
  emitTelemetryCounter,
  emitTelemetryEvent,
  emitTelemetryHistogram,
} from './telemetry.ts'
import type { Project, ts } from './ts-morph.ts'

export interface OutlineRange {
  bannerText: string
  autoCollapse: boolean
  kind: ts.OutliningSpanKind
  textSpan: ts.TextSpan
  hintSpan: ts.TextSpan
  position: DeclarationPosition
}

/** Returns the TypeScript outlining ranges for a file. */
export function getOutlineRanges(
  filePath: string,
  project: Project
): OutlineRange[] {
  const startedAt = performance.now()
  const filePathHash = hashString(filePath).slice(0, 12)

  try {
    const ranges = getDebugLogger().trackOperation(
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

    const durationMs = performance.now() - startedAt
    emitTelemetryHistogram({
      name: 'renoun.analysis.outline_ranges_ms',
      value: durationMs,
    })
    emitTelemetryEvent({
      name: 'renoun.analysis.outline_ranges',
      fields: {
        filePathHash,
        durationMs,
        rangeCount: ranges.length,
      },
    })

    return ranges
  } catch (error) {
    const durationMs = performance.now() - startedAt
    emitTelemetryCounter({
      name: 'renoun.analysis.outline_ranges_error_count',
    })
    emitTelemetryEvent({
      name: 'renoun.analysis.outline_ranges_error',
      fields: {
        filePathHash,
        durationMs,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    throw error
  }
}

/** Returns whether a position is within an outlining range. */
export function isPositionWithinOutlineRange(
  range: {
    position: {
      start: { line: number; column: number }
      end: { line: number; column: number }
    }
  },
  position: {
    line: number
    column: number
  }
): boolean {
  if (position.line < range.position.start.line) return false
  if (position.line > range.position.end.line) return false

  if (
    position.line === range.position.start.line &&
    position.column < range.position.start.column
  ) {
    return false
  }

  if (
    position.line === range.position.end.line &&
    position.column >= range.position.end.column
  ) {
    return false
  }

  return true
}
