import * as monaco from 'monaco-editor'
import Color from 'color'

function sanitizeColor(color) {
  if (!color) {
    return color
  }

  if (/#......$/.test(color) || /#........$/.test(color)) {
    return color
  }

  try {
    return new Color(color).hexString()
  } catch (e) {
    return '#FF0000'
  }
}

function colorsAllowed({ foreground, background }) {
  if (foreground === 'inherit' || background === 'inherit') {
    return false
  }

  return true
}

function transformTheme(theme) {
  const { tokenColors = [], colors = {} } = theme
  const rules = tokenColors
    .filter((t) => t.settings && t.scope && colorsAllowed(t.settings))
    .reduce((acc, token) => {
      const settings = {
        foreground: sanitizeColor(token.settings.foreground),
        background: sanitizeColor(token.settings.background),
        fontStyle: token.settings.fontStyle,
      }

      const scope =
        typeof token.scope === 'string'
          ? token.scope.split(',').map((a) => a.trim())
          : token.scope

      scope.map((s) =>
        acc.push({
          token: s,
          ...settings,
        })
      )

      return acc
    }, [])

  const newColors = colors

  Object.keys(colors).forEach((c) => {
    if (newColors[c]) return c

    delete newColors[c]

    return c
  })

  return {
    colors: newColors,
    rules,
    type: theme.type,
  }
}

function getBase(type) {
  if (type === 'dark') {
    return 'vs-dark'
  }

  if (type === 'hc') {
    return 'hc-black'
  }

  return 'vs'
}

export function getTheme(theme): monaco.editor.IStandaloneThemeData {
  const transformedTheme = transformTheme(theme)

  return {
    base: getBase(transformedTheme.type),
    inherit: true,
    colors: transformedTheme.colors,
    rules: transformedTheme.rules,
  }
}
