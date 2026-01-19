/**
 * Modified from `oniguruma-to-es` to support TextMate-style hidden and transfer captures.
 * https://github.com/slevithan/oniguruma-to-es/blob/main/src/subclass.js
 */
export type EmulatedRegExpOptions = {
  hiddenCaptures?: Array<number>
  lazyCompile?: boolean
  strategy?: string | null
  transfers?: Array<[number, Array<number>]>
  textmateSource?: string
}

type CaptureMapEntry = {
  hidden?: true
  transferTo?: number
}

/**
 * Works like native `RegExp`, but supports hidden and transfer captures emitted
 * by precompiled TextMate grammars.
 */
export class EmulatedRegExp extends RegExp {
  #captureMap = new Map<number, CaptureMapEntry>()
  #compiled: RegExp | EmulatedRegExp | null = null
  #pattern = ''
  #nameMap: Map<number, string> | null = null
  #strategy: string | null = null

  rawOptions: EmulatedRegExpOptions = {}

  // Override the getter with one that works with lazy-compiled regexes.
  get source() {
    return this.#pattern || '(?:)'
  }

  constructor(
    pattern: string | RegExp,
    flags?: string,
    options?: EmulatedRegExpOptions
  ) {
    const lazyCompile = !!options?.lazyCompile
    if (pattern instanceof RegExp) {
      if (options) {
        throw new Error('Cannot provide options when copying a regexp')
      }
      const re = pattern
      super(re, flags)
      this.#pattern = re.source
      if (re instanceof EmulatedRegExp) {
        this.#captureMap = re.#captureMap
        this.#nameMap = re.#nameMap
        this.#strategy = re.#strategy
        this.rawOptions = re.rawOptions
      } else if (isEmulatedRegExpLike(re)) {
        this.#captureMap = createCaptureMap(
          re.rawOptions.hiddenCaptures ?? [],
          re.rawOptions.transfers ?? []
        )
        this.#strategy = re.rawOptions.strategy ?? null
        this.rawOptions = re.rawOptions
      }
    } else {
      const opts = {
        hiddenCaptures: [],
        strategy: null,
        transfers: [],
        ...options,
      }
      super(lazyCompile ? '' : pattern, flags)
      this.#pattern = pattern
      this.#captureMap = createCaptureMap(opts.hiddenCaptures, opts.transfers)
      this.#strategy = opts.strategy
      this.rawOptions = options ?? {}
    }

    if (!lazyCompile) {
      this.#compiled = this
    }
  }

  exec(str: string): RegExpExecArray | null {
    if (!this.#compiled) {
      const { lazyCompile, ...rest } = this.rawOptions
      this.#compiled = new EmulatedRegExp(this.#pattern, this.flags, rest)
    }

    const useLastIndex = this.global || this.sticky
    const pos = this.lastIndex

    if (this.#strategy === 'clip_search' && useLastIndex && pos) {
      this.lastIndex = 0
      const match = this.#execCore(str.slice(pos))
      if (match) {
        adjustMatchDetailsForOffset(match, pos, str, this.hasIndices)
        this.lastIndex += pos
      }
      return match
    }

    return this.#execCore(str)
  }

  #execCore(str: string): RegExpExecArray | null {
    this.#compiled!.lastIndex = this.lastIndex
    const match = super.exec.call(this.#compiled, str) as RegExpExecArray | null
    this.lastIndex = this.#compiled!.lastIndex

    if (!match || !this.#captureMap.size) {
      return match
    }

    const matchCopy = [...match]
    match.length = 1
    let indicesCopy: Array<[number, number] | null> | undefined
    const hasIndices = this.hasIndices && !!match.indices
    if (hasIndices) {
      indicesCopy = [...match.indices!] as Array<[number, number] | null>
      match.indices!.length = 1
    }
    const mappedNums: Array<number | null> = [0]
    for (let i = 1; i < matchCopy.length; i++) {
      const { hidden, transferTo } = this.#captureMap.get(i) ?? {}
      if (hidden) {
        mappedNums.push(null)
      } else {
        mappedNums.push(match.length)
        match.push(matchCopy[i])
        if (hasIndices && indicesCopy) {
          match.indices!.push(indicesCopy[i] as any)
        }
      }

      if (transferTo && matchCopy[i] !== undefined) {
        const to = mappedNums[transferTo]
        if (to == null) {
          throw new Error(`Invalid capture transfer to "${to}"`)
        }
        match[to] = matchCopy[i]
        if (hasIndices && indicesCopy) {
          match.indices![to] = indicesCopy[i] as any
        }
        if (match.groups) {
          if (!this.#nameMap) {
            this.#nameMap = createNameMap(this.source)
          }
          const name = this.#nameMap.get(transferTo)
          if (name) {
            match.groups[name] = matchCopy[i]
            if (hasIndices && match.indices?.groups) {
              match.indices.groups[name] = (indicesCopy?.[i] as any) ?? null
            }
          }
        }
      }
    }

    return match
  }
}

function adjustMatchDetailsForOffset(
  match: RegExpExecArray & { indices?: any },
  offset: number,
  input: string,
  hasIndices: boolean
) {
  match.index += offset
  match.input = input
  if (hasIndices && match.indices) {
    const indices = match.indices
    for (let i = 0; i < indices.length; i++) {
      const arr = indices[i]
      if (arr) {
        indices[i] = [arr[0] + offset, arr[1] + offset]
      }
    }
    const groupIndices = indices.groups
    if (groupIndices) {
      Object.keys(groupIndices).forEach((key) => {
        const arr = groupIndices[key]
        if (arr) {
          groupIndices[key] = [arr[0] + offset, arr[1] + offset]
        }
      })
    }
  }
}

function createCaptureMap(
  hiddenCaptures: Array<number>,
  transfers: Array<[number, Array<number>]>
) {
  const captureMap = new Map<number, CaptureMapEntry>()
  for (const num of hiddenCaptures) {
    captureMap.set(num, { hidden: true })
  }
  for (const [to, from] of transfers) {
    for (const num of from) {
      getOrInsert(captureMap, num, {}).transferTo = to
    }
  }
  return captureMap
}

function createNameMap(pattern: string) {
  const re = /(?<capture>\((?:\?<(?![=!])(?<name>[^>]+)>|(?!\?)))|\\?./gsu
  const map = new Map<number, string>()
  let numCharClassesOpen = 0
  let numCaptures = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(pattern))) {
    const {
      0: m,
      groups: { capture, name },
    } = match as any
    if (m === '[') {
      numCharClassesOpen++
    } else if (!numCharClassesOpen) {
      if (capture) {
        numCaptures++
        if (name) {
          map.set(numCaptures, name)
        }
      }
    } else if (m === ']') {
      numCharClassesOpen--
    }
  }
  return map
}

function getOrInsert<K, V>(map: Map<K, V>, key: K, defaultValue: V): V {
  if (!map.has(key)) {
    map.set(key, defaultValue)
  }
  return map.get(key)!
}

export function isEmulatedRegExpLike(
  value: unknown
): value is RegExp & { rawOptions: EmulatedRegExpOptions } {
  return (
    value instanceof RegExp &&
    typeof (value as any).rawOptions === 'object' &&
    (value as any).rawOptions !== null
  )
}
