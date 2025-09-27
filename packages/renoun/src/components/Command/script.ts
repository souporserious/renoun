type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

declare global {
  interface Window {
    /**
     * Sets the active package manager across all Command instances. Passing null
     * re-evaluates from localStorage or uses the default.
     */
    setPackageManager: (packageManager: PackageManager | null) => void
  }
}

/**
 * Global script for the `Command` component. Defines a `window.setPackageManager`
 * method that wires up keyboard and click handlers, and applies a selection state.
 * @internal
 */
export default function (props: {
  defaultPackageManager?: PackageManager
}): void {
  const { defaultPackageManager = 'npm' } = props
  const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const
  const stateKey = 'package-manager'

  function isPackageManager(value: unknown): value is PackageManager {
    return (
      typeof value === 'string' &&
      (PACKAGE_MANAGERS as readonly string[]).includes(value)
    )
  }

  window.setPackageManager = (packageManager: PackageManager | null): void => {
    // Resolve selection precedence: explicit > stored > default
    let resolved: string | null = packageManager
    if (!resolved) {
      const stored = localStorage.getItem(stateKey)
      resolved = stored
    }
    const selected: PackageManager = isPackageManager(resolved)
      ? resolved
      : defaultPackageManager

    const elements = document.querySelectorAll<HTMLElement>(
      '[data-command][role="tab"], [data-command][role="tabpanel"]'
    )
    elements.forEach((element) => {
      const elementValue = element.dataset['command']
      const isSelected = elementValue === selected
      const role = element.getAttribute('role')
      if (role === 'tab') {
        element.tabIndex = isSelected ? 0 : -1
        element.setAttribute('aria-selected', String(isSelected))
      } else if (role === 'tabpanel') {
        element.hidden = !isSelected
      }
    })
  }

  document.addEventListener('DOMContentLoaded', () => {
    const containers = document.querySelectorAll<HTMLElement>(
      '[data-command-group]'
    )
    const groups = Array.from(
      new Set(
        Array.from(containers)
          .map((el) => el.getAttribute('data-command-group'))
          .filter((v): v is string => Boolean(v))
      )
    )

    groups.forEach((group) => {
      const selector = `[data-command-group="${CSS.escape(group)}"][data-command][role="tab"]`
      const tabs = document.querySelectorAll<HTMLElement>(selector)
      tabs.forEach((tab) => {
        tab.addEventListener('keydown', (event: KeyboardEvent) => {
          const tabsInGroup = document.querySelectorAll<HTMLElement>(selector)
          tabsInGroup as NodeListOf<HTMLElement> // ensure HTMLElement typing
          const arr = Array.from(tabsInGroup)
          const currentIndex = arr.indexOf(
            document.activeElement as HTMLElement
          )
          let newIndex: number | null = null
          switch (event.key) {
            case 'ArrowRight':
              newIndex = (currentIndex + 1) % arr.length
              break
            case 'ArrowLeft':
              newIndex = (currentIndex - 1 + arr.length) % arr.length
              break
            case 'Home':
              newIndex = 0
              break
            case 'End':
              newIndex = arr.length - 1
              break
            default:
              break
          }
          if (newIndex === null) return
          arr[newIndex].click()
          arr[newIndex].focus()
          event.preventDefault()
        })
      })
    })

    window.setPackageManager(null)
  })

  document.addEventListener('click', (event: MouseEvent) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-command][role="tab"]'
    )
    if (!target) return
    const command = target.dataset['command']
    if (!isPackageManager(command)) return

    localStorage.setItem(stateKey, command)
    window.setPackageManager(command)
  })
}
