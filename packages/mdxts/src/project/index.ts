import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text'
import type { DistributiveOmit } from '../types'
import { WebSocketClient } from './rpc/client'
import { getProject } from './get-project'
import type { ProjectOptions } from './types'

let client: WebSocketClient | undefined

if (process.env.NODE_ENV === 'development') {
  client = new WebSocketClient()
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
  const project = getProject(projectOptions)

  return import('../utils/analyze-source-text').then(
    ({ analyzeSourceText }) => {
      return analyzeSourceText({ project, ...analyzeOptions })
    }
  )
}
