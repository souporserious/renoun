import type { IRawGrammar } from 'vscode-textmate'
import TextMate from 'vscode-textmate'
import { toRegExp } from 'oniguruma-to-es'
import { parentPort } from 'node:worker_threads'

class JsOnigScanner {
  #regexes: RegExp[]

  constructor(patterns: string[]) {
    this.#regexes = patterns.map((pattern) =>
      toRegExp(pattern, {
        global: true,
        hasIndices: true,
        lazyCompileLength: 3000,
        rules: {
          allowOrphanBackrefs: true,
          asciiWordBoundaries: true,
          captureGroup: true,
          recursionLimit: 5,
          singleline: true,
        },
        target: 'auto',
      })
    )
  }

  findNextMatchSync(
    text: string | { toString(): string },
    startPosition: number
  ): any {
    const stringText = typeof text === 'string' ? text : text.toString()
    if (startPosition < 0) {
      startPosition = 0
    }
    let bestMatch: RegExpExecArray | null = null
    let bestPatternIndex = -1

    for (let index = 0; index < this.#regexes.length; index++) {
      const regex = this.#regexes[index]!
      regex.lastIndex = startPosition
      const match = regex.exec(stringText)
      if (match && (bestMatch === null || match.index < bestMatch.index)) {
        bestMatch = match
        bestPatternIndex = index
        if (match.index === startPosition) break
      }
    }

    if (!bestMatch) {
      return null
    }

    const result: {
      index: number
      captureIndices: { start: number; end: number; length: number }[]
    } = {
      index: bestPatternIndex,
      captureIndices: [],
    }

    if (bestMatch.indices) {
      const indices: Array<[number, number] | undefined> = bestMatch.indices
      result.captureIndices = indices.map((pair) => {
        if (!pair) {
          return { start: -1, end: -1, length: -1 }
        }
        return { start: pair[0], end: pair[1], length: pair[1] - pair[0] }
      })
      return result
    }

    const fullMatchIndex = bestMatch.index
    const fullMatchText = bestMatch[0]!

    result.captureIndices.push({
      start: fullMatchIndex,
      end: fullMatchIndex + fullMatchText.length,
      length: fullMatchText.length,
    })

    let currentIndex = 0

    for (let index = 1; index < bestMatch.length; index++) {
      const groupText = bestMatch[index]
      if (groupText == null) {
        result.captureIndices.push({ start: -1, end: -1, length: -1 })
        continue
      }
      const groupIndex = fullMatchText.indexOf(groupText, currentIndex)
      if (groupIndex >= 0) {
        const start = fullMatchIndex + groupIndex
        const end = start + groupText.length
        result.captureIndices.push({
          start,
          end,
          length: groupText.length,
        })
        currentIndex = groupIndex + groupText.length
      } else {
        result.captureIndices.push({ start: -1, end: -1, length: -1 })
      }
    }

    return result
  }
}

class JsOnigString {
  content: string
  constructor(content: string) {
    this.content = content
  }
  toString(): string {
    return this.content
  }
}

const onigLib = Promise.resolve({
  createOnigScanner: (patterns: string[]) => new JsOnigScanner(patterns),
  createOnigString: (string: string) => new JsOnigString(string),
})

let registry: TextMate.Registry | null = null
let scopeNameToGrammar: Record<string, IRawGrammar> = {}

parentPort!.on('message', async (messageData: any) => {
  try {
    if (messageData?.type === 'init') {
      const requestId = messageData.id
      scopeNameToGrammar = {
        ...scopeNameToGrammar,
        ...(messageData.grammars || {}),
      }
      registry = new TextMate.Registry({
        onigLib,
        loadGrammar: async (scopeName: string) =>
          scopeNameToGrammar[scopeName] || null,
      })
      parentPort!.postMessage({ type: 'initialize:ok', id: requestId })
      return
    }

    if (messageData?.type === 'tokenize') {
      const requestId = messageData.id
      const { scopeName, sourceBuffer, timeLimit, theme } =
        messageData.payload as {
          scopeName: string
          sourceBuffer: ArrayBuffer
          timeLimit?: number
          theme?: any
        }
      if (!registry) throw new Error('Registry not initialized')
      if (theme) {
        ;(registry as TextMate.Registry).setTheme(theme)
      }
      const loadedGrammar = await (registry as TextMate.Registry).loadGrammar(
        scopeName
      )
      if (!loadedGrammar) {
        throw new Error(
          `[renoun] Could not load grammar for scope ${scopeName}`
        )
      }

      const text = new TextDecoder().decode(new Uint8Array(sourceBuffer))
      const lines = text.split(/\r?\n/)

      const colorMap = (registry as TextMate.Registry).getColorMap()
      const tokensPerLine: Array<
        Array<{ start: number; end: number; bits: number }>
      > = []
      let ruleStack: TextMate.StateStack = TextMate.INITIAL

      for (const lineText of lines) {
        const lineResult = loadedGrammar.tokenizeLine2(
          lineText,
          ruleStack,
          timeLimit
        )
        ruleStack = lineResult.ruleStack
        const tokenData = lineResult.tokens
        const lineTokens: Array<{ start: number; end: number; bits: number }> =
          []
        for (let index = 0; index < tokenData.length; index += 2) {
          const start = tokenData[index]!
          const end =
            index + 2 < tokenData.length
              ? tokenData[index + 2]!
              : lineText.length
          lineTokens.push({ start, end, bits: tokenData[index + 1]! })
        }
        tokensPerLine.push(lineTokens)
      }

      parentPort!.postMessage({
        type: 'tokenize:ok',
        id: requestId,
        payload: {
          tokens: tokensPerLine,
          colorMap,
          baseColor: theme?.colors?.foreground || '',
        },
      })
      return
    }
  } catch (error: any) {
    const requestId = messageData?.id
    parentPort!.postMessage({
      type:
        messageData?.type === 'init' ? 'initialize:error' : 'tokenize:error',
      id: requestId,
      error: error?.message || String(error),
    })
  }
})
