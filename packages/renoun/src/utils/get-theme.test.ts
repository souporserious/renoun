import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getTheme } from './get-theme.ts'
import { validateTheme } from './theme-schema.ts'

describe('theme schema', () => {
  it('validates a correct theme', () => {
    const theme = {
      colors: { editor: '#fff' },
      tokenColors: [{ scope: 'test', settings: { foreground: '#fff' } }],
      semanticTokenColors: { variable: { foreground: '#fff', bold: true } },
    }
    expect(() => validateTheme(theme)).not.toThrow()
  })

  it('throws on invalid token color entry', () => {
    const theme = {
      colors: {},
      // missing settings in tokenColors entry
      tokenColors: [{ scope: 'test' }],
    }
    expect(() => validateTheme(theme)).toThrow()
  })

  it('throws on invalid color string', () => {
    const theme = {
      colors: { editor: 'red' },
    }
    expect(() => validateTheme(theme)).toThrow()
  })

  it('throws on prototype pollution attempt', () => {
    const theme = JSON.parse('{ "colors": { "__proto__": "#fff" } }')
    expect(() => validateTheme(theme)).toThrow()
  })

  it('throws on invalid semantic token color', () => {
    const theme = {
      colors: {},
      semanticTokenColors: { variable: { foo: true } },
    }
    expect(() => validateTheme(theme)).toThrow()
  })
})

describe('getTheme', () => {
  it('does not reuse cached themes across aliases with different overrides', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'renoun-theme-cache-'))
    const themePath = join(directory, 'theme.json')

    try {
      writeFileSync(
        themePath,
        JSON.stringify({
          colors: {
            'editor.background': '#101010',
          },
        })
      )

      const themeConfig = {
        light: [
          themePath,
          {
            colors: {
              'editor.background': '#ffffff',
            },
          },
        ],
        dark: [
          themePath,
          {
            colors: {
              'editor.background': '#000000',
            },
          },
        ],
      } as const

      const lightTheme = await getTheme('light', themeConfig)
      const darkTheme = await getTheme('dark', themeConfig)

      expect(lightTheme.colors?.['editor.background']).toBe('#ffffff')
      expect(darkTheme.colors?.['editor.background']).toBe('#000000')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
