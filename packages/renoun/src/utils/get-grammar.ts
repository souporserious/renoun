import type { Languages, ScopeName } from '../grammars/index.js'
import {
  grammars,
  grammarLoaders,
  grammarRedirects,
} from '../grammars/index.js'
import { loadConfig } from './load-config.js'
import { loadTmGrammars, loadTmGrammar } from './load-package.js'

/**
 * Attempts to load a grammar for a given scope name.
 *
 * If the default loader is not found, but the language is configured,
 * the grammar will be loaded from the `tm-grammars` package.
 */
export async function getGrammar(scopeName: ScopeName): Promise<any> {
  const config = loadConfig()
  const aliases = grammars[scopeName] as readonly Languages[] | undefined
  const isLanguageConfigured = aliases
    ? config.languages.some((language) => aliases.includes(language))
    : false
  const defaultLoader = grammarLoaders[scopeName]

  if (!defaultLoader) {
    // determine if the scope name has a redirect
    const grammarRedirect =
      scopeName in grammarRedirects
        ? grammarRedirects[scopeName as keyof typeof grammarRedirects]
        : null

    if (grammarRedirect) {
      const grammar = await getGrammar(grammarRedirect as ScopeName)

      return {
        ...grammar,
        scopeName,
      }
    } else {
      if (isLanguageConfigured) {
        const tmGrammars = await loadTmGrammars()

        if (!tmGrammars) {
          throw new Error(
            `[renoun] The "tm-grammars" package is not installed. Please install it to use this language and ensure it is configured in renoun.json correctly.`
          )
        }

        const tmGrammar = tmGrammars.grammars.find(
          (grammar) => grammar.scopeName === scopeName
        )

        if (!tmGrammar) {
          throw new Error(
            `[renoun] No grammar found for scope name "${scopeName}" in the "tm-grammars" package. Ensure this grammar is configured in renoun.json correctly.`
          )
        }

        const tmGrammarJson = await loadTmGrammar(tmGrammar.name)

        if (!tmGrammarJson) {
          throw new Error(
            `[renoun] Grammar could not be loaded for scope name "${scopeName}" in the "tm-grammars" package. Ensure this grammar is configured in renoun.json correctly.`
          )
        }

        return tmGrammarJson
      }

      return null
    }
  }

  return defaultLoader().then((result) => result.default)
}
