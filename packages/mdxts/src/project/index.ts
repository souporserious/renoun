import type { ProjectOptions } from 'ts-morph'
import { signal, effect } from '@preact/signals-core'
import { setTimeout } from 'node:timers'
import WebSocket from 'ws'

if (process.env.MDXTS_PORT_NUMBER === undefined) {
  throw new Error(
    '[mdxts] The MDXTS_PORT_NUMBER environment variable is "undefined". Make sure the mdxts cli is running.'
  )
}

const ws = new WebSocket(`ws://localhost:${process.env.MDXTS_PORT_NUMBER}`)
const isServerReady = signal(false)

function whenServerReady() {
  if (isServerReady.value) {
    return Promise.resolve(undefined)
  }
  let resolve: (value: undefined) => void
  const cleanup = effect(() => {
    if (isServerReady.value) {
      resolve(undefined)
      cleanup()
    }
  })
  return new Promise((promiseResolve) => {
    resolve = promiseResolve
  })
}

ws.on('open', () => {
  isServerReady.value = true
})

/** Sends a message to the server and waits for a response. */
function send<ReturnValue>(type: string, data?: any, timeout: number = 60000) {
  ws.send(JSON.stringify({ type, data }))

  return new Promise<ReturnValue>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(`Server response timed out after one minute for "${type}"`)
      )
    }, timeout)

    function handleMessage(message: WebSocket.MessageEvent) {
      const event = JSON.parse(message.toString())
      if (event.type === `${type}:done`) {
        resolve(event.data)
        clearTimeout(timeoutId)
        ws.off('message', handleMessage)
      }
    }

    ws.on('message', handleMessage)
  })
}

/** Creates a project based on the provided options. */
export function createProject(projectOptions: ProjectOptions) {
  let projectInitialized = false

  /** Starts a project based on the provided options and returns it. */
  async function initializeProject(options: ProjectOptions) {
    await whenServerReady()

    if (projectInitialized) {
      return
    }

    projectInitialized = true

    await send<void>('initialize', options)
  }

  return {
    analyze: async (options: {
      filename: string
      value: string
      allowErrors?: boolean
      showErrors?: boolean
    }) => {
      await initializeProject(projectOptions)
      return send<{}>('analyze', options)
    },
  }
}
