import type { Node } from 'ts-morph'

import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text.js'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.js'
import type { FileExport } from '../utils/get-file-exports.js'
import type { ResolvedType, SymbolFilter } from '../utils/resolve-type.js'
import type { DistributiveOmit } from '../types.js'
import { WebSocketClient } from './rpc/client.js'
import { getProject } from './get-project.js'
import { waitForRefreshingProjects } from './refresh.js'
import type { ProjectOptions } from './types.js'

let client: WebSocketClient | undefined

if (
  process.env.NODE_ENV === 'development' ||
  process.env.RENOUN_SERVER === 'true'
) {
  client = new WebSocketClient()
}

let currentHighlighter: { current: Highlighter | null } = { current: null }
let highlighterPromise: Promise<void> | null = null

function untilHighlighterLoaded(): Promise<void> {
  if (highlighterPromise) return highlighterPromise

  highlighterPromise = createHighlighter().then((highlighter) => {
    currentHighlighter.current = highlighter
  })

  return highlighterPromise
}

/**
 * Analyze source text and return highlighted tokens with diagnostics.
 * @internal
 */
export async function analyzeSourceText(
  options: DistributiveOmit<AnalyzeSourceTextOptions, 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<AnalyzeSourceTextResult> {
  if (client) {
    return client.callMethod<AnalyzeSourceTextResult>(
      'analyzeSourceText',
      options
    )
  }

  /* Switch to synchronous analysis when building for production to prevent timeouts. */
  const { projectOptions, ...analyzeOptions } = options
  const project = getProject(projectOptions)

  await untilHighlighterLoaded()

  return import('../utils/analyze-source-text.js').then(
    ({ analyzeSourceText }) => {
      if (currentHighlighter.current === null) {
        throw new Error(
          '[renoun] Highlighter is not initialized in "analyzeSourceText"'
        )
      }

      return analyzeSourceText({
        ...analyzeOptions,
        highlighter: currentHighlighter.current,
        project,
      })
    }
  )
}

/**
 * Resolve the type of an expression.
 * @internal
 */
export async function resolveType({
  declaration,
  projectOptions,
  filter,
}: {
  declaration: Node
  projectOptions?: ProjectOptions
  filter?: SymbolFilter
}): Promise<ResolvedType | undefined> {
  await waitForRefreshingProjects()

  const filePath = declaration.getSourceFile().getFilePath()
  const position = declaration.getPos()

  if (client) {
    return client.callMethod<ResolvedType>('resolveType', {
      filePath,
      position,
      filter: filter?.toString(),
      tsConfigFilePath: projectOptions?.tsConfigFilePath,
    })
  }

  return import('../utils/resolve-type-at-location.js').then(
    async ({ resolveTypeAtLocation }) => {
      const project = getProject(projectOptions)
      return resolveTypeAtLocation(project, filePath, position, filter)
    }
  )
}

/**
 * Get the exports of a file.
 * @internal
 */
export async function getFileExports(
  filePath: string,
  projectOptions?: ProjectOptions
) {
  if (client) {
    return client.callMethod<FileExport[]>('getFileExports', {
      filePath,
      projectOptions,
    })
  }

  return import('../utils/get-file-exports.js').then(({ getFileExports }) => {
    const project = getProject(projectOptions)
    return getFileExports(filePath, project)
  })
}

/**
 * Create a source file in the project.
 * @internal
 */
export async function createSourceFile(
  filePath: string,
  sourceText: string,
  projectOptions?: ProjectOptions
) {
  if (client) {
    return client.callMethod<void>('createSourceFile', {
      filePath,
      sourceText,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  project.createSourceFile(filePath, sourceText, { overwrite: true })
}

/**
 * Transpile a source file.
 * @internal
 */
export async function transpileSourceFile(
  filePath: string,
  projectOptions?: ProjectOptions
) {
  if (client) {
    return client.callMethod<string>('transpileSourceFile', {
      filePath,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  const sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    throw new Error(`Source file "${filePath}" not found`)
  }

  const [outputFile] = sourceFile.getEmitOutput().getOutputFiles()
  return outputFile.getText()
}
