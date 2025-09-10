import React, { Fragment } from 'react'
import type { CSSObject } from 'restyle'
import { css } from 'restyle/css'

import { getSourceTextMetadata, getTokens } from '../../project/client.js'
import type { Languages } from '../../utils/get-language.js'
import type { SourceTextMetadata } from '../../utils/get-source-text-metadata.js'
import { getContext } from '../../utils/context.js'
import {
  getThemeColors,
  getThemeTokenVariables,
} from '../../utils/get-theme.js'
import type { ConfigurationOptions } from '../Config/ConfigTypes.js'
import { getConfig } from '../Config/ServerConfigContext.js'
import { QuickInfo } from './QuickInfo.js'
import { QuickInfoProvider } from './QuickInfoProvider.js'
import { Context } from './Context.js'
import { Symbol } from './Symbol.js'

export interface TokensProps {
  /** Code string to highlight and render as tokens. */
  children?: string | Promise<string>

  /** Whether to allow errors to be displayed. */
  allowErrors?: boolean | string

  /** Whether to show errors. */
  showErrors?: boolean

  /** Whether or not to analyze the source code for type errors and provide quick information on hover. */
  shouldAnalyze?: boolean

  /** Whether or not to format the source code using `prettier` if installed. */
  shouldFormat?: boolean

  /** Language to use for syntax highlighting. */
  language?: Languages

  /** CSS style object to apply to the tokens and popover elements. */
  css?: {
    token?: CSSObject
    popover?: CSSObject
  }

  /** Class names to apply to the tokens and popover elements. */
  className?: {
    token?: string
    popover?: string
  }

  /** Styles to apply to the tokens and popover elements. */
  style?: {
    token?: React.CSSProperties
    popover?: React.CSSProperties
  }

  /** Optional theme configuration to drive highlighting explicitly. */
  theme?: ConfigurationOptions['theme']

  /** Custom render function for each line of tokens. */
  renderLine?: (line: {
    children: React.ReactNode
    index: number
    isLast: boolean
  }) => React.ReactNode
}

/** Renders syntax highlighted tokens for the `CodeBlock` component. */
export async function Tokens({
  children,
  language: languageProp,
  allowErrors,
  showErrors,
  shouldAnalyze: shouldAnalyzeProp,
  shouldFormat = true,
  renderLine,
  css: cssProp = {},
  className = {},
  style = {},
  theme: themeProp,
}: TokensProps) {
  const context = getContext(Context)
  const config = getConfig()
  const theme = await getThemeColors(config.theme)
  const language = languageProp || context?.language
  let value

  if (children) {
    if (typeof children === 'string') {
      value = children
    } else {
      value = await children
    }
  }

  if (value === undefined) {
    throw new Error(
      '[renoun] No code value provided to Tokens component. Pass a string, a promise that resolves to a string, or wrap within a `CodeBlock` component that defines `path` and `baseDirectory` props.'
    )
  }

  const shouldAnalyze = shouldAnalyzeProp ?? context?.shouldAnalyze ?? true
  const metadata: SourceTextMetadata = {} as SourceTextMetadata

  if (shouldAnalyze) {
    const result = await getSourceTextMetadata({
      filePath: context?.filePath,
      baseDirectory: context?.baseDirectory,
      value,
      language,
      shouldFormat,
    })
    metadata.value = result.value
    metadata.language = result.language
    metadata.filePath = result.filePath
    metadata.label = result.label
  } else {
    metadata.value = value
    metadata.language = language
    metadata.label = context?.label
  }

  // Now we can resolve the context values for other components like `LineNumbers`, `CopyButton`, etc.
  if (context) {
    context.resolved = {
      value: metadata.value,
      language: metadata.language!,
      filePath: metadata.filePath!,
      label: metadata.label!,
    }
    context.resolvers.resolve()
  }

  const tokens = await getTokens({
    value: metadata.value,
    language: metadata.language,
    filePath: metadata.filePath,
    allowErrors: allowErrors || context?.allowErrors,
    showErrors: showErrors || context?.showErrors,
    theme: themeProp ?? config.theme,
    languages: config.languages,
  })
  const [themeClassName, ThemeStyles] = css(
    getThemeTokenVariables(config.theme)
  )
  const lastLineIndex = tokens.length - 1

  return (
    <QuickInfoProvider>
      <span className={themeClassName}>
        {tokens.map((line, lineIndex) => {
          const lineChildren = line.map((token, tokenIndex) => {
            const hasSymbolMeta = token.diagnostics || token.quickInfo

            if (
              token.isWhiteSpace ||
              (!hasSymbolMeta && !token.hasTextStyles && token.isBaseColor)
            ) {
              return token.value
            }

            if (hasSymbolMeta) {
              const deprecatedStyles = {
                textDecoration: 'line-through',
              }
              const diagnosticStyles = {
                backgroundImage: `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23f14c4c'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
                backgroundRepeat: 'repeat-x',
                backgroundPosition: 'bottom left',
              }
              const [symbolClassName, Styles] = css({
                ...token.style,
                ...(token.isDeprecated && deprecatedStyles),
                ...(token.diagnostics && diagnosticStyles),
                ...cssProp.token,
              })

              return (
                <Symbol
                  key={tokenIndex}
                  highlightColor={theme.editor.hoverHighlightBackground}
                  popover={
                    <QuickInfo
                      diagnostics={token.diagnostics}
                      quickInfo={token.quickInfo}
                      css={cssProp.popover}
                      className={className.token}
                      style={style.popover}
                    />
                  }
                  className={
                    className.token
                      ? `${symbolClassName} ${className.token}`
                      : symbolClassName
                  }
                  style={style.token}
                >
                  {token.value}
                  <Styles />
                </Symbol>
              )
            }

            const [classNames, Styles] = css(token.style)

            return (
              <span
                key={tokenIndex}
                className={
                  className.token
                    ? `${classNames} ${className.token}`
                    : classNames
                }
                style={style.token}
              >
                {token.value}
                <Styles />
              </span>
            )
          })
          const isLastLine = lineIndex === lastLineIndex
          let lineToRender = renderLine
            ? renderLine({
                children: lineChildren,
                index: lineIndex,
                isLast: isLastLine,
              })
            : lineChildren

          if (renderLine && lineToRender) {
            return lineToRender
          }

          return (
            <Fragment key={lineIndex}>
              {lineChildren}
              {isLastLine ? null : '\n'}
            </Fragment>
          )
        })}
        <ThemeStyles />
      </span>
    </QuickInfoProvider>
  )
}
