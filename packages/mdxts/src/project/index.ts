import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text'
import type { DistributiveOmit } from '../types'
import { WebSocketClient } from './rpc/client'
import type { ProjectOptions } from './types'

const client = new WebSocketClient()

export async function analyzeSourceText(
  options: DistributiveOmit<AnalyzeSourceTextOptions, 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<AnalyzeSourceTextResult> {
  return client.callMethod('analyzeSourceText', options)
}
