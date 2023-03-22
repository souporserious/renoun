import * as monaco from 'monaco-editor'

function isValidColor(color) {
  const colorRegex = /^#(?:[0-9a-fA-F]{3}){1,2}$/
  return colorRegex.test(color)
}

function sanitizeColor(color) {
  if (!color || isValidColor(color)) {
    return color
  }
  return '#FF0000'
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
    .filter(
      (token) => token.settings && token.scope && colorsAllowed(token.settings)
    )
    .reduce((collection, token) => {
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
        collection.push({
          token: s,
          ...settings,
        })
      )

      return collection
    }, [])

  const newColors = colors

  Object.keys(colors).forEach((color) => {
    if (newColors[color]) return color

    delete newColors[color]

    return color
  })

  return {
    colors: newColors,
    type: theme.type,
    rules,
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

/** Parses TextMate theme and returns a monaco compatible theme. */
export function getTheme(
  theme: Record<string, any>
): monaco.editor.IStandaloneThemeData {
  const transformedTheme = transformTheme(theme)

  return {
    base: getBase(transformedTheme.type),
    inherit: true,
    colors: transformedTheme.colors,
    rules: transformedTheme.rules,
  }
}
