import WebSocket from 'ws'
import type { WebSocketRequest, WebSocketResponse } from './server'

export class WebSocketClient {
  #ws: WebSocket
  #requests: {
    [key: number]: {
      resolve: (value?: any) => void
      reject: (reason?: any) => void
    }
  } = {}
  #isConnected = false
  #id = 0

  constructor() {
    if (process.env.MDXTS_WS_PORT === undefined) {
      throw new Error(
        '[mdxts] The MDXTS_WS_PORT environment variable is "undefined". Make sure the mdxts cli is running.'
      )
    }
    this.#ws = new WebSocket(`ws://localhost:${process.env.MDXTS_WS_PORT}`)
    this.#ws.once('open', () => (this.#isConnected = true))
    this.#ws.on('message', (message: string) => this.#handleMessage(message))
  }

  #handleMessage(message: string) {
    const response: WebSocketResponse = JSON.parse(message)
    const { id, result, error } = response

    if (id && this.#requests[id]) {
      if (error) {
        this.#requests[id].reject(error)
      } else {
        this.#requests[id].resolve(result)
      }

      delete this.#requests[id]
    }
  }

  callMethod(method: string, params: any, timeout = 60000): Promise<any> {
    const id = this.#id++
    const request: WebSocketRequest = {
      method: method,
      params: params,
      id: id,
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(`Request timed out after one minute for method: ${method}`)
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
