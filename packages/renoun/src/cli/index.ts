#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { PROCESS_ENV_KEYS } from '../utils/env-keys.ts'
import { isRenounDebugEnabled } from '../utils/env.ts'
import { createServerRuntimeProcessEnv } from '../analysis/runtime-env.ts'
import { createBuildAnalysisClientRuntime } from './build-analysis-runtime.ts'
import {
  ensureNextGeneratedTypes,
  getMissingNextGeneratedTypesConfigWarning,
  shouldSkipBuildPrewarmForMissingNextGeneratedTypes,
} from './build-prewarm-guard.ts'

type Framework = 'next' | 'vite' | 'waku'
type AnalysisCliRuntime = {
  createServer: typeof import('../analysis/server.ts').createServer
  getDebugLogger: typeof import('../utils/debug.ts').getDebugLogger
  createDefaultPrewarmOptions: typeof import('./prewarm-runner.ts').createDefaultPrewarmOptions
  runPrewarmSafely: typeof import('./prewarm-runner.ts').runPrewarmSafely
}

const [firstArgument, secondArgument, ...restArguments] = process.argv.slice(2)

const usageMessage =
  `Usage:   renoun <framework> <command>    Run a framework with renoun\n` +
  `         renoun dev                      Run a renoun app (auto-detect)\n` +
  `         renoun <app> dev                Run a specific renoun app\n` +
  `         renoun eject [app]              Eject a renoun app into your project\n` +
  `         renoun override <pattern>       Copy files from app template (supports globs)\n` +
  `         renoun theme <path>             Prune a VS Code theme JSON file\n` +
  `         renoun cache-token [--json]     Print deterministic cache token for CI\n` +
  `         renoun cache-maintenance [...]  Run SQLite cache checkpoint/health/vacuum maintenance\n` +
  `         renoun validate [path|url]      Check for broken links\n` +
  `\n` +
  `Examples:\n` +
  `  renoun next dev              Run Next.js with renoun\n` +
  `  renoun dev                   Run auto-detected renoun app\n` +
  `  renoun @renoun/blog dev      Run @renoun/blog app\n` +
  `  renoun eject                 Eject app into your project\n` +
  `  renoun cache-token           Print the renoun cache token\n` +
  `  renoun override tsconfig.json    Copy tsconfig.json from app\n` +
  `  renoun override "ui/*.tsx"       Copy all UI components from app`

function toStringArguments(values: Array<string | undefined>): Array<string> {
  return values.filter((value): value is string => typeof value === 'string')
}

async function loadAnalysisCliRuntime(): Promise<AnalysisCliRuntime> {
  const [
    { createServer },
    { getDebugLogger },
    { createDefaultPrewarmOptions, runPrewarmSafely },
  ] = await Promise.all([
    import('../analysis/server.ts'),
    import('../utils/debug.ts'),
    import('./prewarm-runner.ts'),
  ])

  return {
    createServer,
    getDebugLogger,
    createDefaultPrewarmOptions,
    runPrewarmSafely,
  }
}

function exitWithCommandError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}

if (
  firstArgument === 'help' ||
  firstArgument === '--help' ||
  firstArgument === '-h'
) {
  console.log(usageMessage)
  process.exit(0)
}

