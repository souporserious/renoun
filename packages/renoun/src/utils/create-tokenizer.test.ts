import { describe, expect, test } from 'vitest'

import {
  Tokenizer,
  type RegistryOptions,
  type TextMateThemeRaw,
  type TextMateGrammarRaw,
} from './create-tokenizer.ts'
import { ScopeStack, Theme, parseTheme } from './textmate.ts'

import cssGrammar from '../grammars/css.ts'
import shellGrammar from '../grammars/shellscript.ts'
import mdxGrammar from '../grammars/mdx.ts'
import tsxGrammar from '../grammars/tsx.ts'
import textmateTheme from '../theme.ts'

type ThemeName = 'light' | 'dark'

// Test fixtures mimicking real VS Code themes with array scopes
const themeFixtures: Record<ThemeName, TextMateThemeRaw> = {
  light: {
    name: 'Light',
    type: 'light',
    colors: {
      foreground: '#111111',
    },
    settings: [
      {
        // Global settings (no scope) for default colors
        settings: {
          foreground: '#111111',
          background: '#ffffff',
        },
      },
      {
        scope: ['comment', 'comment.line', 'comment.block'],
        settings: {
          foreground: '#ff0000',
        },
      },
      {
        // Array of specific keyword scopes like real themes
        scope: [
          'keyword',
          'keyword.control',
          'keyword.control.import',
          'keyword.control.import.ts',
          'keyword.control.import.tsx',
        ],
        settings: {
          foreground: '#a492ea',
          fontStyle: 'italic',
        },
      },
      {
        scope: ['string', 'string.quoted', 'string.quoted.single'],
        settings: {
          foreground: '#00aa00',
        },
      },
      {
        // Shell command names (e.g., npm, echo, ls)
        scope: [
          'entity.name.command',
          'entity.name.function.call',
          'support.function.builtin',
        ],
        settings: {
          foreground: '#0077cc',
          fontStyle: 'italic',
        },
      },
      {
        // Variable declarations and identifiers
        scope: ['variable.other', 'variable.parameter'],
        settings: {
          foreground: '#4a4a4a',
        },
      },
      {
        // Storage types (const, let, function, etc.)
        scope: ['storage.type', 'storage.modifier'],
        settings: {
          foreground: '#a492ea',
          fontStyle: 'italic',
        },
      },
    ],
  },
  dark: {
    name: 'Dark',
    type: 'dark',
    colors: {
      foreground: '#eeeeee',
    },
    settings: [
      {
        settings: {
          foreground: '#eeeeee',
          background: '#000000',
        },
      },
      {
        scope: ['comment'],
        settings: {
          foreground: '#00ff00',
        },
      },
      {
        scope: ['keyword', 'keyword.control'],
        settings: {
          foreground: '#ff00ff',
        },
      },
      {
        scope: ['string'],
        settings: {
          foreground: '#ffaa00',
        },
      },
    ],
  },
}

const registryOptions: RegistryOptions<ThemeName> = {
  async getGrammar(scopeName) {
    if (scopeName === 'source.css') {
      return cssGrammar as TextMateGrammarRaw
    }
    if (scopeName === 'source.shell') {
      return shellGrammar as TextMateGrammarRaw
    }
    if (scopeName === 'source.mdx') {
      return mdxGrammar as TextMateGrammarRaw
    }
    if (scopeName === 'source.tsx') {
      return tsxGrammar as TextMateGrammarRaw
    }

    throw new Error(`Missing grammar for scope: ${scopeName}`)
  },
  async getTheme(theme) {
    const themeDefinition = themeFixtures[theme]
    if (!themeDefinition) {
      throw new Error(`Missing theme: ${theme}`)
    }

    return themeDefinition
  },
}

