/**
 * Sets the initial color mode based on user or system preference.
 * @internal
 */
export default function () {
  try {
    const storedColorMode = localStorage.getItem('colorMode')

    if (storedColorMode === 'light' || storedColorMode === 'dark') {
      document.documentElement.dataset['theme'] = storedColorMode
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      document.documentElement.dataset['theme'] = mediaQuery.matches
        ? 'dark'
        : 'light'
      mediaQuery.addEventListener('change', (event) => {
        document.documentElement.dataset['theme'] = event.matches
          ? 'dark'
          : 'light'
      })
    }
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'SecurityError' || error.name === 'QuotaExceededError')
    ) {
      return
    }
    throw error
  }
}