if (firstArgument === 'validate') {
  const { runValidateCommand } = await import('./validate.ts')
  const args = toStringArguments([secondArgument, ...restArguments])
  await runValidateCommand(args)
  process.exit(process.exitCode ?? 0)
} else if (firstArgument === 'theme') {
  const { runThemeCommand } = await import('./theme.ts')
  await runThemeCommand(secondArgument)
  process.exit(0)
} else if (firstArgument === 'cache-token') {
  const { runCacheTokenCommand } = await import('./cache-token.ts')
  const args = toStringArguments([secondArgument, ...restArguments])

  try {
    await runCacheTokenCommand(args)
    process.exit(0)
  } catch (error) {
    exitWithCommandError(error)
  }
} else if (firstArgument === 'cache-maintenance') {
  const { runCacheMaintenanceCommand } = await import('./cache-maintenance.ts')
  const args = toStringArguments([secondArgument, ...restArguments])

  try {
    await runCacheMaintenanceCommand(args)
    process.exit(0)
  } catch (error) {
    exitWithCommandError(error)
  }
} else if (firstArgument === 'dev' || firstArgument === 'build') {
  const { runAppCommand } = await import('./app.ts')
  // Auto-detect app mode: `renoun dev` or `renoun build`
  // Forward all args as framework args (no app name detection in this mode)
  const forwardedArgs = toStringArguments([secondArgument, ...restArguments])
  await runAppCommand({
    command: firstArgument,
    args: forwardedArgs,
    autoDetect: true,
  })
  process.exit(process.exitCode ?? 0)
} else if (
  firstArgument === 'next' ||
  firstArgument === 'vite' ||
  firstArgument === 'waku'
) {
  const {
    createServer,
    getDebugLogger,
    createDefaultPrewarmOptions,
    runPrewarmSafely,
  } = await loadAnalysisCliRuntime()
  const { resolveFrameworkBinFile } = await import('./framework.ts')

  let subProcess: ReturnType<typeof spawn> | undefined

  function cleanupAndExit(code: number) {
    getDebugLogger().info('CLI cleanup initiated', () => ({
      data: { exitCode: code, hasSubProcess: !!subProcess },
    }))

    if (subProcess) {
      const pid = subProcess?.pid ?? null
      getDebugLogger().debug('Terminating subprocess', () => ({
        data: { pid },
      }))
      subProcess.kill('SIGTERM')
    }
    process.exit(code)
  }

  const isProduction = secondArgument === 'build'

  if (process.env[PROCESS_ENV_KEYS.nodeEnv] === undefined) {
    process.env[PROCESS_ENV_KEYS.nodeEnv] = isProduction
      ? 'production'
      : 'development'
  }

  getDebugLogger().info('Starting renoun CLI', () => ({
    data: {
      framework: firstArgument,
      command: secondArgument,
      isProduction,
      nodeEnv: process.env[PROCESS_ENV_KEYS.nodeEnv],
      debugEnabled: isRenounDebugEnabled(),
    },
  }))

  async function runSubProcess() {
    return getDebugLogger().trackOperation(
      'cli.runSubProcess',
      async () => {
        const buildClientRuntime = isProduction
          ? createBuildAnalysisClientRuntime()
          : undefined
        const server = await createServer(
          buildClientRuntime
            ? {
                clientRuntime: buildClientRuntime,
              }
            : undefined
        )
        const serverHost = process.env[PROCESS_ENV_KEYS.renounServerHost]
        const serverRefreshNotificationsEffective =
          process.env[
            PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective
          ]
        const port = String(await server.getPort())
        const id = server.getId()

        getDebugLogger().info('renoun server created', () => ({
          data: { port, serverId: id },
        }))

        if (!isProduction) {
          void runPrewarmSafely(createDefaultPrewarmOptions(), {
            allowInlineFallback: false,
          })
        } else {
          const prewarmOptions = createDefaultPrewarmOptions()
          const nextGeneratedTypesStatus = await ensureNextGeneratedTypes({
            framework: firstArgument as Framework,
            rootPath: process.cwd(),
            tsConfigFilePath: prewarmOptions.analysisOptions?.tsConfigFilePath,
            log: (message) => {
              process.stdout.write(`[renoun] ${message}\n`)
            },
          })
          const missingNextGeneratedTypesConfigWarning =
            getMissingNextGeneratedTypesConfigWarning(nextGeneratedTypesStatus)

          if (missingNextGeneratedTypesConfigWarning) {
            process.stdout.write(
              `[renoun] ${missingNextGeneratedTypesConfigWarning}\n`
            )
          }

          const shouldSkipBuildPrewarm =
            shouldSkipBuildPrewarmForMissingNextGeneratedTypes({
              framework: firstArgument as Framework,
              rootPath: process.cwd(),
              tsConfigFilePath: prewarmOptions.analysisOptions?.tsConfigFilePath,
            })

          if (shouldSkipBuildPrewarm) {
            process.stdout.write(
              '[renoun] Skipping analysis cache prewarm until Next.js generated types exist\n'
            )
          } else {
            process.stdout.write(
              '[renoun] Prewarming analysis cache for build...\n'
            )

            try {
              const { prewarmRenounRpcServerCache } = await import('./prewarm.ts')
              await prewarmRenounRpcServerCache(prewarmOptions)
              process.stdout.write('[renoun] Analysis cache prewarmed\n')
            } catch (error) {
              getDebugLogger().warn(
                'Failed to prewarm Renoun RPC cache before framework build',
                () => ({
                  data: {
                    framework: firstArgument,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                })
              )
            }
          }
        }

        const frameworkBinPath = resolveFrameworkBinFile(
          firstArgument as Framework
        )
        const args = [frameworkBinPath]
        let command = secondArgument

        if (!command && firstArgument === 'next') {
          command = 'dev'
        }
        if (command) {
          args.push(command)
        }

        args.push(...restArguments)

        subProcess = spawn(process.execPath, args, {
          stdio: ['inherit', 'inherit', 'pipe'],
          shell: false,
          env: {
            ...process.env,
            ...createServerRuntimeProcessEnv({
              port,
              id,
              ...(typeof serverHost === 'string' && serverHost.length > 0
                ? { host: serverHost }
                : {}),
              ...(typeof serverRefreshNotificationsEffective === 'string' &&
              serverRefreshNotificationsEffective.length > 0
                ? {
                    emitRefreshNotifications:
                      serverRefreshNotificationsEffective === '1',
                  }
                : {}),
              ...(buildClientRuntime
                ? { clientRuntime: buildClientRuntime }
                : {}),
            }),
          },
        })

        {
          const pid = subProcess?.pid ?? null
          getDebugLogger().info('Subprocess spawned', () => ({
            data: {
              pid,
              command: `${firstArgument} ${secondArgument}`,
            },
          }))
        }

        const fatalRE = /(FATAL ERROR|Allocation failed|heap limit)/i

        subProcess.stderr?.on('data', (buffer) => {
          const line = buffer.toString()
          getDebugLogger().error('Subprocess stderr', () => ({ data: line }))

          if (fatalRE.test(line)) {
            getDebugLogger().error(
              'Detected fatal stderr pattern - killing subprocess'
            )
            subProcess?.kill('SIGKILL')
          }

          process.stderr.write(buffer)
        })

        subProcess.on(
          'exit',
          (code: number | null, signal: NodeJS.Signals | null) => {
            {
              const pid = subProcess?.pid ?? null
              getDebugLogger().error('Subprocess exit', () => ({
                data: { pid, exitCode: code, signal },
              }))
            }
          }
        )

        subProcess.on('close', (code: number) => {
          const pid = subProcess?.pid ?? null
          getDebugLogger().info('Subprocess closed', () => ({
            data: { pid, exitCode: code },
          }))
          server.cleanup()
          cleanupAndExit(code)
        })

        subProcess.on('error', (error: Error) => {
          const pid = subProcess?.pid ?? null
          getDebugLogger().error('Subprocess error', () => ({
            data: { pid, error: error.message },
          }))
          server.cleanup()
          cleanupAndExit(1)
        })

        return server
      },
      { data: { framework: firstArgument, command: secondArgument } }
    )
  }

  await runSubProcess()

  process.on('SIGINT', () => {
    getDebugLogger().info('Received SIGINT signal')
    cleanupAndExit(0)
  })

  process.on('SIGTERM', () => {
    getDebugLogger().info('Received SIGTERM signal')
    cleanupAndExit(0)
  })

  process.on('uncaughtException', (error) => {
    getDebugLogger().error('Uncaught exception', () => ({
      data: { error: error.message, stack: error.stack },
    }))
    console.error('Uncaught exception:', error)
    cleanupAndExit(1)
  })

  process.on('unhandledRejection', (reason) => {
    getDebugLogger().error('Unhandled rejection', () => ({
      data: { reason: String(reason) },
    }))
    console.error('Unhandled rejection:', reason)
    cleanupAndExit(1)
  })
} else if (
  // App mode, app-first form: `renoun @renoun/docs dev`
  secondArgument === 'dev' ||
  secondArgument === 'build'
) {
  const { runAppCommand } = await import('./app.ts')
  const appArgs = toStringArguments([firstArgument, ...restArguments])
  await runAppCommand({
    command: secondArgument as 'dev' | 'build',
    args: appArgs,
  })
  process.exit(process.exitCode ?? 0)
} else if (firstArgument === 'eject') {
  const { runEjectCommand } = await import('./eject.ts')
  try {
    await runEjectCommand({ appName: secondArgument })
    process.exit(0)
  } catch (error) {
    exitWithCommandError(error)
  }
} else if (firstArgument === 'override') {
  const { runOverrideCommand } = await import('./override.ts')
  if (!secondArgument) {
    console.error(
      '[renoun] Missing pattern. Usage: renoun override <pattern>\n' +
        'Examples:\n' +
        '  renoun override tsconfig.json\n' +
        '  renoun override "ui/*.tsx"'
    )
    process.exit(1)
  }
  try {
    await runOverrideCommand({ pattern: secondArgument })
    process.exit(0)
  } catch (error) {
    exitWithCommandError(error)
  }
} else if (firstArgument === 'reorder') {
  const { reorderEntries } = await import('./reorder.ts')
  try {
    await reorderEntries(secondArgument)
    process.exit(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    exitWithCommandError(`Failed to reorder entries: ${message}`)
  }
} else if (firstArgument === 'watch') {
  const {
    createServer,
    getDebugLogger,
    createDefaultPrewarmOptions,
    runPrewarmSafely,
  } = await loadAnalysisCliRuntime()

  if (process.env[PROCESS_ENV_KEYS.nodeEnv] === undefined) {
    process.env[PROCESS_ENV_KEYS.nodeEnv] = 'development'
  }

  getDebugLogger().info('Starting renoun watch mode', () => ({
    data: {
      nodeEnv: process.env[PROCESS_ENV_KEYS.nodeEnv],
      debugEnabled: isRenounDebugEnabled(),
    },
  }))

  try {
    await getDebugLogger().trackOperation(
      'cli.watch',
      async () => {
        const server = await createServer()

        if (getDebugLogger().isEnabled('info')) {
          const port = await server.getPort()
          getDebugLogger().info('Watch server created', () => ({
            data: { port },
          }))
        }

        void runPrewarmSafely(createDefaultPrewarmOptions(), {
          allowInlineFallback: false,
        })

        return server
      },
      { data: { mode: 'watch' } }
    )
  } catch (error) {
    exitWithCommandError(error)
  }
} else {
  if (firstArgument) {
    console.error(
      `[renoun] Unknown command "${firstArgument}".\n${usageMessage}`
    )
  } else {
    console.error(`[renoun] Missing command.\n${usageMessage}`)
  }
  process.exit(1)
}