describe('Tokenizer', () => {
  test('highlights TSX and shellscript (keywords/comments/strings) with theme rules', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    const normalize = (c: string | undefined) => (c || '').toUpperCase()

    const findToken = (
      lines: Awaited<ReturnType<Tokenizer<ThemeName>['tokenize']>>,
      predicate: (token: (typeof lines)[number][number]) => boolean
    ) => {
      for (const line of lines)
        for (const token of line) if (predicate(token)) return token
      return undefined
    }

    // TSX: keyword + comment
    const tsx = `export const x = "hi"
// comment`
    const tsxTokens = await tokenizer.tokenize(tsx, 'tsx', ['light'])

    const tsxKeyword = findToken(
      tsxTokens,
      (token) =>
        /export|const/.test(token.value) &&
        normalize(token.style.color) === '#A492EA' &&
        token.style.fontStyle === 'italic'
    )
    expect(tsxKeyword).toBeTruthy()

    const tsxComment = findToken(
      tsxTokens,
      (token) =>
        /comment/.test(token.value) &&
        normalize(token.style.color) === '#FF0000'
    )
    expect(tsxComment).toBeTruthy()

    // shell: comment + string
    const shell = `# comment
echo "Hello World"`
    const shellTokens = await tokenizer.tokenize(shell, 'shell', ['light'])

    const shComment = findToken(
      shellTokens,
      (token) =>
        /comment/.test(token.value) &&
        normalize(token.style.color) === '#FF0000'
    )
    expect(shComment).toBeTruthy()

    const shString = findToken(
      shellTokens,
      (token) =>
        /Hello/.test(token.value) && normalize(token.style.color) === '#00AA00'
    )
    expect(shString).toBeTruthy()
  })

  test('TSX line comment (including punctuation) inherits comment color', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const normalize = (c: string | undefined) => (c || '').toUpperCase()

    const source = `export const x = 1
// comment text`
    const tokens = await tokenizer.tokenize(source, 'tsx', ['light'])

    // Second line should be a single comment scope; every token should carry the comment color.
    const commentLine = tokens[1]
    expect(commentLine.length).toBeGreaterThan(0)
    for (const token of commentLine) {
      expect(normalize(token.style.color)).toBe('#FF0000')
    }
  })

  test('child combinator in parentScopes matches only the immediate parent (upstream parity)', () => {
    const rawTheme: TextMateThemeRaw = {
      name: 'child-combinator-test',
      settings: [
        { settings: { foreground: '#000000', background: '#ffffff' } },
        { scope: 'child', settings: { foreground: '#111111' } },
        { scope: 'parent > child', settings: { foreground: '#FF0000' } },
        { scope: 'grand > child', settings: { foreground: '#00FF00' } },
      ],
    }

    const theme = Theme.createFromParsedTheme(parseTheme(rawTheme), null)
    const colorMap = theme.getColorMap()

    const stackImmediate = ScopeStack.from('parent', 'child')!
    const matchImmediate = theme.match(stackImmediate)!
    expect(colorMap[matchImmediate.foregroundId].toUpperCase()).toBe('#FF0000')

    // Ancestor chain with parent->child still prefers the immediate-parent rule.
    const stackAncestor = ScopeStack.from('grand', 'parent', 'child')!
    const matchAncestor = theme.match(stackAncestor)!
    expect(colorMap[matchAncestor.foregroundId].toUpperCase()).toBe('#FF0000')

    // Only grand->child should match the grand>child rule.
    const stackGrandOnly = ScopeStack.from('grand', 'child')!
    const matchGrandOnly = theme.match(stackGrandOnly)!
    expect(colorMap[matchGrandOnly.foregroundId].toUpperCase()).toBe('#00FF00')
  })

  test('incremental tokenization matches full tokenization after an edit', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    const original = `const a = 1;
// comment`
    const updated = `const a = 2;
// comment`

    const baseline = await tokenizer.tokenizeIncremental(
      original,
      'tsx',
      ['light'],
      { changedStartLine: 0 }
    )

    const incremental = await tokenizer.tokenizeIncremental(
      updated,
      'tsx',
      ['light'],
      {
        previousLines: original.split(/\r?\n/),
        previousTokens: baseline.tokens,
        previousLineStates: baseline.lineStates,
        changedStartLine: 0,
      }
    )

    const full = await tokenizer.tokenize(updated, 'tsx', ['light'])
    expect(incremental.tokens).toEqual(full)
  })

  test('tokenizes shell code across multiple Tokenizer instances without rule ID conflicts', async () => {
    // This test reproduces a bug where rule IDs from one Grammar instance
    // leak into another when the same frozen grammar object is reused.
    // The error manifests as "Unknown ruleId XXXX" during tokenization.
    const source = 'npm install renoun'

    // Create multiple independent tokenizers (simulating separate sessions)
    const tokenizer1 = new Tokenizer<ThemeName>(registryOptions)
    const tokenizer2 = new Tokenizer<ThemeName>(registryOptions)
    const tokenizer3 = new Tokenizer<ThemeName>(registryOptions)

    // Tokenize with each tokenizer - this should not throw "Unknown ruleId"
    const tokens1 = await tokenizer1.tokenize(source, 'shell', ['light'])
    const tokens2 = await tokenizer2.tokenize(source, 'shell', ['dark'])
    const tokens3 = await tokenizer3.tokenize(source, 'shell', [
      'light',
      'dark',
    ])

    // Basic sanity checks
    expect(tokens1.length).toBeGreaterThan(0)
    expect(tokens2.length).toBeGreaterThan(0)
    expect(tokens3.length).toBeGreaterThan(0)

    // All tokenizers should produce the same combined text
    // Note: Token boundaries may differ between themes due to scope resolution,
    // but the combined text should be identical
    const text1 = tokens1
      .flatMap((line) => line.map((token) => token.value))
      .join('')
    const text2 = tokens2
      .flatMap((line) => line.map((token) => token.value))
      .join('')
    const text3 = tokens3
      .flatMap((line) => line.map((token) => token.value))
      .join('')

    expect(text1).toBe(source)
    expect(text2).toBe(source)
    expect(text3).toBe(source)
  })

  test('tokenizes shell code with concurrent requests using same tokenizer', async () => {
    // Simulate the server scenario where a single tokenizer handles many concurrent requests
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    // Various shell code snippets
    const snippets = [
      'npm install renoun',
      'echo "Hello World"',
      'ls -la',
      'cd /home/user && pwd',
      'export PATH=$PATH:/usr/local/bin',
      'for i in 1 2 3; do echo $i; done',
      'if [ -f file.txt ]; then cat file.txt; fi',
      'grep -r "pattern" .',
      'npm install renoun', // duplicate to test memoization
    ]

    // Run all tokenizations concurrently
    const results = await Promise.all(
      snippets.map((source) =>
        tokenizer.tokenize(source, 'shell', ['light', 'dark'])
      )
    )

    // All should succeed
    for (const tokens of results) {
      expect(tokens.length).toBeGreaterThan(0)
      expect(tokens[0].length).toBeGreaterThan(0)
    }
  })

  test('tokenizes shell after loading MDX which embeds shell', async () => {
    // Skip this test for now - MDX has too many dependencies
    // TODO: Add proper test when we have a mock grammar loader
  })

  test('tokenizes TSX inside MDX fenced code blocks', async () => {
    // MDX grammar depends on auxiliary grammars (frontmatter, etc). For this test,
    // we only care about the TSX fence, so stub any unknown grammars as empty.
    const requestedScopes: string[] = []
    const mdxRegistryOptions: RegistryOptions<ThemeName> = {
      async getGrammar(scopeName) {
        requestedScopes.push(scopeName)
        try {
          return await registryOptions.getGrammar(scopeName)
        } catch {
          return {
            scopeName,
            patterns: [],
            repository: {},
          } as TextMateGrammarRaw
        }
      },
      getTheme: registryOptions.getTheme,
    }

    const tokenizer = new Tokenizer<ThemeName>(mdxRegistryOptions)
    const normalize = (c: string | undefined) => (c || '').toUpperCase()

    const mdx = [
      '# Title',
      '',
      '```tsx',
      "import React from 'react'",
      'export const x = 1',
      '```',
      '',
    ].join('\n')

    const tokens = await tokenizer.tokenize(mdx, 'mdx', ['light'])
    const flatTokens = tokens.flatMap((line) => line)

    expect(requestedScopes).toContain('source.mdx')
    expect(requestedScopes).toContain('source.tsx')

    const importToken = flatTokens.find((token) =>
      token.value.includes('import')
    )
    expect(importToken).toBeDefined()
    expect(normalize(importToken!.style.color)).toBe('#A492EA')
    expect(importToken!.style.fontStyle).toBe('italic')
  })

  test('tokenizes shell code interleaved with other languages', async () => {
    // Simulate real usage where multiple languages are tokenized
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    // Interleave shell with other languages
    const requests = [
      { source: '.button { color: red; }', lang: 'css' as const },
      { source: 'npm install renoun', lang: 'shell' as const },
      { source: 'const x = 1;', lang: 'tsx' as const },
      { source: 'echo "hello"', lang: 'shell' as const },
      { source: 'body { margin: 0; }', lang: 'css' as const },
      { source: 'ls -la', lang: 'shell' as const },
    ]

    // Run all in parallel to stress test concurrent grammar loading
    const results = await Promise.all(
      requests.map((req) =>
        tokenizer.tokenize(req.source, req.lang, ['light', 'dark'])
      )
    )

    for (const tokens of results) {
      expect(tokens.length).toBeGreaterThan(0)
    }

    // Now tokenize shell again after all grammars are loaded
    const shellTokens = await tokenizer.tokenize(
      'npm install renoun',
      'shell',
      ['light', 'dark']
    )
    expect(
      shellTokens.flatMap((line) => line.map((token) => token.value)).join('')
    ).toBe('npm install renoun')
  })

  test('tokenizes multiple themes without altering merged output', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = '/* comment line 1\ncomment line 2 */'

    const multiThemeTokens = await tokenizer.tokenize(source, 'css', [
      'light',
      'dark',
    ])
    const lightOnlyTokens = await tokenizer.tokenize(source, 'css', ['light'])
    const darkOnlyTokens = await tokenizer.tokenize(source, 'css', ['dark'])

    const tokenValues = (lines: typeof multiThemeTokens) =>
      lines.map((line) => line.map((token) => token.value))

    expect(tokenValues(multiThemeTokens)).toEqual(tokenValues(lightOnlyTokens))
    expect(tokenValues(multiThemeTokens)).toEqual(tokenValues(darkOnlyTokens))

    const firstLineComment = multiThemeTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const secondLineComment = multiThemeTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )

    const firstLineLight = lightOnlyTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const firstLineDark = darkOnlyTokens[0].find((token) =>
      token.value.includes('comment line 1')
    )
    const secondLineLight = lightOnlyTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )
    const secondLineDark = darkOnlyTokens[1].find((token) =>
      token.value.includes('comment line 2')
    )

    expect(firstLineComment?.style['--0fg']).toBe(firstLineLight?.style.color)
    expect(firstLineComment?.style['--1fg']).toBe(firstLineDark?.style.color)
    expect(secondLineComment?.style['--0fg']).toBe(secondLineLight?.style.color)
    expect(secondLineComment?.style['--1fg']).toBe(secondLineDark?.style.color)

    expect(firstLineComment?.style.color).toBeUndefined()
    expect(secondLineComment?.style.color).toBeUndefined()
  })

  test('multi-theme output sets per-theme css vars independent of token iteration order', async () => {
    // Theme A: tags are base color
    // Theme B: tags are non-base color
    const themes: Record<'a' | 'b', TextMateThemeRaw> = {
      a: {
        name: 'A',
        type: 'dark',
        colors: { foreground: '#111111' },
        settings: [
          { settings: { foreground: '#111111', background: '#000000' } },
          { scope: ['entity.name.tag'], settings: { foreground: '#111111' } },
        ],
      },
      b: {
        name: 'B',
        type: 'dark',
        colors: { foreground: '#222222' },
        settings: [
          { settings: { foreground: '#222222', background: '#000000' } },
          { scope: ['entity.name.tag'], settings: { foreground: '#FF00FF' } },
        ],
      },
    }

    const registryOptions: RegistryOptions<'a' | 'b'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme(theme) {
        return themes[theme]
      },
    }

    const tokenizer = new Tokenizer<'a' | 'b'>(registryOptions)
    const tsx = `export default function X() { return <div /> }`
    const tokens = await tokenizer.tokenize(tsx, 'tsx', ['a', 'b'])
    const flatTokens = tokens.flatMap((line) => line)

    const divToken = flatTokens.find((token) => token.value === 'div')
    expect(divToken).toBeDefined()
    // In multi-theme mode we should emit CSS vars (not inline color).
    expect(divToken!.style.color).toBeUndefined()
    // Theme A: base -> no fg var
    expect((divToken!.style as any)['--0fg']).toBeUndefined()
    // Theme B: non-base -> fg var set
    expect((divToken!.style as any)['--1fg']).toBe('#FF00FF')
  })

  test('tokenizes TypeScript with keyword and string scopes', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = `import { Directory } from 'renoun'`

    const tokens = await tokenizer.tokenize(source, 'tsx', ['light'])
    const flatTokens = tokens.flatMap((line) => line)

    // Find the 'import' keyword token
    const importToken = flatTokens.find((token) => token.value === 'import')
    expect(importToken).toBeDefined()
    // The more specific keyword.control.import scope should win
    expect(importToken?.style.color).toBe('#A492EA')
    expect(importToken?.style.fontStyle).toBe('italic')

    // Find the string token
    const stringToken = flatTokens.find((token) =>
      token.value.includes('renoun')
    )
    expect(stringToken).toBeDefined()
    // Strings should have a color
    expect(stringToken?.style.color).toBe('#00AA00')
  })

  test('tokenizes full TSX code block without stopping mid-file', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = `import { Directory } from 'renoun'

const posts = new Directory({
  path: 'posts',
  filter: '*.mdx',
})

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const slug = (await params).slug
  const post = await posts.getFile(slug, 'mdx')
  const Content = await post.getExportValue('default')

  return <Content />
}`

    const tokens = await tokenizer.tokenize(source, 'tsx', ['light'])

    // Collect all text by joining lines with newlines
    const allText = tokens
      .map((line) => line.map((token) => token.value).join(''))
      .join('\n')

    // Verify we got all the text
    expect(allText).toBe(source)

    // Find the 'const slug' line by content (the one with await params)
    const slugLine = tokens.find((line) => {
      const text = line.map((token) => token.value).join('')
      return text.includes('const slug') && text.includes('await params')
    })
    expect(slugLine).toBeDefined()
    const slugText = slugLine!.map((token) => token.value).join('')
    expect(slugText).toBe('  const slug = (await params).slug')

    // Verify 'const' on slug line has keyword styling (may be combined with leading space)
    const constToken = slugLine!.find(
      (token) => token.value === 'const' || token.value.includes('const')
    )
    expect(constToken).toBeDefined()
    // The token value should contain 'const'
    expect(constToken?.value).toContain('const')
    expect(constToken?.style.color?.toUpperCase()).toBe('#A492EA')

    // Verify 'await' on slug line has keyword styling
    const awaitToken = slugLine!.find(
      (token) => token.value === 'await' || token.value.includes('await')
    )
    expect(awaitToken).toBeDefined()
    expect(awaitToken?.value).toContain('await')
    expect(awaitToken?.style.color?.toUpperCase()).toBe('#A492EA')

    // Find the 'return <Content />' line by content
    const returnLine = tokens.find((line) => {
      const text = line.map((token) => token.value).join('')
      return text.includes('return')
    })
    expect(returnLine).toBeDefined()
    const returnText = returnLine!.map((token) => token.value).join('')
    expect(returnText).toBe('  return <Content />')

    const returnToken = returnLine!.find((token) => token.value === 'return')
    expect(returnToken).toBeDefined()
    expect(returnToken?.style.color?.toUpperCase()).toBe('#A492EA')
  })

  test('tokenizes shell npm command with correct scope styling', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = 'npm install renoun'

    const tokens = await tokenizer.tokenize(source, 'shell', ['light'])
    const flatTokens = tokens.flatMap((line) => line)

    // Verify we got all the text
    const allText = flatTokens.map((token) => token.value).join('')
    expect(allText).toBe(source)

    // Find the 'npm' token - it should be styled as a command
    const npmToken = flatTokens.find((token) => token.value === 'npm')
    expect(npmToken).toBeDefined()
    // npm should be blue (#0077cc) and italic per our theme
    expect(npmToken?.style.color?.toUpperCase()).toBe('#0077CC')
    expect(npmToken?.style.fontStyle).toBe('italic')
  })

  test('streams tokenized lines without changing output', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = '/* comment line 1*/\n/* comment line 2 */'

    const streamed: string[][] = []
    for await (const line of tokenizer.stream(source, 'css', ['light'])) {
      streamed.push(line.map((token) => token.value))
    }

    const tokens = await tokenizer.tokenize(source, 'css', ['light'])
    const nonStreamed = tokens.map((line) => line.map((token) => token.value))

    expect(streamed).toEqual(nonStreamed)
  })

  test('retrieves grammar state and reuses it across tokenization runs', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const firstChunk = '/* comment line 1'
    const secondChunk = 'comment line 2 */'

    const firstTokens = await tokenizer.tokenize(firstChunk, 'css', ['light'])
    const grammarState = tokenizer.getGrammarState()

    expect(grammarState).toBeDefined()

    const secondTokens = await tokenizer.tokenize(
      secondChunk,
      'css',
      ['light'],
      { grammarState }
    )

    const incremental = [...firstTokens, ...secondTokens].map((line) =>
      line.map((token) => token.value)
    )

    const fullTokens = await tokenizer.tokenize(
      `${firstChunk}\n${secondChunk}`,
      'css',
      ['light']
    )
    const complete = fullTokens.map((line) => line.map((token) => token.value))

    expect(incremental).toEqual(complete)
  })

  test('handles grammarState mismatch gracefully', async () => {
    // This test verifies that using grammarState from one language with
    // another language throws a clear error rather than crashing mysteriously.
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)

    // Tokenize CSS to build up some grammar state
    const cssSource = `
      .container {
        display: flex;
        /* nested comment
      }
    `
    await tokenizer.tokenize(cssSource, 'css', ['light', 'dark'])
    const cssGrammarState = tokenizer.getGrammarState()

    // Now try to use CSS grammar state with shell tokenization
    // This should not crash with "Unknown ruleId" but either work or throw a clear error
    try {
      const shellSource = 'npm install renoun'
      await tokenizer.tokenize(shellSource, 'shell', ['light', 'dark'], {
        grammarState: cssGrammarState,
      })
      // If we get here, the tokenizer handled the mismatch gracefully
    } catch (error) {
      // The error should be informative, not a cryptic "Unknown ruleId"
      expect((error as Error).message).not.toMatch(/^Unknown ruleId \d+$/)
    }
  })

  test('handles grammarState with high ruleIds from different grammar', async () => {
    // Simulate the "Unknown ruleId 3252" scenario by using grammarState from
    // a complex grammar (tsx) with a simpler grammar (shell)
    const tokenizer1 = new Tokenizer<ThemeName>(registryOptions)
    const tokenizer2 = new Tokenizer<ThemeName>(registryOptions)

    // Tokenize complex TSX to build up high rule IDs
    const tsxSource = `
      import React, { useState, useEffect, useCallback, useMemo } from 'react';
      
      interface Props<token extends Record<string, unknown>> {
        data: token[];
        onSelect?: (item: token) => void;
        renderItem: (item: token, index: number) => React.ReactNode;
      }
      
      function MyComponent<token extends Record<string, unknown>>({ 
        data, 
        onSelect, 
        renderItem 
      }: Props<token>) {
        const [selected, setSelected] = useState<token | null>(null);
        
        useEffect(() => {
          console.log('Selected:', selected);
        }, [selected]);
        
        const handleClick = useCallback((item: token) => {
          setSelected(item);
          onSelect?.(item);
        }, [onSelect]);
        
        return (
          <div className="container">
            {data.map((item, index) => (
              <div key={index} onClick={() => handleClick(item)}>
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        );
      }
      
      export default MyComponent;
    `
    await tokenizer1.tokenize(tsxSource, 'tsx', ['light', 'dark'])
    const tsxGrammarState = tokenizer1.getGrammarState()

    // Log the grammar state to understand its structure
    // console.log('TSX grammar state:', JSON.stringify(tsxGrammarState, (key, value) => {
    //   if (key === 'parent') return value ? '[parent]' : null
    //   return value
    // }, 2))

    // Now use the TSX grammar state (with potentially high rule IDs) with shell
    // on a completely different tokenizer
    try {
      const shellSource = 'npm install renoun'
      await tokenizer2.tokenize(shellSource, 'shell', ['light', 'dark'], {
        grammarState: tsxGrammarState,
      })
      // If we get here, the tokenizer handled the mismatch gracefully
    } catch (error) {
      // The error should be informative if it throws
      const msg = (error as Error).message
      // Either it contains our enhanced error message or it's some other known error
      expect(
        msg.includes('StateStack from a different grammar') ||
          msg.includes('Grammar could not be loaded') ||
          !msg.match(/^Unknown ruleId \d+$/)
      ).toBe(true)
    }
  })

  test('textmate theme: const inside function should be styled', async () => {
    // Use an actual textmate theme to verify highlighting
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        if (scopeName === 'source.shell') return shellGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        // Cast to TextMateThemeRaw - the textmate theme has tokenColors
        const theme = textmateTheme as unknown as TextMateThemeRaw
        // Normalize: use tokenColors as settings
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)

    const tsx = `const a = 1
export default function Page() {
  const b = 2
}`
    const tokens = await tokenizer.tokenize(tsx, 'tsx', ['dark'])

    // Find both const tokens
    const constTokens: Array<{
      line: number
      color?: string
      isBaseColor: boolean
    }> = []
    for (let i = 0; i < tokens.length; i++) {
      for (const token of tokens[i]) {
        if (token.value === 'const') {
          constTokens.push({
            line: i,
            color: token.style.color,
            isBaseColor: token.isBaseColor,
          })
        }
      }
    }

    // Both should have the purple color, not be base color
    expect(constTokens.length).toBe(2)
    expect(constTokens[0].isBaseColor).toBe(false)
    expect(constTokens[1].isBaseColor).toBe(false)
    // Both should have the same color
    expect(constTokens[0].color?.toUpperCase()).toBe('#A492EA')
    expect(constTokens[1].color?.toUpperCase()).toBe('#A492EA')
  })

  test('textmate theme: npm should be styled in shell', async () => {
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.shell') return shellGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        const theme = textmateTheme as unknown as TextMateThemeRaw
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)
    const shell = 'npm install renoun'
    const tokens = await tokenizer.tokenize(shell, 'shell', ['dark'])

    // npm should be styled as a command (inheriting from entity.name.function)
    const npmToken = tokens[0].find((token) => token.value === 'npm')
    expect(npmToken).toBeDefined()
    // npm should have blue color (#82AAFF) from entity.name.function and be italic
    expect(npmToken!.isBaseColor).toBe(false)
    expect(npmToken!.style.color?.toUpperCase()).toBe('#82AAFF')
    expect(npmToken!.style.fontStyle).toBe('italic')
  })

  test('textmate theme: JSX tags and JSX comments should be styled in TSX', async () => {
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        const theme = textmateTheme as unknown as TextMateThemeRaw
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)

    const tsx = `export default function RootLayout() {
  return (
    <RootProvider>
      {/* JSX comment */}
      <html>
        <body>{children}</body>
      </html>
    </RootProvider>
  )
}`

    const tokens = await tokenizer.tokenize(tsx, 'tsx', ['dark'])
    const flatTokens = tokens.flatMap((line) => line)

    // Component tag names should be styled (entity.name.tag.custom -> #F78C6C in the bundled theme).
    const rootProviderToken = flatTokens.find(
      (token) => token.value === 'RootProvider'
    )
    expect(rootProviderToken).toBeDefined()
    expect(rootProviderToken!.isBaseColor).toBe(false)
    expect(rootProviderToken!.style.color?.toUpperCase()).toBe('#F78C6C')

    // Native HTML tag names should be styled (entity.name.tag -> #CAECE6 in the bundled theme).
    const htmlTagToken = flatTokens.find((token) => token.value === 'html')
    expect(htmlTagToken).toBeDefined()
    expect(htmlTagToken!.isBaseColor).toBe(false)
    expect(htmlTagToken!.style.color?.toUpperCase()).toBe('#CAECE6')

    // JSX comments should be styled like comments (italic + #637777 in the bundled theme).
    const jsxCommentToken = flatTokens.find((token) =>
      token.value.includes('JSX comment')
    )
    expect(jsxCommentToken).toBeDefined()
    expect(jsxCommentToken!.isBaseColor).toBe(false)
    expect(jsxCommentToken!.style.color?.toUpperCase()).toBe('#637777')
    expect(jsxCommentToken!.style.fontStyle).toBe('italic')
  })

  test('textmate theme: JSX single-line tags with attributes are styled', async () => {
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        const theme = textmateTheme as unknown as TextMateThemeRaw
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)

    // Single-line JSX with attributes works correctly
    const tsx = `<div css={1}></div>`
    const tokens = await tokenizer.tokenize(tsx, 'tsx', ['dark'])
    const flatTokens = tokens.flatMap((line) => line)

    // div tag should be styled (entity.name.tag.tsx -> #CAECE6)
    const divToken = flatTokens.find((token) => token.value === 'div')
    expect(divToken).toBeDefined()
    expect(divToken!.isBaseColor).toBe(false)
    expect(divToken!.style.color?.toUpperCase()).toBe('#CAECE6')

    // css attribute should be styled (entity.other.attribute-name -> #C5E478 + italic)
    const cssAttributeToken = flatTokens.find((token) => token.value === 'css')
    expect(cssAttributeToken).toBeDefined()
    expect(cssAttributeToken!.isBaseColor).toBe(false)
    expect(cssAttributeToken!.style.color?.toUpperCase()).toBe('#C5E478')
    expect(cssAttributeToken!.style.fontStyle).toBe('italic')
  })

  // Test that multi-line JSX with > on a different line is correctly tokenized.
  // This requires the tokenizer to append \n to each line.
  test('textmate theme: multi-line JSX with > on different line', async () => {
    const textmateRegistryOptions: RegistryOptions<'dark'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName === 'source.tsx') return tsxGrammar
        throw new Error(`Missing grammar for scope: ${scopeName}`)
      },
      async getTheme() {
        const theme = textmateTheme as unknown as TextMateThemeRaw
        return {
          ...theme,
          settings: theme.tokenColors || theme.settings || [],
        }
      },
    }

    const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)

    // Multi-line JSX where > is on a different line
    const tsx = `<div
  css={1}
></div>`
    const tokens = await tokenizer.tokenize(tsx, 'tsx', ['dark'])
    const flatTokens = tokens.flatMap((line) => line)

    // div tag should be styled correctly
    const divTokens = flatTokens.filter((token) => token.value === 'div')
    expect(divTokens.length).toBe(2) // Opening and closing
    expect(divTokens[0]!.isBaseColor).toBe(false)
    expect(divTokens[0]!.style.color?.toUpperCase()).toBe('#CAECE6')

    // css attribute should be styled
    const cssToken = flatTokens.find((token) => token.value === 'css')
    expect(cssToken).toBeDefined()
    expect(cssToken!.isBaseColor).toBe(false)
    expect(cssToken!.style.color?.toUpperCase()).toBe('#C5E478')
    expect(cssToken!.style.fontStyle).toBe('italic')
  })

  test('missing end should close immediately (not match \\uFFFF sentinel)', async () => {
    const registryOptions: RegistryOptions<'light'> = {
      async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
        if (scopeName !== 'source.shell') {
          throw new Error(`Missing grammar for scope: ${scopeName}`)
        }

        return {
          scopeName: 'source.shell',
          patterns: [
            {
              begin: 'a',
              // Intentionally omit `end` to validate missing-end behavior.
              name: 'meta.block.test',
              contentName: 'meta.content.test',
              patterns: [],
            },
          ],
          repository: {},
        }
      },
      async getTheme() {
        return {
          name: 'Light',
          type: 'light',
          colors: { foreground: '#111111' },
          settings: [
            { settings: { foreground: '#111111', background: '#ffffff' } },
            {
              scope: ['meta.content.test'],
              settings: { foreground: '#ff0000' },
            },
          ],
        }
      },
    }

    const tokenizer = new Tokenizer<'light'>(registryOptions)
    const tokens = await tokenizer.tokenize('aXYZ', 'shell', ['light'])
    // console.log(tokens[0].map((token) => ({ v: token.value, c: token.style.color, base: token.isBaseColor })))

    const xyz = tokens[0].find((token) => token.value.includes('XYZ'))
    expect(xyz).toBeDefined()
    // If missing `end` accidentally becomes '\\uFFFF' and the engine appends a sentinel,
    // the content would extend to EOL and \"XYZ\" would become red. We expect default.
    const anyRed = tokens[0].some(
      (token) => token.style.color?.toUpperCase() === '#FF0000'
    )
    expect(anyRed).toBe(false)
  })
})

