import { WebSocketClient } from './rpc/client'
import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text'
import type { DistributiveOmit } from '../types'
import type { ProjectOptions } from './types'

const initializedProjects = new Set<string>()
const client = new WebSocketClient()

async function initializeProject(options?: ProjectOptions) {
  const key = JSON.stringify(options)

  if (initializedProjects.has(key)) {
    return
  }

  client.callMethod('initialize', options)
}

export async function analyzeSourceText(
  options: DistributiveOmit<AnalyzeSourceTextOptions, 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<AnalyzeSourceTextResult> {
  await initializeProject(options.projectOptions)
  return client.callMethod('analyzeSourceText', options)
}
