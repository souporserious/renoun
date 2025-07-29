import { findPackageDependency } from './find-package-dependency.js'

/** Attempts to load a package if it is installed. */
async function loadPackage<Value>(name: string, getImport: () => any) {
  const hasPackage = await findPackageDependency(name)
  return hasPackage ? (getImport() as Value) : null
}

/** Attempts to load the prettier package if it is installed. */
export function loadPrettier() {
  return loadPackage<{
    format: (sourceText: string, options?: Record<string, unknown>) => string
    resolveConfig: (fileName: string) => Promise<Record<string, unknown> | null>
  }>(
    'prettier',
    () =>
      import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ 'prettier'
      )
  )
}

/** Attempts to load the tm-grammars package if it is installed. */
export function loadTmGrammars() {
  return loadPackage<{
    grammars: {
      name: string
      scopeName: string
    }[]
  }>('tm-grammars', async () => {
    return import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ 'tm-grammars'
    )
  })
}

/** Attempts to load a grammar from the tm-grammars package if it is installed. */
export function loadTmGrammar(name: string) {
  return loadPackage<Record<string, any>>('tm-grammars', async () => {
    const module = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ `tm-grammars/grammars/${name}.json`,
      { with: { type: 'json' } }
    )
    return module.default
  })
}

/** Attempts to load a theme from the tm-themes package if it is installed. */
export function loadTmTheme(name: string) {
  return loadPackage<Record<string, any>>('tm-themes', async () => {
    const module = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ `tm-themes/themes/${name}.json`,
      { with: { type: 'json' } }
    )
    return module.default
  })
}
