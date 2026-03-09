import type { QuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import { getProjectClientBrowserRuntime, getProjectServerRuntimeKey } from './browser-runtime.ts'
import { WebSocketClient } from './rpc/client.ts'
import type { ProjectServerRuntime } from './runtime-env.ts'
import type { ProjectOptions } from './types.ts'

interface BrowserRuntimeClientState {
  client: WebSocketClient
}

const browserClientsByRuntimeKey = new Map<string, BrowserRuntimeClientState>()

function createProjectBrowserClient(
  runtime: ProjectServerRuntime,
  runtimeKey: string
): BrowserRuntimeClientState {
  const state: BrowserRuntimeClientState = {
    client: new WebSocketClient(runtime.id, runtime),
  }
  browserClientsByRuntimeKey.set(runtimeKey, state)
  return state
}

function disposeProjectBrowserClient(runtimeKey?: string): void {
  const states =
    runtimeKey === undefined
      ? Array.from(browserClientsByRuntimeKey.values())
      : [browserClientsByRuntimeKey.get(runtimeKey)].filter(
          (state): state is BrowserRuntimeClientState => state !== undefined
        )

  if (states.length === 0) {
    return
  }

  if (runtimeKey === undefined) {
    browserClientsByRuntimeKey.clear()
  } else {
    browserClientsByRuntimeKey.delete(runtimeKey)
  }

  for (const state of states) {
    const activeClient = state.client

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
}

function getProjectBrowserClient(
  requestedRuntime?: ProjectServerRuntime
): WebSocketClient {
  const runtime = requestedRuntime ?? getProjectClientBrowserRuntime()
  const runtimeKey = getProjectServerRuntimeKey(runtime)
  if (!runtime || !runtimeKey) {
    disposeProjectBrowserClient()
    throw new Error('[renoun] Missing active browser project runtime.')
  }

  const existingClientState = browserClientsByRuntimeKey.get(runtimeKey)
  if (existingClientState) {
    return existingClientState.client
  }

  return createProjectBrowserClient(runtime, runtimeKey).client
}

async function callProjectBrowserClientMethod<
  Params extends Record<string, unknown>,
  Value,
>(
  method: string,
  params: Params,
  runtime?: ProjectServerRuntime
): Promise<Value> {
  return getProjectBrowserClient(runtime).callMethod<Params, Value>(
    method,
    params
  )
}

export async function getQuickInfoAtPosition(
  filePath: string,
  position: number,
  projectOptions?: ProjectOptions,
  runtime?: ProjectServerRuntime
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
  }, runtime)
}

export async function getTokens(
  options: Omit<GetTokensOptions, 'highlighter' | 'project'> & {
    projectOptions?: ProjectOptions
    waitForWarmResult?: boolean
    runtime?: ProjectServerRuntime
  }
): Promise<TokenizedLines> {
  const { runtime, ...params } = options
  return callProjectBrowserClientMethod<
    Omit<GetTokensOptions, 'highlighter' | 'project'> & {
      projectOptions?: ProjectOptions
      waitForWarmResult?: boolean
    },
    TokenizedLines
  >('getTokens', params, runtime)
}

export const __TEST_ONLY__ = {
  disposeProjectBrowserClient,
}
