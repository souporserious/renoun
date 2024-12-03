import { formatNameAsTitle } from '../utils/format-name-as-title.js'

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

  /** The intrinsic name of the file. */
  getName(): string {
    return this.#name
  }

  /** The file name without the extension. */
  getBaseName(): string {
    return this.#base
  }

  /** The file name formatted as a title. */
  getTitle() {
    return formatNameAsTitle(this.getName())
  }

  /** The order of the file if defined. */
  getOrder(): string | undefined {
    return this.#order
  }

  /** The modifier of the file if defined. */
  getModifier(): string | undefined {
    return this.#modifier
  }

  /** The extension of the file if defined. */
  getExtension(): string | undefined {
    return this.#extension
  }
}
