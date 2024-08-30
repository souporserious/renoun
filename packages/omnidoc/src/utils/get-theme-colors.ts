import { getTheme } from './get-theme'

let themeColors: Record<string, any> | null = null

/**
 * Gets the configured VS Code theme colors as an object.
 * @internal
 */
export async function getThemeColors() {
  if (themeColors === null) {
    const { colors } = await getTheme()
    themeColors = dotNotationToObject(colors)
  }

  return themeColors!
}

/**
 * Converts a JSON structure with dot-notation keys into a nested object.
 * (e.g. `theme.colors['panel.border']` -> `theme.colors.panel.border`)
 */
function dotNotationToObject<Type extends Record<string, any>>(
  flatObject: Record<string, any>
) {
  const result: Record<string, any> = {}
  for (const key in flatObject) {
    const parts = key.split('.')
    let target = result
    for (let index = 0; index < parts.length - 1; index++) {
      const part = parts[index]
      if (!target[part]) target[part] = {}
      target = target[part]
    }
    target[parts[parts.length - 1]] = flatObject[key]
  }
  return result as Type
}
