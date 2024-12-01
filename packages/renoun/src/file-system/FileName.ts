export class FileName {
  #name: string
  #order?: string
  #base: string
  #modifier?: string
  #extension?: string

  constructor(name: string) {
    this.#name = name

    const match = this.#name.match(
      /^(?:(\d+)[.-])?([^.]+)(?:\.([^.]+))?(?:\.([^.]+))?$/
    )

    if (match) {
      this.#order = match[1]
      this.#base = match[2] ?? this.#name
      this.#modifier = match[4] ? match[3] : undefined
      this.#extension = match[4] ?? match[3]
    } else {
      this.#base = this.#name
    }
  }

  getName(): string {
    return this.#name
  }

  getBaseName(): string {
    return this.#base
  }

  getOrder(): string | undefined {
    return this.#order
  }

  getModifier(): string | undefined {
    return this.#modifier
  }

  getExtension(): string | undefined {
    return this.#extension
  }
}