test('streamRaw emits Uint32Array per line', async () => {
  const tokenizer = new Tokenizer<ThemeName>(registryOptions)
  const source = `// hello
const x = 1`
  const chunks: Uint32Array[] = []
  for await (const chunk of tokenizer.streamRaw(source, 'tsx', ['dark'])) {
    chunks.push(chunk)
  }

  expect(chunks.length).toBe(2)
  expect(chunks[0]).toBeInstanceOf(Uint32Array)
  expect(tokenizer.getGrammarState().length).toBe(1)
})

test('streamRaw + decodeBinaryChunk preserves comment punctuation color', async () => {
  const tokenizer = new Tokenizer<ThemeName>(registryOptions)
  const source = `export const x = 1
// comment text`

  // Mimic server init order: capture color map/base color before streamRaw runs.
  await tokenizer.ensureTheme('light')
  const colorMap = tokenizer.getColorMap('light')
  const baseColor = tokenizer.getBaseColor('light')

  const batch: number[] = []
  for await (const lineTokens of tokenizer.streamRaw(source, 'tsx', [
    'light',
  ])) {
    batch.push(lineTokens.length, ...lineTokens)
  }

  const decodeBinaryChunk = (
    chunk: Uint32Array,
    lines: string[],
    startLine: number,
    colorMap: string[],
    baseColor?: string
  ) => {
    let position = 0
    let lineIndex = startLine
    const decoded: Array<
      Array<{
        value: string
        start: number
        end: number
        hasTextStyles: boolean
        isBaseColor: boolean
        isWhiteSpace: boolean
        style: {
          color?: string
          fontStyle?: string
          fontWeight?: string
          textDecoration?: string
        }
      }>
    > = []

    while (position < chunk.length) {
      const count = chunk[position++] ?? 0
      const endPosition = position + count
      const lineTokenData = chunk.slice(position, endPosition)
      position = endPosition

      const lineText = lines[lineIndex] ?? ''
      const lineTokens: (typeof decoded)[number] = []

      for (let index = 0; index < lineTokenData.length; index += 2) {
        const start = lineTokenData[index]
        const metadata = lineTokenData[index + 1]
        const end =
          index + 2 < lineTokenData.length
            ? lineTokenData[index + 2]
            : lineText.length

        const colorBits = (metadata & 0b00000000111111111000000000000000) >>> 15
        const color = colorMap[colorBits] || ''
        const fontFlags = (metadata >>> 11) & 0b1111

        const fontStyle = fontFlags & 1 ? 'italic' : ''
        const fontWeight = fontFlags & 2 ? 'bold' : ''
        let textDecoration = ''
        if (fontFlags & 4) textDecoration = 'underline'
        if (fontFlags & 8) {
          textDecoration = textDecoration
            ? `${textDecoration} line-through`
            : 'line-through'
        }

        const isBaseColor =
          !color ||
          (baseColor
            ? color.toLowerCase?.() === baseColor.toLowerCase?.()
            : false)

        const style: {
          color?: string
          fontStyle?: string
          fontWeight?: string
          textDecoration?: string
        } = {}
        if (color && !isBaseColor) style.color = color
        if (fontStyle) style.fontStyle = fontStyle
        if (fontWeight) style.fontWeight = fontWeight
        if (textDecoration) style.textDecoration = textDecoration

        lineTokens.push({
          value: lineText.slice(start, end),
          start,
          end,
          hasTextStyles: !!fontFlags,
          isBaseColor,
          isWhiteSpace: /^\s*$/.test(lineText.slice(start, end)),
          style,
        })
      }

      decoded.push(lineTokens)
      lineIndex++
    }

    return { tokens: decoded, nextLine: lineIndex }
  }

  const lines = source.split(/\r?\n/)
  const { tokens } = decodeBinaryChunk(
    new Uint32Array(batch),
    lines,
    0,
    colorMap,
    baseColor
  )

  const flat = tokens.flatMap((line) => line)
  const slashToken = flat.find((token) => token.value.trim().startsWith('//'))
  expect(slashToken).toBeDefined()
  expect(slashToken!.style.color?.toUpperCase()).toBe('#FF0000')
})

