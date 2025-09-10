import React, { cloneElement, isValidElement } from 'react'

import { parseGitSpecifier } from '../file-system/Repository.js'
import { ClientConfigProvider } from './Config/ClientConfigContext.js'
import { ServerConfigContext } from './Config/ServerConfigContext.js'
import {
  defaultConfig,
  type ConfigurationOptions,
} from './Config/ConfigTypes.js'
import { Refresh } from './Refresh'
import { ThemeProvider } from './Theme'

/** A provider that configures and wraps the root of the application. */
export function RootProvider({
  children,
  theme,
  languages,
  git,
  siteUrl,
  includeThemeScript = true,
  nonce,
}: {
  children: React.ReactNode
} & Omit<Partial<ConfigurationOptions>, 'git'> & {
    git?: ConfigurationOptions['git'] | string

    /** Whether to include the theme script in the head of the document. */
    includeThemeScript?: boolean

    /** The nonce to use for the provider scripts. */
    nonce?: string
  }) {
  const overrides: Partial<ConfigurationOptions> = {}
  if (theme !== undefined) {
    overrides.theme = theme
  }
  if (languages !== undefined) {
    overrides.languages = languages
  }
  if (git !== undefined) {
    if (typeof git === 'string') {
      try {
        const specifier = parseGitSpecifier(git)
        const hostMap = {
          github: 'https://github.com',
          gitlab: 'https://gitlab.com',
          bitbucket: 'https://bitbucket.org',
          pierre: 'https://pierre.co',
        } as const
        const baseUrl = hostMap[specifier.provider]
        const source = `${baseUrl}/${specifier.owner}/${specifier.repo}`

        overrides.git = {
          source,
          branch: specifier.ref ?? 'main',
          provider: specifier.provider,
          owner: specifier.owner,
          repository: specifier.repo,
          baseUrl,
        }
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            `[renoun] Invalid git shorthand: "${git}". ${error.message}`
          )
        }
        throw error
      }
    } else {
      overrides.git = git
    }
  }
  if (siteUrl !== undefined) {
    overrides.siteUrl = siteUrl
  }

  let merged: ConfigurationOptions = {
    ...defaultConfig,
    ...overrides,
  }

  // Normalize string theme to an object for downstream utilities
  if (typeof merged.theme === 'string') {
    merged = {
      ...merged,
      theme: { light: merged.theme, dark: merged.theme },
    }
  }

  let childrenToRender: React.ReactElement

  if (isValidElement(children)) {
    if (children.type !== 'html') {
      throw new Error('[renoun] RootProvider must wrap the html element.')
    }
    childrenToRender = cloneElement<any>(children, {
      suppressHydrationWarning: true,
    })
  } else {
    throw new Error('[renoun] RootProvider must wrap the html element.')
  }

  return (
    <ServerConfigContext value={merged}>
      <ClientConfigProvider value={merged}>
        <ThemeProvider
          theme={merged.theme}
          includeScript={includeThemeScript}
          nonce={nonce}
        >
          {childrenToRender}
        </ThemeProvider>
        <Refresh />
      </ClientConfigProvider>
    </ServerConfigContext>
  )
}
