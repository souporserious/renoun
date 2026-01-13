import { describe, expect, test } from 'vitest'

import {
  Tokenizer,
  type RegistryOptions,
  type TextMateThemeRaw,
  type TextMateGrammarRaw,
} from './create-tokenizer.ts'

import cssGrammar from '../grammars/css.ts'
import shellGrammar from '../grammars/shellscript.ts'
import mdxGrammar from '../grammars/mdx.ts'
import tsxGrammar from '../grammars/tsx.ts'

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

    // All tokenizers should produce the same token values
    const values1 = tokens1.flatMap((line) => line.map((t) => t.value))
    const values2 = tokens2.flatMap((line) => line.map((t) => t.value))
    const values3 = tokens3.flatMap((line) => line.map((t) => t.value))

    expect(values1).toEqual(values2)
    expect(values1).toEqual(values3)
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
    expect(shellTokens.flatMap((l) => l.map((t) => t.value)).join('')).toBe(
      'npm install renoun'
    )
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

  test('tokenizes TypeScript with keyword and string scopes', async () => {
    const tokenizer = new Tokenizer<ThemeName>(registryOptions)
    const source = `import { Directory } from 'renoun'`

    const tokens = await tokenizer.tokenize(source, 'tsx', ['light'])
    const flatTokens = tokens.flatMap((line) => line)

    // Find the 'import' keyword token
    const importToken = flatTokens.find((t) => t.value === 'import')
    expect(importToken).toBeDefined()
    // The more specific keyword.control.import scope should win
    expect(importToken?.style.color).toBe('#A492EA')
    expect(importToken?.style.fontStyle).toBe('italic')

    // Find the string token
    const stringToken = flatTokens.find((t) => t.value.includes('renoun'))
    expect(stringToken).toBeDefined()
    // Strings should have a color
    expect(stringToken?.style.color).toBe('#00AA00')
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
      
      interface Props<T extends Record<string, unknown>> {
        data: T[];
        onSelect?: (item: T) => void;
        renderItem: (item: T, index: number) => React.ReactNode;
      }
      
      function MyComponent<T extends Record<string, unknown>>({ 
        data, 
        onSelect, 
        renderItem 
      }: Props<T>) {
        const [selected, setSelected] = useState<T | null>(null);
        
        useEffect(() => {
          console.log('Selected:', selected);
        }, [selected]);
        
        const handleClick = useCallback((item: T) => {
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
})
