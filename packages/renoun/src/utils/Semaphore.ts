/** Simple semaphore to gate concurrency. */
export class Semaphore {
  #permits: number
  #queue: Array<() => void> = []

  constructor(permits: number) {
    this.#permits = Math.max(1, permits)
  }

  getQueueLength() {
    return this.#queue.length
  }

  async acquire(): Promise<() => void> {
    if (this.#permits > 0) {
      this.#permits--
      let released = false
      return () => {
        if (released) return
        released = true
        this.#permits++
        const next = this.#queue.shift()
        if (next) next()
      }
    }

    return new Promise<() => void>((resolve) => {
      this.#queue.push(() => {
        this.#permits--
        let released = false
        resolve(() => {
          if (released) return
          released = true
          this.#permits++
          const next = this.#queue.shift()
          if (next) next()
        })
      })
    })
  }
}
