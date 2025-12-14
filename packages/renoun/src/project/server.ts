import { watch } from 'node:fs'
import { join } from 'node:path'
import { getTsMorph } from '../utils/ts-morph.ts'
import type { SyntaxKind as TsMorphSyntaxKind } from '../utils/ts-morph.ts'

import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.ts'
import type { ConfigurationOptions } from '../components/Config/types.ts'
import { getDebugLogger } from '../utils/debug.ts'
import {
  getFileExports as baseGetFileExports,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import { getFileExportText as baseGetFileExportText } from '../utils/get-file-export-text.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import {
  getTokens as baseGetTokens,
  type GetTokensOptions,
} from '../utils/get-tokens.ts'
import {
  getSourceTextMetadata as baseGetSourceTextMetadata,
  type GetSourceTextMetadataOptions,
} from '../utils/get-source-text-metadata.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { resolveTypeAtLocation as baseResolveTypeAtLocation } from '../utils/resolve-type-at-location.ts'
import { transpileSourceFile as baseTranspileSourceFile } from '../utils/transpile-source-file.ts'
import { WebSocketServer } from './rpc/server.ts'
import { getProject } from './get-project.ts'
import type { ProjectOptions } from './types.ts'

const { SyntaxKind } = getTsMorph()

let currentHighlighter: Promise<Highlighter> | null = null

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

    watch(rootDirectory, { recursive: true }, (_, fileName) => {
      if (!fileName) return

      const filePath = join(rootDirectory, fileName)

      if (isFilePathGitIgnored(filePath)) {
        return
      }

      /* Notify the client to refresh when files change. */
      server.sendNotification({ type: 'refresh' })
    })
  }

  server.registerMethod(
    'getSourceTextMetadata',
    async function getSourceTextMetadata({
      projectOptions,
      ...options
    }: GetSourceTextMetadataOptions & {
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)

      return baseGetSourceTextMetadata({
        ...options,
        project,
      })
    },
    {
      memoize: true,
      concurrency: 10,
    }
  )

  server.registerMethod(
    'getTokens',
    async function getTokens({
      projectOptions,
      ...options
    }: GetTokensOptions & {
      projectOptions?: ProjectOptions
      languages?: ConfigurationOptions['languages']
    }) {
      const project = getProject(projectOptions)

      if (currentHighlighter === null) {
        currentHighlighter = createHighlighter({
          theme: options.theme,
          languages: options.languages,
        })
      }

      const highlighter = await currentHighlighter

      return baseGetTokens({
        ...options,
        highlighter,
        project,
      })
    },
    {
      memoize: true,
      concurrency: 10,
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
      kind: TsMorphSyntaxKind
      filter?: string
      projectOptions?: ProjectOptions
    }) {
      return getDebugLogger().trackOperation(
        'server.resolveTypeAtLocation',
        async () => {
          const project = getProject(projectOptions)

          getDebugLogger().info('Processing type resolution request', () => ({
            data: {
              filePath: options.filePath,
              position: options.position,
              kind: SyntaxKind[options.kind],
              useInMemoryFileSystem: projectOptions?.useInMemoryFileSystem,
            },
          }))

          return baseResolveTypeAtLocation(
            project,
            options.filePath,
            options.position,
            options.kind,
            filter ? JSON.parse(filter) : undefined,
            projectOptions?.useInMemoryFileSystem
          )
        },
        {
          data: {
            filePath: options.filePath,
            position: options.position,
            kind: SyntaxKind[options.kind],
          },
        }
      )
    },
    {
      // Type resolution already has its own dependency-aware cache
      // (see `resolve-type-at-location.ts`). Avoid RPC-level memoization
      // so changes to source or its dependencies are always reflected.
      memoize: false,
      concurrency: 3,
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
    },
    {
      memoize: true,
      concurrency: 25,
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
      kind: TsMorphSyntaxKind
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseGetFileExportMetadata(name, filePath, position, kind, project)
    },
    {
      memoize: true,
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getFileExportText',
    async function getFileExportText({
      filePath,
      position,
      kind,
      includeDependencies,
      projectOptions,
    }: {
      filePath: string
      position: number
      kind: TsMorphSyntaxKind
      includeDependencies?: boolean
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return baseGetFileExportText({
        filePath,
        position,
        kind,
        includeDependencies,
        project,
      })
    },
    {
      memoize: true,
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getFileExportStaticValue',
    async function getFileExportStaticValue({
      filePath,
      position,
      kind,
      projectOptions,
    }: {
      filePath: string
      position: number
      kind: TsMorphSyntaxKind
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      const { getFileExportStaticValue } =
        await import('../utils/get-file-export-static-value.ts')
      return getFileExportStaticValue(filePath, position, kind, project)
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
