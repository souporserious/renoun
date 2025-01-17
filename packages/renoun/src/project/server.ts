import { watch } from 'node:fs'
import { join } from 'node:path'
import type { SyntaxKind } from 'ts-morph'

import { analyzeSourceText as baseAnalyzeSourceText } from '../utils/analyze-source-text.js'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.js'
import {
  getFileExports as baseGetFileExports,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.js'
import { getRootDirectory } from '../utils/get-root-directory.js'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import { resolveTypeAtLocation as baseResolveTypeAtLocation } from '../utils/resolve-type-at-location.js'
import { transpileSourceFile as baseTranspileSourceFile } from '../utils/transpile-source-file.js'
import { WebSocketServer } from './rpc/server.js'
import { getProject } from './get-project.js'
import type { ProjectOptions } from './types.js'

let currentHighlighter: Highlighter | null = null

if (currentHighlighter === null) {
  createHighlighter().then((highlighter) => {
    currentHighlighter = highlighter
  })
}

/**
 * Create a WebSocket server that improves the performance of renoun components and
 * utilities by processing type analysis and syntax highlighting in a separate process.
 */
export async function createServer(options?: { port?: number }) {
  const server = new WebSocketServer({ port: options?.port })
  const port = await server.getPort()

  process.env.RENOUN_SERVER_PORT = String(port)

  if (process.env.NODE_ENV === 'development') {
    const rootDirectory = getRootDirectory()

    watch(rootDirectory, { recursive: true }, (_, filename) => {
      if (!filename) return

      const filePath = join(rootDirectory, filename)

      if (isFilePathGitIgnored(filePath)) {
        return
      }

      /* Notify the client to refresh when files change. */
      server.sendNotification({ type: 'refresh' })
    })
  }

  server.registerMethod(
    'analyzeSourceText',
    async function analyzeSourceText({
      projectOptions,
      ...options
    }: Parameters<typeof baseAnalyzeSourceText>[0] & {
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)

      if (currentHighlighter === null) {
        throw new Error(
          '[renoun] Highlighter is not initialized in web socket "analyzeSourceText"'
        )
      }

      return baseAnalyzeSourceText({
        ...options,
        highlighter: currentHighlighter,
        project,
      })
    }
  )

  server.registerMethod(
    'resolveTypeAtLocation',
    async function resolveTypeAtLocation({
      projectOptions,
      filter,
      ...options
    }: {
      filePath: string
      position: number
      kind: SyntaxKind
      filter?: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      const filterFn = filter
        ? (new Function(
            'symbolMetadata',
            `try {
           return (${filter})(symbolMetadata)
         } catch (error) {
           if (error instanceof ReferenceError) {
             throw new Error(
               '[renoun]: A ReferenceError occured in the collection filter, this may have been caused by a variable defined outside the function scope. Ensure that all variables are defined within the filter function since it is serialized.',
               { cause: error }
             )
           } else {
             throw error
           }
         }`
          ) as SymbolFilter)
        : undefined

      return baseResolveTypeAtLocation(
        project,
        options.filePath,
        options.position,
        options.kind,
        filterFn,
        projectOptions?.useInMemoryFileSystem
      )
    }
  )

  server.registerMethod(
    'getFileExports',
    async function getFileExports({
      filePath,
      projectOptions,
    }: {
      filePath: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseGetFileExports(filePath, project)
    }
  )

  server.registerMethod(
    'getFileExportMetadata',
    async function getFileExportMetadata({
      name,
      filePath,
      position,
      kind,
      projectOptions,
    }: {
      name: string
      filePath: string
      position: number
      kind: SyntaxKind
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseGetFileExportMetadata(name, filePath, position, kind, project)
    }
  )

  server.registerMethod(
    'createSourceFile',
    async function createSourceFile({
      filePath,
      sourceText,
      projectOptions,
    }: {
      filePath: string
      sourceText: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      project.createSourceFile(filePath, sourceText, {
        overwrite: true,
      })
    }
  )

  server.registerMethod(
    'transpileSourceFile',
    async function transpileSourceFile({
      filePath,
      projectOptions,
    }: {
      filePath: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseTranspileSourceFile(filePath, project)
    }
  )

  return server
}
