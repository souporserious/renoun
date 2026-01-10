import { describe, expect, test } from 'vitest'

import { collectTypeScriptMetadata, getTokens } from './get-tokens.ts'
import type { Token } from './get-tokens.ts'
import type { Highlighter } from './create-highlighter.ts'
import type { TextMateToken } from './create-tokenizer.ts'
import { getTsMorph } from './ts-morph.ts'

const tsMorph = getTsMorph()
const { Project, ts } = tsMorph

function createTextMateToken(value: string): TextMateToken {
  const isWhiteSpace = /^\s+$/.test(value)
  return {
    value,
    start: 0,
    end: value.length,
    style: {
      color: '',
      backgroundColor: '',
      fontStyle: '',
      fontWeight: '',
      textDecoration: '',
    },
    hasTextStyles: false,
    isBaseColor: true,
    isWhiteSpace,
  }
}

function createStubHighlighter(lines: string[][]): Highlighter {
  const tokenLines = lines.map((line) => line.map(createTextMateToken))
  return {
    async tokenize(
      _source: string,
      _language: any,
      _themes: string[]
    ): Promise<typeof tokenLines> {
      return tokenLines
    },
    async *stream(
      _source: string,
      _language: any,
      _themes: string[]
    ): AsyncGenerator<(typeof tokenLines)[number]> {
      for (const line of tokenLines) {
        yield line
      }
    },
  } as Highlighter
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function waitForDuration(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}

describe('getTokens metadata integration', () => {
  test.concurrent('attaches diagnostics and quick info when source has errors', async () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const filePath = 'test.ts'
    const code = 'const value = missing;\nvalue;\n'

    project.createSourceFile(filePath, code, { overwrite: true })

    const highlighter = createStubHighlighter([
      ['const', ' ', 'value', ' ', '=', ' ', 'missing', ';'],
      ['value', ';'],
    ])

    const tokens = await getTokens({
      project,
      value: code,
      language: 'ts',
      filePath,
      highlighter,
      theme: 'default',
      allowErrors: true,
    })
    const secondValueToken = tokens
      .flat()
      .find((token) => token.value === 'value' && token.start > 20)

    expect(secondValueToken?.isSymbol).toBe(true)
    expect(secondValueToken?.quickInfo?.displayText).toContain('value')
    expect(secondValueToken?.quickInfo?.documentationText).toBeDefined()
  })

  test.concurrent('preserves symbol quick info for jsx-only snippets', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve,
      },
    })

    project.createSourceFile(
      'jsx.d.ts',
      'declare namespace JSX { interface IntrinsicElements { div: any } }\n',
      { overwrite: true }
    )

    project.createSourceFile(
      'Component.tsx',
      'export function Component() { return <div>content</div>; }\n',
      { overwrite: true }
    )

    const filePath = 'Example.tsx'
    const code = "import { Component } from './Component';\n<Component />\n"

    project.createSourceFile(filePath, code, { overwrite: true })

    const highlighter = createStubHighlighter([
      [
        'import',
        ' ',
        '{',
        ' ',
        'Component',
        ' ',
        '}',
        ' ',
        'from',
        ' ',
        "'./Component'",
        ';',
      ],
      ['<', 'Component', ' />'],
    ])

    const tokens = await getTokens({
      project,
      value: code,
      language: 'tsx',
      filePath,
      highlighter,
      theme: 'default',
    })

    expect(tokens[0][0]?.value).toBe('<')

    const componentToken = tokens
      .flat()
      .find((token): token is Token => token.value === 'Component')

    expect(componentToken?.isSymbol).toBe(true)
    expect(componentToken?.quickInfo?.displayText).toContain('Component')
  })

  test.concurrent('starts highlighter without waiting for TypeScript metadata to resolve', async () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const filePath = 'parallel.ts'
    const code = 'const value = 1;\n'

    project.createSourceFile(filePath, code, { overwrite: true })

    const metadataGate = createDeferred<void>()
    const metadataStarted = createDeferred<void>()
    let metadataCompleted = false

    const metadataCollector = async (
      ...args: Parameters<typeof collectTypeScriptMetadata>
    ) => {
      metadataStarted.resolve()
      await metadataGate.promise
      const result = await collectTypeScriptMetadata(...args)
      metadataCompleted = true
      return result
    }

    const highlighterStarted = createDeferred<void>()

    const tokenLines = [
      [
        createTextMateToken('const'),
        createTextMateToken(' '),
        createTextMateToken('value'),
        createTextMateToken(' '),
        createTextMateToken('='),
        createTextMateToken(' '),
        createTextMateToken('1'),
        createTextMateToken(';'),
      ],
    ]
    const highlighter = {
      async tokenize(
        _source: string,
        _language: any,
        _themes: string[]
      ): Promise<typeof tokenLines> {
        highlighterStarted.resolve()
        return tokenLines
      },
      async *stream(
        _source: string,
        _language: any,
        _themes: string[]
      ): AsyncGenerator<(typeof tokenLines)[number]> {
        highlighterStarted.resolve()
        for (const line of tokenLines) {
          yield line
        }
      },
    } as Highlighter

    const tokensPromise = getTokens({
      project,
      value: code,
      language: 'ts',
      filePath,
      highlighter,
      theme: 'default',
      metadataCollector,
    })

    await metadataStarted.promise

    try {
      const highlighterResult = await Promise.race([
        highlighterStarted.promise.then(() => 'started'),
        waitForDuration(50).then(() => 'timeout'),
      ])

      expect(highlighterResult).toBe('started')
      expect(metadataCompleted).toBe(false)
    } finally {
      metadataGate.resolve()
    }

    await tokensPromise

    expect(metadataCompleted).toBe(true)
  })

  test.concurrent('does not call metadata collector for non-JavaScript languages', async () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const filePath = 'post.mdx'
    const code = '# Hello World\n\nThis is **bold** text.\n'

    let metadataCollectorCalled = false

    const metadataCollector = async (
      ...args: Parameters<typeof collectTypeScriptMetadata>
    ) => {
      metadataCollectorCalled = true
      return collectTypeScriptMetadata(...args)
    }

    const highlighter = createStubHighlighter([
      ['# Hello World'],
      [],
      ['This is ', '**bold**', ' text.'],
    ])

    const tokens = await getTokens({
      project,
      value: code,
      language: 'mdx',
      filePath,
      highlighter,
      theme: 'default',
      metadataCollector,
    })

    // Verify metadata collector was NOT called for MDX
    expect(metadataCollectorCalled).toBe(false)

    // Verify tokens were still returned correctly
    expect(tokens.length).toBe(3)
    expect(tokens[0][0]?.value).toBe('# Hello World')
  })

  test.concurrent('throws with actionable error when language is js-like but path is mdx', async () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const filePath = 'post.mdx'
    const code = 'export const metadata = { title: \"Hello\" }\n'

    const highlighter = createStubHighlighter([
      ['export', ' ', 'const', ' ', 'metadata', ' ', '=', ' ', '{', ' ', '}'],
    ])

    await expect(
      getTokens({
        project,
        value: code,
        language: 'tsx', // language suggests JS/TS, but path is .mdx
        filePath,
        highlighter,
        theme: 'default',
      })
    ).rejects.toThrow('getTokens received language "tsx" for file "post.mdx"')
  })

  test.concurrent('throws with actionable error when language does not match file extension', async () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const filePath = 'post.mdx'
    const code = 'export const metadata = { title: "Hello" }\n'

    const highlighter = createStubHighlighter([
      ['export', ' ', 'const', ' ', 'metadata', ' ', '=', ' ', '{', ' ', '}'],
    ])

    await expect(
      getTokens({
        project,
        value: code,
        language: 'tsx',
        filePath,
        highlighter,
        theme: 'default',
      })
    ).rejects.toThrow('getTokens received language "tsx" for file "post.mdx"')
  })

  test.concurrent('calls metadata collector for JavaScript-like languages', async () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const filePath = 'test.tsx'
    const code = 'const x = 1;\n'

    project.createSourceFile(filePath, code, { overwrite: true })

    let metadataCollectorCalled = false

    const metadataCollector = async (
      ...args: Parameters<typeof collectTypeScriptMetadata>
    ) => {
      metadataCollectorCalled = true
      return collectTypeScriptMetadata(...args)
    }

    const highlighter = createStubHighlighter([
      ['const', ' ', 'x', ' ', '=', ' ', '1', ';'],
    ])

    await getTokens({
      project,
      value: code,
      language: 'tsx',
      filePath,
      highlighter,
      theme: 'default',
      metadataCollector,
    })

    // Verify metadata collector WAS called for TSX
    expect(metadataCollectorCalled).toBe(true)
  })
})
