import { describe, expect, it } from 'vitest'
import { Project } from 'ts-morph'

import { getOutlineRanges } from './get-outline-ranges.ts'

interface Position {
  line: number
  column: number
}

function comparePosition(a: Position, b: Position): number {
  if (a.line !== b.line) return a.line - b.line
  return a.column - b.column
}

// Treat the outlining range as half-open: [start, end)
function containsPosHalfOpen(
  range: { position: { start: Position; end: Position } },
  pos: Position
): boolean {
  return (
    comparePosition(pos, range.position.start) >= 0 &&
    comparePosition(pos, range.position.end) < 0
  )
}

describe('getOutlineRanges', () => {
  it('models TypeScript outlining spans with an exclusive end (comment ends before following code on same line)', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { target: 99 },
    })

    const filePath = '/virtual/example.ts'
    const code = `
/*
 * hello
 */ export const b = 2
`.trimStart()

    // IMPORTANT: create the file in the project so getOutlineRanges doesn't try addSourceFileAtPath().
    project.createSourceFile(filePath, code, { overwrite: true })

    const ranges = getOutlineRanges(filePath, project)

    const commentRange =
      ranges.find((r) => String(r.kind) === 'comment') ??
      ranges.find(
        (r) => r.bannerText.includes('/*') || r.bannerText.includes('*/')
      )

    expect(
      commentRange,
      'expected an outlining span for the multiline comment'
    ).toBeTruthy()

    const sourceFile = project.getSourceFileOrThrow(filePath)
    const bOffset = sourceFile.getFullText().indexOf('export const b')
    expect(bOffset).toBeGreaterThan(0)

    const bPos = sourceFile.getLineAndColumnAtPos(bOffset)

    // The end should be on the same line as `export`, but *before* it.
    expect(commentRange!.position.end.line).toBe(bPos.line)
    expect(commentRange!.position.end.column).toBeLessThan(bPos.column)

    // Half-open containment must NOT include `export const b`.
    expect(containsPosHalfOpen(commentRange!, bPos)).toBe(false)

    // Should include something inside the range (the start itself is always inside).
    expect(
      containsPosHalfOpen(commentRange!, commentRange!.position.start)
    ).toBe(true)
  })
})
