import type { QuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import {
  getProjectClientBrowserRuntime,
  getProjectServerRuntimeKey,
  onProjectClientBrowserRuntimeChange,
} from './browser-runtime.ts'
import { WebSocketClient } from './rpc/client.ts'
import type { ProjectServerRuntime } from './runtime-env.ts'
import type { ProjectOptions } from './types.ts'

let client: WebSocketClient | undefined
let clientRuntimeKey: string | undefined
let hasSubscribedToBrowserRuntimeChanges = false

function ensureBrowserRuntimeSubscription(): void {
  if (hasSubscribedToBrowserRuntimeChanges) {
    return
  }

  hasSubscribedToBrowserRuntimeChanges = true
  onProjectClientBrowserRuntimeChange((runtime) => {
    const runtimeKey = getProjectServerRuntimeKey(runtime)
    if (!runtimeKey) {
      disposeProjectBrowserClient()
      return
    }

    if (!client) {
      return
    }

    if (clientRuntimeKey !== runtimeKey) {
      replaceProjectBrowserClient(runtime)
    }
  })
}

function createProjectBrowserClient(
  runtime: ProjectServerRuntime
): WebSocketClient {
  client = new WebSocketClient(runtime.id, runtime)
  clientRuntimeKey = getProjectServerRuntimeKey(runtime)
  return client
}

function disposeProjectBrowserClient(): void {
  if (!client) {
    clientRuntimeKey = undefined
    return
  }

  const activeClient = client
  client = undefined
  clientRuntimeKey = undefined

  try {
    activeClient.removeAllListeners()
  } catch {
    // Ignore cleanup failures; a replacement client will still reconnect.
  }

  try {
    activeClient.close()
  } catch {
    // Ignore cleanup failures; a replacement client will still reconnect.
  }
}

function replaceProjectBrowserClient(
  runtime: ProjectServerRuntime
): WebSocketClient {
  disposeProjectBrowserClient()
  return createProjectBrowserClient(runtime)
}

function getProjectBrowserClient(): WebSocketClient {
  ensureBrowserRuntimeSubscription()

  const runtime = getProjectClientBrowserRuntime()
  const runtimeKey = getProjectServerRuntimeKey(runtime)
  if (!runtime || !runtimeKey) {
    disposeProjectBrowserClient()
    throw new Error('[renoun] Missing active browser project runtime.')
  }

  if (!client) {
    return createProjectBrowserClient(runtime)
  }

  if (clientRuntimeKey !== runtimeKey) {
    return replaceProjectBrowserClient(runtime)
  }

  return client
}

async function callProjectBrowserClientMethod<
  Params extends Record<string, unknown>,
  Value,
>(
  method: string,
  params: Params
): Promise<Value> {
  return getProjectBrowserClient().callMethod<Params, Value>(method, params)
}

export async function getQuickInfoAtPosition(
  filePath: string,
  position: number,
  projectOptions?: ProjectOptions
): Promise<QuickInfoAtPosition | undefined> {
  return callProjectBrowserClientMethod<
    {
      filePath: string
      position: number
      projectOptions?: ProjectOptions
    },
    QuickInfoAtPosition | undefined
  >('getQuickInfoAtPosition', {
    filePath,
    position,
    projectOptions,
  })
}

export async function getTokens(
  options: Omit<GetTokensOptions, 'highlighter' | 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<TokenizedLines> {
  return callProjectBrowserClientMethod<
    Omit<GetTokensOptions, 'highlighter' | 'project'> & {
      projectOptions?: ProjectOptions
    },
    TokenizedLines
  >('getTokens', options)
}
