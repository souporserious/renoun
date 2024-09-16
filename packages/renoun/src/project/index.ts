import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter'
import type { DistributiveOmit } from '../types'
import { WebSocketClient } from './rpc/client'
import { getProject } from './get-project'
import type { ProjectOptions } from './types'

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

  return import('../utils/analyze-source-text').then(
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
