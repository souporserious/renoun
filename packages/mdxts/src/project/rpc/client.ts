import type WebSocket from 'ws'

import type { WebSocketRequest, WebSocketResponse } from './server'

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
      this.#ws = new WebSocket(`ws://localhost:5996`)
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

  #handleError(event: WebSocket.ErrorEvent) {
    console.error('[mdxts] WebSocket client error:', event.message)
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
          `[mdxts] Attempting to reconnect to WebSocket server... (${this.#currentRetries}/${this.#maxRetries})`
        )
        this.#connect()
      }, this.#retryInterval)
    } else {
      throw new Error(
        `[mdxts] Could not reconnect to the WebSocket server after ${this.#maxRetries} attempts.`
      )
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
        this.#pendingRequests.add(JSON.stringify(request))
      }
    })
  }
}
