import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text'
import type { DistributiveOmit } from '../types'
import { WebSocketClient } from './rpc/client'
import type { ProjectOptions } from './types'

let client: WebSocketClient | undefined

if (process.env.MDXTS_WS_PORT) {
  client = new WebSocketClient()
}

export async function analyzeSourceText(
  options: DistributiveOmit<AnalyzeSourceTextOptions, 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<AnalyzeSourceTextResult> {
  if (client) {
    return client.callMethod('analyzeSourceText', options)
  }

  const { project } = await import('../components/project')

  return import('../utils/analyze-source-text').then(
    ({ analyzeSourceText }) => {
      return analyzeSourceText({ project, ...options })
    }
  )
}
