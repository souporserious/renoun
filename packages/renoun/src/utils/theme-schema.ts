export interface TokenColorSettings {
  foreground?: string
  background?: string
  fontStyle?: string
}

export interface TokenColor {
  name?: string
  scope?: string | string[]
  settings: TokenColorSettings
}

export interface Theme {
  name?: string
  type?: 'light' | 'dark' | 'hc'
  colors: Record<string, string | null>
  tokenColors?: TokenColor[]
  semanticTokenColors?: Record<string, string | Record<string, unknown>>
  settings?: any[]
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isColorString(value: string): boolean {
  return (
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/i.test(
      value
    ) ||
    /^rgba?\(\s*(\d{1,3}\s*,\s*){2}\d{1,3}(\s*,\s*(0|0?\.\d+|1(\.0)?))?\s*\)$/i.test(
      value
    ) ||
    value.toLowerCase() === 'transparent'
  )
}

const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype'])

function assertSafeKeys(obj: Record<string, unknown>, path: string) {
  for (const key of Object.keys(obj)) {
    if (dangerousKeys.has(key)) {
      throw new Error(`${path} contains forbidden key ${key}`)
    }
  }
}

/** Validates a VS Code theme object at runtime. */
export function validateTheme(theme: unknown): Theme {
  if (!isRecord(theme)) {
    throw new Error('Theme must be an object')
  }

  assertSafeKeys(theme, 'theme')

  if (!('colors' in theme) || !isRecord(theme['colors'])) {
    throw new Error('`colors` must be an object')
  }

  assertSafeKeys(theme['colors'], 'colors')

  for (const [key, value] of Object.entries(theme['colors'])) {
    if (value !== null) {
      if (typeof value !== 'string' || !isColorString(value)) {
        throw new Error(`colors.${key} must be a hex color string or null`)
      }
    }
  }

  if (theme['name'] !== undefined && typeof theme['name'] !== 'string') {
    throw new Error('`name` must be a string')
  }

  if (
    theme['type'] !== undefined &&
    theme['type'] !== 'light' &&
    theme['type'] !== 'dark' &&
    theme['type'] !== 'hc'
  ) {
    throw new Error('`type` must be "light", "dark", or "hc"')
  }

  if (theme['tokenColors'] !== undefined) {
    if (!Array.isArray(theme['tokenColors'])) {
      throw new Error('`tokenColors` must be an array')
    }

    theme['tokenColors'].forEach((entry, index) => {
      if (!isRecord(entry)) {
        throw new Error(`tokenColors[${index}] must be an object`)
      }

      assertSafeKeys(entry, `tokenColors[${index}]`)

      if (entry['name'] !== undefined && typeof entry['name'] !== 'string') {
        throw new Error(`tokenColors[${index}].name must be a string`)
      }

      if (entry['scope'] !== undefined) {
        const scope = entry['scope']
        const isValidScope =
          typeof scope === 'string' ||
          (Array.isArray(scope) && scope.every((s) => typeof s === 'string'))
        if (!isValidScope) {
          throw new Error(
            `tokenColors[${index}].scope must be a string or string[]`
          )
        }
      }

      if (!('settings' in entry) || !isRecord(entry['settings'])) {
        throw new Error(`tokenColors[${index}].settings must be an object`)
      }

      assertSafeKeys(entry['settings'], `tokenColors[${index}].settings`)

      const { foreground, background, fontStyle } = entry['settings']
      if (foreground !== undefined) {
        if (typeof foreground !== 'string' || !isColorString(foreground)) {
          throw new Error(
            `tokenColors[${index}].settings.foreground must be a hex color string`
          )
        }
      }
      if (background !== undefined) {
        if (typeof background !== 'string' || !isColorString(background)) {
          throw new Error(
            `tokenColors[${index}].settings.background must be a hex color string`
          )
        }
      }
      if (fontStyle !== undefined) {
        if (typeof fontStyle !== 'string') {
          throw new Error(
            `tokenColors[${index}].settings.fontStyle must be a string`
          )
        }

        const normalized = fontStyle.trim().toLowerCase()
        // VS Code themes commonly use these to indicate "no style".
        if (
          normalized === '' ||
          normalized === 'none' ||
          normalized === 'normal' ||
          normalized === 'regular'
        ) {
          // ok
        } else {
          const styles = normalized.split(/\s+/).filter(Boolean)
          const validStyles = ['italic', 'bold', 'underline', 'strikethrough']
          if (!styles.every((s) => validStyles.includes(s))) {
            throw new Error(
              `tokenColors[${index}].settings.fontStyle has invalid value`
            )
          }
        }
      }
    })
  }

  if (theme['semanticTokenColors'] !== undefined) {
    if (!isRecord(theme['semanticTokenColors'])) {
      throw new Error('`semanticTokenColors` must be an object')
    }
    assertSafeKeys(theme['semanticTokenColors'], 'semanticTokenColors')

    for (const [key, value] of Object.entries(theme['semanticTokenColors'])) {
      if (typeof value === 'string') {
        if (!isColorString(value)) {
          throw new Error(
            `semanticTokenColors.${key} must be a hex color string or object`
          )
        }
        continue
      }

      if (isRecord(value)) {
        assertSafeKeys(value, `semanticTokenColors.${key}`)
        const allowed = [
          'foreground',
          'background',
          'bold',
          'italic',
          'underline',
          'strikethrough',
        ]

        for (const [k, v] of Object.entries(value)) {
          if (!allowed.includes(k)) {
            throw new Error(
              `semanticTokenColors.${key}.${k} is not a permitted property`
            )
          }

          if (k === 'foreground' || k === 'background') {
            if (typeof v !== 'string' || !isColorString(v)) {
              throw new Error(
                `semanticTokenColors.${key}.${k} must be a hex color string`
              )
            }
          } else {
            if (typeof v !== 'boolean') {
              throw new Error(
                `semanticTokenColors.${key}.${k} must be a boolean`
              )
            }
          }
        }
        continue
      }

      throw new Error(
        `semanticTokenColors.${key} must be a hex color string or object`
      )
    }
  }

  if (theme['settings'] !== undefined) {
    if (!Array.isArray(theme['settings'])) {
      throw new Error('`settings` must be an array')
    }
    theme['settings'].forEach((entry, index) => {
      if (!isRecord(entry)) {
        throw new Error(`settings[${index}] must be an object`)
      }
      assertSafeKeys(entry, `settings[${index}]`)
    })
  }

  return theme as Theme
}
