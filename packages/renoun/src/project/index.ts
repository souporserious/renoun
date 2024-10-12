import type { Node } from 'ts-morph'

import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text.js'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import type { DistributiveOmit } from '../types.js'
import { WebSocketClient } from './rpc/client.js'
import { getProject } from './get-project.js'
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
    return client.callMethod('analyzeSourceText', options)
  }

  /* Switch to synchronous analysis when building for production to prevent timeouts. */
  const { projectOptions, ...analyzeOptions } = options
  const project = await getProject(projectOptions)

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
  useClient = true,
}: {
  declaration: Node
  projectOptions?: ProjectOptions
  filter?: SymbolFilter
  useClient?: boolean
}) {
  const filePath = declaration.getSourceFile().getFilePath()
  const position = declaration.getPos()

  if (useClient && client) {
    return client.callMethod('resolveType', {
      filePath,
      position,
      filter: filter?.toString(),
      tsConfigFilePath: projectOptions?.tsConfigFilePath,
    })
  }

  return import('../utils/resolve-type-at-location.js').then(
    async ({ resolveTypeAtLocation }) => {
      const project = await getProject(projectOptions)
      return resolveTypeAtLocation(project, filePath, position, filter)
    }
  )
}
