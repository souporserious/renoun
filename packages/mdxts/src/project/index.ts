import type { ProjectOptions } from 'ts-morph'
import { signal, effect } from '@preact/signals-core'
import { setTimeout } from 'node:timers'
import WebSocket from 'ws'

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

if (process.env.MDXTS_PORT_NUMBER === undefined) {
  throw new Error(
    '[mdxts] The MDXTS_PORT_NUMBER environment variable is "undefined". Make sure the mdxts cli is running.'
  )
}

const ws = new WebSocket(`ws://localhost:${process.env.MDXTS_PORT_NUMBER}`)

ws.on('open', () => {
  isServerReady.value = true
})

export function createProject(projectOptions: ProjectOptions) {
  let projectInitialized = false

  /** Starts a project based on the provided options and returns it. */
  async function initializeProject(options: ProjectOptions) {
    await whenServerReady()

    if (projectInitialized) {
      return
    }

    projectInitialized = true

    ws.send(JSON.stringify({ type: 'initialize', options }))

    await new Promise<void>((resolve, reject) => {
      function handleMessage(event: WebSocket.MessageEvent) {
        const { type } = JSON.parse(event.toString())
        if (type === 'initialize:done') {
          resolve()
          ws.removeEventListener('message', handleMessage)
        }
      }
      ws.on('message', handleMessage)

      setTimeout(() => {
        reject(new Error('Project initialization timed out'))
      }, 10000)
    })
  }

  function send(type: string, data?: any) {
    ws.send(JSON.stringify({ type, data }))

    return new Promise((resolve) => {
      function handleMessage(message: WebSocket.MessageEvent) {
        const event = JSON.parse(message.toString())
        if (event.type === `${type}:done`) {
          resolve(event.data)
          ws.off('message', handleMessage)
        }
      }
      ws.on('message', handleMessage)
    })
  }

  return {
    analyze: async (options: {
      filename: string
      value: string
      allowErrors?: boolean
      showErrors?: boolean
    }) => {
      await initializeProject(projectOptions)
      return send('analyze', options)
    },
  }
}
