import React, { cloneElement, isValidElement } from 'react'

import { parseGitSpecifier } from '../file-system/Repository.js'
import { CommandScript } from './Command/CommandScript.js'
import { ClientConfigProvider } from './Config/ClientConfigContext.js'
import { ServerConfigContext } from './Config/ServerConfigContext.js'
import { defaultConfig } from './Config/default-config.js'
import type { ConfigurationOptions, ThemeValue } from './Config/types.js'
import { Refresh } from './Refresh'
import { ThemeProvider } from './Theme'

type ThemeMap = Record<string, ThemeValue>

interface BaseProps
  extends Omit<Partial<ConfigurationOptions>, 'git' | 'theme'> {
  /** The nonce to use for the provider scripts. */
  nonce?: string

  /** Configuration options for git linking. Accepts a string shorthand or an object. */
  git?: ConfigurationOptions['git'] | string

  /** Control whether to include the script for the `Command` component in the document head. */
  includeCommandScript?: boolean

  /** The `html` element tree to render. */
  children: React.ReactNode
}

export type RootProviderProps<Theme extends ThemeValue | ThemeMap | undefined> =
  BaseProps &
    (Theme extends ThemeMap
      ? {
          /** Object map of theme names to theme values e.g. `{ light: 'vitesse-light', dark: 'vitesse-dark' }`. */
          theme: ThemeMap

          /** Control whether to include the theme script that manages the local storage theme state in the head of the document. */
          includeThemeScript?: boolean
        }
      : {
          /** Single theme name or [name, override]. If omitted, defaults apply. */
          theme?: ThemeValue

          /** The `includeThemeScript` prop is only considered when the `theme` prop is an object map e.g. `theme={{ light: 'vitesse-light', dark: 'vitesse-dark' }}`. */
          includeThemeScript?: never
        })

/** A provider that configures and wraps the root of the application. */
export function RootProvider<Theme extends ThemeValue | ThemeMap | undefined>({
  children,
  theme,
  languages,
  git,
  siteUrl,
  includeCommandScript = true,
  includeThemeScript = true,
  nonce,
  ...restProps
}: RootProviderProps<Theme>) {
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
        const baseUrl = hostMap[specifier.host]
        const source = `${baseUrl}/${specifier.owner}/${specifier.repo}`

        overrides.git = {
          source,
          branch: specifier.ref ?? 'main',
          host: specifier.host,
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
  if (
    'defaultPackageManager' in restProps &&
    restProps.defaultPackageManager !== undefined
  ) {
    overrides.defaultPackageManager = restProps.defaultPackageManager
  }

  let merged: ConfigurationOptions = {
    ...defaultConfig,
    ...overrides,
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
        {includeCommandScript ? (
          <CommandScript
            defaultPackageManager={merged.defaultPackageManager}
            nonce={nonce}
          />
        ) : null}
        {typeof merged.theme === 'object' ? (
          <ThemeProvider
            theme={merged.theme}
            includeScript={includeThemeScript}
            nonce={nonce}
          >
            {childrenToRender}
          </ThemeProvider>
        ) : (
          childrenToRender
        )}
        <Refresh />
      </ClientConfigProvider>
    </ServerConfigContext>
  )
}