test('punctuation in line comments uses comment color', async () => {
  const textmateRegistryOptions: RegistryOptions<'dark'> = {
    async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
      if (scopeName === 'source.tsx') return tsxGrammar
      throw new Error(`Missing grammar for scope: ${scopeName}`)
    },
    async getTheme() {
      const theme = textmateTheme as unknown as TextMateThemeRaw
      return {
        ...theme,
        settings: theme.tokenColors || theme.settings || [],
      }
    },
  }

  const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)
  const tsx = `// greeting
const x = 1`
  const tokens = await tokenizer.tokenize(tsx, 'tsx', ['dark'])
  const flat = tokens.flatMap((line) => line)
  const slashToken = flat.find((token) => token.value === '//')
  expect(slashToken).toBeDefined()
  expect(slashToken!.isBaseColor).toBe(false)
  expect(slashToken!.style.color?.toUpperCase()).toBe('#637777')
})

test('template string interpolation does not bleed punctuation color into identifiers', async () => {
  const textmateRegistryOptions: RegistryOptions<'dark'> = {
    async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
      if (scopeName === 'source.tsx') return tsxGrammar
      throw new Error(`Missing grammar for scope: ${scopeName}`)
    },
    async getTheme() {
      const theme = textmateTheme as unknown as TextMateThemeRaw
      return {
        ...theme,
        settings: theme.tokenColors || theme.settings || [],
      }
    },
  }

  const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)
  const tsx = 'import(`./posts/${path}.mdx`)'
  const tokens = await tokenizer.tokenize(tsx, 'tsx', ['dark'])
  const flat = tokens.flat()

  const interpolationStart = flat.find((token) => token.value === '${')
  expect(interpolationStart).toBeDefined()
  expect(interpolationStart!.style.color?.toUpperCase()).toBe('#D3423E')

  const pathToken = flat.find((token) => token.value === 'path')
  expect(pathToken).toBeDefined()
  // In VSCode, the braces are colored, but the identifier is not red.
  expect(pathToken!.style.color?.toUpperCase()).not.toBe('#D3423E')
})

