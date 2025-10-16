import { getTsMorph } from '../utils/ts-morph.js'
import type { Project, ts } from '../utils/ts-morph.js'

const tsMorph = getTsMorph()

const printerCache = new WeakMap<Project, ts.Printer>()
const LineFeed = tsMorph.ts.NewLineKind.LineFeed

/** Get a ts.Printer configured to match the project’s `compilerOptions`. */
export function getPrinter(
  project: Project,
  overrides?: Partial<ts.PrinterOptions>
): ts.Printer {
  let printer = printerCache.get(project)

  if (printer) return printer

  const options = project.getCompilerOptions()

  printer = tsMorph.ts.createPrinter({
    removeComments: overrides?.removeComments ?? options.removeComments ?? true,
    newLine: overrides?.newLine ?? options.newLine ?? LineFeed,
    noEmitHelpers: overrides?.noEmitHelpers ?? options.noEmitHelpers ?? false,
    omitTrailingSemicolon: overrides?.omitTrailingSemicolon ?? false,
  })

  printerCache.set(project, printer)

  return printer
}
