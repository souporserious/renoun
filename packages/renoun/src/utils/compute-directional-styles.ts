/** Computes directional styles from a `css` object and a `style` object. */
export function computeDirectionalStyles(
  key: any,
  defaultValue: number | string,
  css: Record<string, any> = {},
  style: Record<string, any> = {}
) {
  const parsedDefaultValue = parseValue(defaultValue ?? 0)!
  const cssPadding = computeDirectionalValue(key, css)
  const stylePadding = computeDirectionalValue(key, style)
  const styles = {
    top: stylePadding.top || cssPadding.top || parsedDefaultValue,
    right: stylePadding.right || cssPadding.right || parsedDefaultValue,
    bottom: stylePadding.bottom || cssPadding.bottom || parsedDefaultValue,
    left: stylePadding.left || cssPadding.left || parsedDefaultValue,
  }

  return {
    all: `${styles.top} ${styles.right} ${styles.bottom} ${styles.left}`,
    horizontal: `${styles.left} ${styles.right}`,
    vertical: `${styles.top} ${styles.bottom}`,
    ...styles,
  }
}

/** Takes a key and a styles object and returns the directional values for that key. */
function computeDirectionalValue(key: any, styles: Record<string, any> = {}) {
  const all = styles[key]
  let top: number | string | undefined
  let right: number | string | undefined
  let bottom: number | string | undefined
  let left: number | string | undefined

  // Check if the 'all' value is a string and contains space-separated values
  if (typeof all === 'string' && all.includes(' ')) {
    const values = all.split(' ').map((val) => val.trim())

    // Handle different lengths of the space-separated values
    switch (values.length) {
      // all sides are the same
      case 1:
        top = right = bottom = left = values[0]
        break
      // top/bottom are the first, left/right are the second
      case 2:
        top = bottom = values[0]
        right = left = values[1]
        break
      // top is first, left/right are the second, bottom is the third
      case 3:
        top = values[0]
        right = left = values[1]
        bottom = values[2]
        break
      // top, right, bottom, left in order
      case 4:
        top = values[0]
        right = values[1]
        bottom = values[2]
        left = values[3]
        break
      default:
        break
    }
  } else if (all) {
    // If 'all' is a single value, apply it to all sides
    top = right = bottom = left = all
  }

  return {
    top: parseValue(styles[`${key}Top`] || top),
    right: parseValue(styles[`${key}Right`] || right),
    bottom: parseValue(styles[`${key}Bottom`] || bottom),
    left: parseValue(styles[`${key}Left`] || left),
  }
}

/** Parses a value to a string with 'px' appended if it is a number. */
function parseValue(value?: string | number) {
  return typeof value === 'number' ? value + 'px' : value
}
