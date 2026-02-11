import React, { Children, cloneElement, isValidElement } from 'react'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parseGitSpecifier } from '../file-system/Repository.ts'
import { hasMultipleThemes } from '../utils/get-theme.ts'
import { CommandScript } from './Command/CommandScript.tsx'
import { ClientConfigProvider } from './Config/ClientConfigContext.tsx'
import { ServerConfigContext } from './Config/ServerConfigContext.tsx'
import { defaultConfig } from './Config/default-config.ts'
import {
  normalizeSourcesConfig,
  type SourcesConfigInput,
} from './Config/normalize-sources-config.ts'
import type { ConfigurationOptions, ThemeValue } from './Config/types.ts'
import { Refresh } from './Refresh/index.ts'
import { TableOfContentsScript } from './TableOfContents/TableOfContents.ts'
import { ThemeProvider } from './Theme/index.ts'
import { ThemeScript } from './Theme/ThemeScript.ts'

type HtmlProps = React.ComponentProps<'html'>

type HeadProps = React.ComponentProps<'head'>

interface ThemeMap {
  [name: string]: ThemeValue
}

interface PackageJson {
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
  homepage?: unknown
}

type FrameworkName = 'next' | 'vite' | 'waku'

function hasDependency(packageJson: PackageJson, name: string) {
  return (
    typeof packageJson.dependencies?.[name] === 'string' ||
    typeof packageJson.devDependencies?.[name] === 'string' ||
    typeof packageJson.peerDependencies?.[name] === 'string'
  )
}

function detectFramework() {
  try {
    let currentDir = process.cwd()
    let previousDir: string | undefined

    while (currentDir && currentDir !== previousDir) {
      const packagePath = join(currentDir, 'package.json')

      if (existsSync(packagePath)) {
        const packageJson = JSON.parse(
          readFileSync(packagePath, 'utf8')
        ) as PackageJson

        if (hasDependency(packageJson, 'next')) return 'next'
        if (hasDependency(packageJson, 'waku')) return 'waku'
        if (hasDependency(packageJson, '@vitejs/plugin-rsc')) return 'vite'
      }

      previousDir = currentDir
      currentDir = dirname(currentDir)
    }
  } catch {
    // ignore and fall back to the default message
  }

  return undefined
}

function getRootProviderErrorMessage() {
  const framework = detectFramework()
  const filePaths: Partial<Record<FrameworkName, string>> = {
    next: 'app/layout.tsx',
    vite: 'src/root.tsx',
    waku: 'src/pages/_root.tsx',
  }
  const filePath = framework ? filePaths[framework] : undefined
  const instruction = filePath
    ? ` Add RootProvider to your "${filePath}" file so it wraps the <html> element.`
    : ''

  return `[renoun] RootProvider must wrap the html element.${instruction}`
}

interface BaseProps extends Omit<
  Partial<ConfigurationOptions>,
  'git' | 'theme'
> {
  /** The nonce to use for the provider scripts. */
  nonce?: string

  /** Configuration options for git linking. Accepts a string shorthand or an object. */
  git?: ConfigurationOptions['git'] | string

  /** Custom asset sources (e.g. { icons: { type: 'figma', fileId } }). */
  sources?: SourcesConfigInput

  /** Control whether to include the script for the `Command` component in the document head. */
  includeCommandScript?: boolean

  /** Control whether to include the script for the `TableOfContents` component in the document head. */
  includeTableOfContentsScript?: boolean

  /** The `html` element tree to render. */
  children: React.ReactNode
}

export type RootProviderProps<
  Theme extends ThemeValue | ThemeMap | undefined = undefined,