test('await params property access uses base color with italics', async () => {
  const textmateRegistryOptions: RegistryOptions<'dark'> = {
    async getGrammar(scopeName: string): Promise<TextMateGrammarRaw> {
      if (scopeName === 'source.tsx') return tsxGrammar
      throw new Error(`Missing grammar for scope: ${scopeName}`)
    },
    async getTheme() {
      const theme = textmateTheme as unknown as TextMateThemeRaw
      return {
        ...theme,
        settings: theme.tokenColors || theme.settings || [],
      }
    },
  }

  const tokenizer = new Tokenizer<'dark'>(textmateRegistryOptions)
  const tsx = 'const slug = (await params).slug'
  const tokens = await tokenizer.tokenize(tsx, 'tsx', ['dark'])
  const flat = tokens.flatMap((line) => line)

  const paramsToken = flat.find((token) => token.value === 'params')
  expect(paramsToken).toBeDefined()
  expect(paramsToken!.style.fontStyle).toBe('italic')
  expect(paramsToken!.isBaseColor).toBe(true)

  const dotIndex = flat.findIndex((token) => token.value === '.')
  const propertySlugToken =
    dotIndex >= 0
      ? flat.slice(dotIndex + 1).find((token) => token.value === 'slug')
      : undefined
  expect(propertySlugToken).toBeDefined()
  expect(propertySlugToken!.style.fontStyle).toBe('italic')
})
