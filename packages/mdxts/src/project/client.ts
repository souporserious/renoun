import { signal, effect } from '@preact/signals-core'
import { setTimeout } from 'node:timers'
import WebSocket from 'ws'

if (process.env.MDXTS_PORT_NUMBER === undefined) {
  throw new Error(
    '[mdxts] The MDXTS_PORT_NUMBER environment variable is "undefined". Make sure the mdxts cli is running.'
  )
}

const isServerReady = signal(false)
const maxReconnectAttempts = 10
const reconnectInterval = 1000
let reconnectAttempts = 0
let ws: WebSocket

/** Connects to the server. */
function connect() {
  if (
    ws?.readyState === WebSocket.OPEN ||
    ws?.readyState === WebSocket.CONNECTING
  ) {
    return
  }

  ws = new WebSocket(`ws://localhost:${process.env.MDXTS_PORT_NUMBER}`)

  ws.on('open', () => {
    isServerReady.value = true
    reconnectAttempts = 0
  })

  ws.on('close', () => {
    isServerReady.value = false
    reconnect()
  })

  ws.on('error', (error) => {
    console.error('[mdxts] WebSocket error:', error)
    isServerReady.value = false
    reconnect()
  })
}
connect()

/** Attempts to reconnect to the server. */
function reconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    setTimeout(
      () => {
        reconnectAttempts += 1
        connect()
      },
      // Exponentially increase the reconnect interval.
      reconnectInterval * Math.pow(2, reconnectAttempts)
    )
  } else {
    console.error('[mdxts] Maximum reconnection attempts reached.')
  }
}

/** Waits for the server to be ready. */
export function whenServerReady() {
  if (isServerReady.value) {
    return Promise.resolve(undefined)
  }
  return new Promise<void>((resolve) => {
    const cleanup = effect(() => {
      if (isServerReady.value) {
        resolve()
        cleanup()
      }
    })
  })
}

let eventIdCount = 0

/** Sends a message to the server and waits for a response. */
export function sendToServer<ReturnValue>(
  type: string,
  data?: any,
  timeout: number = 60000
) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('WebSocket is not connected'))
  }

  const id = eventIdCount++
  ws.send(JSON.stringify({ type, data, id }))

  return new Promise<ReturnValue>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(`Server response timed out after one minute for "${type}"`)
      )
    }, timeout)

    function handleMessage(message: WebSocket.MessageEvent) {
      const event = JSON.parse(message.toString())
      if (event.id !== id) {
        return
      }
      if (event.type === `${type}:done`) {
        resolve(event.data)
        clearTimeout(timeoutId)
        ws.off('message', handleMessage)
      } else if (event.type === 'error') {
        reject(new Error(event.data))
        clearTimeout(timeoutId)
        ws.off('message', handleMessage)
      }
    }

    ws.on('message', handleMessage)
  })
}
