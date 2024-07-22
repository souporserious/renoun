import { sendToServer, whenServerReady } from './client'
import type {
  AnalyzeSourceTextOptions,
  AnalyzeSourceTextResult,
} from '../utils/analyze-source-text'
import { ProjectOptions } from './types'

/** Creates a project based on the provided options. */
export function createProject(projectOptions?: ProjectOptions) {
  let projectInitialized = false

  async function initializeProject(options?: ProjectOptions) {
    await whenServerReady()

    if (projectInitialized) {
      return
    }

    projectInitialized = true

    return sendToServer<void>('initialize', options)
  }

  return {
    analyzeSourceText: async (options: AnalyzeSourceTextOptions) => {
      await initializeProject(projectOptions)
      return sendToServer<AnalyzeSourceTextResult>('analyzeSourceText', options)
    },
  }
}
