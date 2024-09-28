import { watch } from 'node:fs'

import { writeCollectionImports } from '../collections/write-collection-imports.js'
import { analyzeSourceText } from '../utils/analyze-source-text.js'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.js'
import { WebSocketServer } from './rpc/server.js'
import { getProject } from './get-project.js'
import { ProjectOptions } from './types.js'

const DEFAULT_IGNORED_PATHS = [
  '.git',
  '.next',
  '.turbo',
  'build',
  'dist',
  'node_modules',
  'out',
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

  if (process.env.NODE_ENV === 'development') {
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
      writeCollectionImports(filename).then(() => {
        /* Notify the client to refresh when files change. */
        server.sendNotification({ type: 'refresh' })
      })
    })
  }

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
          '[renoun] Highlighter is not initialized in web socket "analyzeSourceText"'
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
