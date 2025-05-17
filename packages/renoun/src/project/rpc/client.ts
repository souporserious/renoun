import type WebSocket from 'ws'

import type { WebSocketRequest, WebSocketResponse } from './server.js'

type Request = {
  resolve: (value?: any) => void
  reject: (reason?: any) => void
}

export class WebSocketClient {
  #ws!: WebSocket
  #isConnected = false
  #requests: Record<number, Request> = {}
  #pendingRequests = new Set<string>()
  #retryInterval: number = 5000
  #maxRetries: number = 5
  #currentRetries: number = 0
  #handleOpenEvent = this.#handleOpen.bind(this)
  #handleMessageEvent = this.#handleMessage.bind(this)
  #handleErrorEvent = this.#handleError.bind(this)
  #handleCloseEvent = this.#handleClose.bind(this)

  constructor() {
    process.env.WS_NO_BUFFER_UTIL = 'true'
    this.#connect()
  }

  #connect() {
    import('ws').then(({ default: WebSocket }) => {
      this.#ws = new WebSocket(
        `ws://localhost:${process.env.RENOUN_SERVER_PORT}`,
        process.env.RENOUN_SERVER_SECRET
      )
      this.#ws.addEventListener('open', this.#handleOpenEvent)
      this.#ws.addEventListener('message', this.#handleMessageEvent)
      this.#ws.addEventListener('error', this.#handleErrorEvent)
      this.#ws.addEventListener('close', this.#handleCloseEvent)
    })
  }

  #handleOpen() {
    this.#isConnected = true
    this.#currentRetries = 0

    this.#pendingRequests.forEach((request) => {
      this.#ws.send(request)
    })
    this.#pendingRequests.clear()
  }

  #handleMessage(event: WebSocket.MessageEvent) {
    const message = event.data.toString()

    try {
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
    } catch (error) {
      throw new Error(`[renoun] WebSocket client error parsing message:`, {
        cause: error,
      })
    }
  }

  #handleError(event: WebSocket.ErrorEvent) {
    throw new Error(
      `[renoun] WebSocket client error: ${event.message} \n\nThis was most likely caused by the "renoun" server not running.`
    )
  }

  #handleClose() {
    this.#isConnected = false
    this.#ws.removeEventListener('open', this.#handleOpenEvent)
    this.#ws.removeEventListener('message', this.#handleMessageEvent)
    this.#ws.removeEventListener('error', this.#handleErrorEvent)
    this.#ws.removeEventListener('close', this.#handleCloseEvent)
    this.#retryConnection()
  }

  #retryConnection() {
    if (this.#currentRetries < this.#maxRetries) {
      this.#currentRetries++
      setTimeout(() => {
        console.log(
          `[renoun] Attempting to reconnect to WebSocket server... (${this.#currentRetries}/${this.#maxRetries})`
        )
        this.#connect()
      }, this.#retryInterval)
    } else {
      throw new Error(
        `[renoun] Could not reconnect to the WebSocket server after ${this.#maxRetries} attempts.`
      )
    }
  }

  async callMethod<Params, Value>(
    method: string,
    params: Params,
    timeout = 60000
  ): Promise<Value> {
    const id = performance.now()
    const request: WebSocketRequest = { method, params, id }

    return new Promise<Value>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `[renoun] Timed out after one minute for the following request: ${JSON.stringify(request)}`
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
        this.#pendingRequests.add(JSON.stringify(request))
      }
    }).catch((error) => {
      throw new Error(error.data || error.message)
    })
  }
}
