import type { SyntaxKind } from 'ts-morph'

import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text.js'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.js'
import type {
  FileExport,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.js'
import type { ResolvedType, SymbolFilter } from '../utils/resolve-type.js'
import type { resolveTypeAtLocation as baseResolveTypeAtLocation } from '../utils/resolve-type-at-location.js'
import type { DistributiveOmit } from '../types.js'
import { WebSocketClient } from './rpc/client.js'
import { getProject } from './get-project.js'
import type { ProjectOptions } from './types.js'

let client: WebSocketClient | undefined

if (process.env.RENOUN_SERVER_PORT !== undefined) {
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
    return client.callMethod<
      DistributiveOmit<AnalyzeSourceTextOptions, 'project'> & {
        projectOptions?: ProjectOptions
      },
      AnalyzeSourceTextResult
    >('analyzeSourceText', options)
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
 * Resolve the type of an expression at a specific location.
 * @internal
 */
export async function resolveTypeAtLocation(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: SymbolFilter,
  projectOptions?: ProjectOptions
): Promise<ResolvedType | undefined> {
  if (client) {
    return client.callMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        filter?: SymbolFilter
        projectOptions?: ProjectOptions
      },
      ReturnType<typeof baseResolveTypeAtLocation>
    >('resolveTypeAtLocation', {
      filePath,
      position,
      kind,
      filter,
      projectOptions,
    })
  }

  return import('../utils/resolve-type-at-location.js').then(
    async ({ resolveTypeAtLocation }) => {
      const project = getProject(projectOptions)

      return resolveTypeAtLocation(
        project,
        filePath,
        position,
        kind,
        filter,
        projectOptions?.useInMemoryFileSystem
      )
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
    return client.callMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
      },
      FileExport[]
    >('getFileExports', {
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
 * Get a specific file export in a source file.
 * @internal
 */
export async function getFileExportMetadata(
  name: string,
  filePath: string,
  position: number,
  kind: SyntaxKind,
  projectOptions?: ProjectOptions
) {
  if (client) {
    return client.callMethod<
      {
        name: string
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
      },
      Awaited<ReturnType<typeof baseGetFileExportMetadata>>
    >('getFileExportMetadata', {
      name,
      filePath,
      position,
      kind,
      projectOptions,
    })
  }

  return import('../utils/get-file-exports.js').then(
    ({ getFileExportMetadata }) => {
      const project = getProject(projectOptions)
      return getFileExportMetadata(name, filePath, position, kind, project)
    }
  )
}

/**
 * Get a specific file export's text by identifier, optionally including its dependencies.
 * @internal
 */
export async function getFileExportText(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  includeDependencies?: boolean,
  projectOptions?: ProjectOptions
) {
  if (client) {
    return client.callMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        includeDependencies?: boolean
        projectOptions?: ProjectOptions
      },
      string
    >('getFileExportText', {
      filePath,
      position,
      kind,
      includeDependencies,
      projectOptions,
    })
  }

  return import('../utils/get-file-export-text.js').then(
    ({ getFileExportText }) => {
      const project = getProject(projectOptions)
      return getFileExportText({
        filePath,
        position,
        kind,
        includeDependencies,
        project,
      })
    }
  )
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
    return client.callMethod<
      {
        filePath: string
        sourceText: string
        projectOptions?: ProjectOptions
      },
      void
    >('createSourceFile', {
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
    return client.callMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
      },
      string
    >('transpileSourceFile', {
      filePath,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)

  return import('../utils/transpile-source-file.js').then(
    ({ transpileSourceFile }) => {
      return transpileSourceFile(filePath, project)
    }
  )
}
