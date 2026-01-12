import { describe, expect, it } from 'vitest'

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
