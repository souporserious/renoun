import { sendToServer, whenServerReady } from './client'
import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text'
import type { DistributiveOmit } from '../types'
import type { ProjectOptions } from './types'

const initializedProjects = new Set<string>()

async function initializeProject(options?: ProjectOptions) {
  const key = JSON.stringify(options)

  if (initializedProjects.has(key)) {
    return
  }

  await whenServerReady()

  initializedProjects.add(key)

  return sendToServer<void>('initialize', options)
}

export async function analyzeSourceText(
  options: DistributiveOmit<AnalyzeSourceTextOptions, 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<AnalyzeSourceTextResult> {
  await initializeProject(options.projectOptions)
  return sendToServer<AnalyzeSourceTextResult>('analyzeSourceText', options)
}
