'use client'
import { useThemePicker } from 'renoun'

export function ThemeToggle() {
  const [theme, setTheme] = useThemePicker()
  const isDark = theme === 'dark'
  const nextTheme = isDark ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {isDark ? '🌙' : '☀️'}
      </span>
      <span className="theme-toggle__label">Switch to {nextTheme} mode</span>
    </button>
  )
}