> = BaseProps &
  ([Theme] extends [ThemeMap]
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

interface RootProviderImplementationProps extends BaseProps {
  theme?: ThemeValue | ThemeMap
  includeThemeScript?: boolean
}

export function RootProvider(
  props: RootProviderProps<ThemeMap>
): React.JSX.Element
export function RootProvider(
  props: RootProviderProps<undefined>
): React.JSX.Element
/** A provider that configures and wraps the root of the application. */
export function RootProvider({
  children,
  theme,
  languages,
  git,
  siteUrl,
  editor,
  defaultPackageManager = 'npm',
  sources,
  images,
  includeCommandScript = true,
  includeTableOfContentsScript = true,
  includeThemeScript = true,
  nonce,
}: RootProviderImplementationProps) {
  const overrides: Partial<ConfigurationOptions> = {}
  if (theme !== undefined) {
    overrides.theme = theme
  }
  if (languages !== undefined) {
    overrides.languages = languages
  }
  if (editor !== undefined) {
    overrides.editor = editor
  }
  if (sources !== undefined) {
    overrides.sources = normalizeSourcesConfig(sources)
  }
  if (images !== undefined) {
    overrides.images = {
      ...defaultConfig.images,
      ...images,
    }
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
  // Derive siteUrl from nearest package.json homepage if not explicitly provided
  if (overrides.siteUrl === undefined) {
    try {
      let currentDir = process.cwd()
      let previousDir: string | undefined
      while (currentDir && currentDir !== previousDir) {
        const packagePath = join(currentDir, 'package.json')
        if (existsSync(packagePath)) {
          const packageJson = JSON.parse(
            readFileSync(packagePath, 'utf8')
          ) as PackageJson
          if (
            typeof packageJson.homepage === 'string' &&
            packageJson.homepage.trim().length > 0
          ) {
            overrides.siteUrl = packageJson.homepage.trim()
            break
          }
        }
        previousDir = currentDir
        currentDir = dirname(currentDir)
      }
    } catch {
      // ignore and leave siteUrl undefined
    }
  }
  if (defaultPackageManager) {
    overrides.defaultPackageManager = defaultPackageManager
  }

  let merged: ConfigurationOptions = {
    ...defaultConfig,
    ...overrides,
  }

  const hasMultipleThemesConfigured = hasMultipleThemes(merged.theme)

  let html: React.ReactElement<HtmlProps>

  if (isValidElement<React.ComponentProps<'html'>>(children)) {
    if (children.type !== 'html') {
      throw new Error(getRootProviderErrorMessage())
    }
    html = cloneElement(children, { suppressHydrationWarning: true })
  } else {
    throw new Error(getRootProviderErrorMessage())
  }

  if (includeTableOfContentsScript || includeCommandScript) {
    const childrenArray = Children.toArray(html.props.children)
    const headIndex = childrenArray.findIndex(
      (node) => isValidElement(node) && node.type === 'head'
    )
    const headInsertions: React.ReactNode[] = []

    if (includeTableOfContentsScript) {
      headInsertions.push(
        <TableOfContentsScript key="table-of-contents-script" nonce={nonce} />
      )
    }

    if (includeCommandScript) {
      headInsertions.push(
        <CommandScript
          key="command-script"
          defaultPackageManager={merged.defaultPackageManager}
          nonce={nonce}
        />
      )
    }

    if (includeThemeScript && hasMultipleThemesConfigured) {
      headInsertions.push(<ThemeScript key="theme-script" nonce={nonce} />)
    }

    if (headInsertions.length) {
      if (headIndex !== -1) {
        const headElement = childrenArray[
          headIndex
        ] as React.ReactElement<HeadProps>
        const nextHead = cloneElement<HeadProps>(headElement, {
          children: (
            <>
              {headInsertions}
              {headElement.props.children}
            </>
          ),
        })
        const nextChildren = childrenArray.slice()
        nextChildren[headIndex] = nextHead
        html = cloneElement<HtmlProps>(html, { children: nextChildren })
      } else {
        html = cloneElement<HtmlProps>(html, {
          children: [
            <head key="RootProvider">{headInsertions}</head>,
            ...childrenArray,
          ],
        })
      }
    }
  }

  return (
    <ServerConfigContext value={merged}>
      <ClientConfigProvider value={merged}>
        {hasMultipleThemesConfigured ? (
          <ThemeProvider theme={merged.theme}>{html}</ThemeProvider>
        ) : (
          html
        )}
        <Refresh />
      </ClientConfigProvider>
    </ServerConfigContext>
  )
}
