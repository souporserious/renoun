import type WebSocket from 'ws'

import type { WebSocketRequest, WebSocketResponse } from './server'

type Request = {
  resolve: (value?: any) => void
  reject: (reason?: any) => void
}

export class WebSocketClient {
  #ws: WebSocket

  #isConnected = false

  #requests: Record<number, Request> = {}

  #pendingRequestIds = new Set<number>()

  constructor() {
    process.env.WS_NO_BUFFER_UTIL = 'true'

    this.#ws = undefined as any

    import('ws').then(({ default: WebSocket }) => {
      this.#ws = new WebSocket(`ws://localhost:5996`)
      this.init()
    })
  }

  init() {
    this.#ws.addEventListener('open', this.#handleOpen.bind(this))

    this.#ws.addEventListener('message', (event) => {
      this.#handleMessage(event.data.toString())
    })

    this.#ws.addEventListener('error', (event) => {
      let message = `[mdxts] WebSocket client error`

      if (event.error.code === 'ECONNREFUSED') {
        message = `[mdxts] Could not connect to the WebSocket server. Please ensure that the "mdxts" server is running.`
      }

      throw new Error(message, { cause: event.error })
    })
  }

  #handleOpen() {
    this.#isConnected = true

    this.#pendingRequestIds.forEach((id) => {
      this.#ws.send(JSON.stringify(this.#requests[id]))
    })
    this.#pendingRequestIds.clear()

    this.#ws.removeEventListener('open', this.#handleOpen)
  }

  #handleMessage(message: string) {
    const response: WebSocketResponse = JSON.parse(message)
    const { id, result, error } = response

    if (id !== undefined && this.#requests[id]) {
      if (error) {
        this.#requests[id].reject(error)
      } else {
        this.#requests[id].resolve(result)
      }

      delete this.#requests[id]
    }
  }

  callMethod(method: string, params: any, timeout = 60000): Promise<any> {
    const id = performance.now()
    const request: WebSocketRequest = { method, params, id }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `[mdxts] Timed out after one minute for the following request: ${JSON.stringify(request)}`
          )
        )
        delete this.#requests[id]
      }, timeout)

      this.#requests[id] = {
        resolve: (value) => {
          clearTimeout(timeoutId)
          resolve(value)
        },
        reject: (reason) => {
          clearTimeout(timeoutId)
          reject(reason)
        },
      } satisfies Request

      if (this.#isConnected) {
        this.#ws.send(JSON.stringify(request))
      } else {
        this.#pendingRequestIds.add(id)
      }
    })
  }
}
