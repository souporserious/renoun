import { watch } from 'node:fs'

import { generateCollectionImportMap } from '../collections/import-maps'
import { analyzeSourceText } from '../utils/analyze-source-text'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter'
import { WebSocketServer } from './rpc/server'
import { getProject } from './get-project'
import { ProjectOptions } from './types'

const DEFAULT_IGNORED_PATHS = [
  'node_modules',
  'dist',
  'out',
  '.mdxts',
  '.next',
  '.turbo',
]
let currentHighlighter: Highlighter | null = null

if (currentHighlighter === null) {
  createHighlighter().then((highlighter) => {
    currentHighlighter = highlighter
  })
}

/** Create a WebSocket server. */
export function createServer() {
  const server = new WebSocketServer()

  watch(process.cwd(), { recursive: true }, (_, filename) => {
    if (
      !filename ||
      DEFAULT_IGNORED_PATHS.some((ignoredFile) =>
        filename?.startsWith(ignoredFile)
      )
    ) {
      return
    }

    /* Update all collection import maps when files change. */
    generateCollectionImportMap(filename)

    /* Notify the client to refresh when files change. */
    server.sendNotification({ type: 'refresh' })
  })

  server.registerMethod(
    'analyzeSourceText',
    async ({
      projectOptions,
      ...options
    }: Parameters<typeof analyzeSourceText>[0] & {
      projectOptions?: ProjectOptions
    }) => {
      const project = await getProject(projectOptions)

      if (currentHighlighter === null) {
        throw new Error(
          '[mdxts] Highlighter is not initialized in web socket "analyzeSourceText"'
        )
      }

      return analyzeSourceText({
        ...options,
        highlighter: currentHighlighter,
        project,
      })
    }
  )

  return server
}
