import WebSocket from 'ws'
import type { WebSocketRequest, WebSocketResponse } from './server'

let requestId = 0

export class WebSocketClient {
  #ws: WebSocket
  #isConnected = false
  #requests: {
    [key: number]: {
      resolve: (value?: any) => void
      reject: (reason?: any) => void
    }
  } = {}

  constructor() {
    this.#ws = new WebSocket(`ws://localhost:${process.env.MDXTS_WS_PORT}`)
    this.#ws.once('open', () => (this.#isConnected = true))
    this.#ws.on('message', this.#handleMessage.bind(this))
  }

  #handleMessage(message: string) {
    const response: WebSocketResponse = JSON.parse(message)
    const { id, result, error } = response

    if (this.#requests[id]) {
      if (error) {
        this.#requests[id].reject(error)
      } else {
        this.#requests[id].resolve(result)
      }

      delete this.#requests[id]
    }
  }

  callMethod(method: string, params: any, timeout = 60000): Promise<any> {
    const id = requestId++
    const request: WebSocketRequest = { method, params, id }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `[mdxts] Timed out after one minute for request: ${JSON.stringify(request)}`
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
      }

      if (this.#isConnected) {
        this.#ws.send(JSON.stringify(request))
      } else {
        this.#ws.once('open', () => {
          this.#ws.send(JSON.stringify(request))
        })
      }
    })
  }
}
