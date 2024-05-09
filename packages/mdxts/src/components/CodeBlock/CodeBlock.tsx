import React from 'react'
import 'server-only'

import { getThemeColors } from '../../index'
import { CopyButton } from '../CopyButton'
import { Tokens } from './Tokens'
import type { Languages } from './get-tokens'
import { getTokens } from './get-tokens'
import type { ContextValue } from './Context'
import { Context } from './Context'
import { LineHighlights } from './LineHighlights'
import { LineNumbers } from './LineNumbers'
import { Toolbar } from './Toolbar'
import { parseSourceTextMetadata } from './parse-source-text-metadata'
import { generateFocusLinesMaskImage } from './utils'

export type BaseCodeBlockProps = {
  /** Name of the file. */
  filename?: string

  /** Language of the source code. When using `source`, the file extension will be used by default. */
  language?: Languages

  /** A string of comma separated lines and ranges to highlight e.g. `'1, 3-5, 7'`. */
  highlightedLines?: string

  /** A string of comma separated lines and ranges to focus e.g. `'6-8, 12'`. */
  focusedLines?: string

  /** Opacity of unfocused lines when using `focusedLines`. */
  unfocusedLinesOpacity?: number

  /** Show or hide the toolbar. */
  toolbar?: boolean

  /** Show or hide a button that copies the source code to the clipboard. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide error diagnostics. */
  showErrors?: boolean

  /** Show or hide line numbers. */
  showLineNumbers?: boolean

  /** Path to the source file on disk in development and the git provider source in production. */
  sourcePath?: string | false

  /** Whether or not to attempt to fix broken imports. Useful for code using imports outside of the project. */
  fixImports?: boolean

  /** Class names to apply to code block elements. Use the `children` prop for full control of styling. */
  className?: {
    container?: string
    toolbar?: string
    showLineNumbers?: string
    token?: string
    popover?: string
  }

  /** Styles to apply to code block elements. Use the `children` prop for full control of styling. */
  style?: {
    container?: React.CSSProperties
    toolbar?: React.CSSProperties
    showLineNumbers?: React.CSSProperties
    token?: React.CSSProperties
    popover?: React.CSSProperties
  }

  /** Overrides default rendering to allow full control over styles using `CodeBlock` components like `Tokens`, `LineNumbers`, `LineHighlights`, and `Toolbar`. */
  children?: React.ReactNode
}

export type CodeBlockProps =
  | ({
      /** Code snippet to be highlighted. */
      value: string
    } & BaseCodeBlockProps)
  | ({
      /** Source code to be highlighted. */
      source: string

      /** Specify the working directory for the `source`. */
      workingDirectory?: string
    } & BaseCodeBlockProps)

/** Renders a `pre` element with syntax highlighting, type information, and type checking. */
export async function CodeBlock({
  filename,
  language,
  highlightedLines,
  focusedLines,
  unfocusedLinesOpacity = 0.6,
  toolbar,
  allowCopy,
  allowErrors,
  showErrors,
  showLineNumbers,
  fixImports,
  sourcePath,
  ...props
}: CodeBlockProps) {
  const padding = props.style?.container?.padding ?? '0.5lh'
  const hasValue = 'value' in props
  const hasSource = 'source' in props
  const options: any = {}

  if (hasValue) {
    options.value = props.value
  } else if (hasSource) {
    options.source = props.source
    options.workingDirectory = props.workingDirectory
  }

  const metadata = await parseSourceTextMetadata({
    filename,
    language,
    allowErrors,
    fixImports,
    ...options,
  })
  const tokens = await getTokens(
    metadata.value,
    metadata.language,
    metadata.filename,
    allowErrors,
    showErrors,
    // Simplify the path for more legibile error messages.
    sourcePath ? sourcePath.split(process.cwd()).at(1) : undefined
  )
  const contextValue = {
    value: metadata.value,
    filenameLabel: filename || hasSource ? metadata.filenameLabel : undefined,
    highlightedLines,
    padding,
    sourcePath,
    tokens,
  } satisfies ContextValue

  if ('children' in props) {
    return <Context value={contextValue}>{props.children}</Context>
  }

  const theme = await getThemeColors()
  const shouldRenderToolbar = Boolean(
    toolbar === undefined ? filename || hasSource || allowCopy : toolbar
  )
  const imageMask = focusedLines
    ? generateFocusLinesMaskImage(focusedLines)
    : undefined
  const Container = shouldRenderToolbar ? 'div' : React.Fragment
  const containerProps = shouldRenderToolbar
    ? {
        className: props.className?.container,
        style: {
          backgroundColor: theme.background,
          color: theme.foreground,
          borderRadius: 5,
          boxShadow: `0 0 0 1px ${theme.panel.border}`,
          ...props.style?.container,
          padding: 0,
        } satisfies React.CSSProperties,
      }
    : {}
  const isGridLayout = Boolean(
    highlightedLines || focusedLines || showLineNumbers
  )

  return (
    <Context value={contextValue}>
      <Container {...containerProps}>
        {shouldRenderToolbar ? (
          <Toolbar
            allowCopy={allowCopy === undefined ? Boolean(filename) : allowCopy}
            className={props.className?.toolbar}
            style={{ padding, ...props.style?.toolbar }}
          />
        ) : null}
        <pre
          className={
            shouldRenderToolbar ? undefined : props.className?.container
          }
          style={{
            display: isGridLayout ? 'grid' : undefined,
            gridTemplateColumns: isGridLayout ? 'auto 1fr' : undefined,
            gridTemplateRows: isGridLayout
              ? `repeat(${tokens.length}, 1lh)`
              : undefined,
            lineHeight: 1.4,
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            overflow: 'auto',
            position: 'relative',
            backgroundColor: shouldRenderToolbar ? 'inherit' : theme.background,
            color: shouldRenderToolbar ? undefined : theme.foreground,
            borderRadius: shouldRenderToolbar ? 'inherit' : 5,
            boxShadow: shouldRenderToolbar
              ? undefined
              : `0 0 0 1px ${theme.panel.border}`,
            ...(shouldRenderToolbar ? {} : props.style?.container),
            padding: showLineNumbers
              ? typeof padding === 'number'
                ? `${padding}px 0`
                : `${padding} 0`
              : padding,
          }}
        >
          {showLineNumbers ? (
            <LineNumbers
              className={props.className?.showLineNumbers}
              style={{
                gridColumn: 1,
                gridRow: '1 / -1',
                width: '4ch',
                padding: padding
                  ? typeof padding === 'number'
                    ? `0 ${padding}px`
                    : `0 ${padding}`
                  : undefined,
                ...props.style?.showLineNumbers,
              }}
            />
          ) : null}
          {isGridLayout ? (
            <div
              style={{
                gridRow: '1 / -1',
                gridColumn: showLineNumbers ? 2 : '1 / -1',
                ...(focusedLines
                  ? {
                      '--m0': `rgba(0, 0, 0, ${unfocusedLinesOpacity})`,
                      '--m1': 'rgba(0, 0, 0, 1)',
                      maskImage: imageMask,
                      width: 'max-content',
                    }
                  : {}),
              }}
            >
              <Tokens
                className={{
                  token: props.className?.token,
                  popover: props.className?.popover,
                }}
                style={{
                  token: props.style?.token,
                  popover: props.style?.popover,
                }}
              />
            </div>
          ) : (
            <Tokens
              className={{
                token: props.className?.token,
                popover: props.className?.popover,
              }}
              style={{
                token: props.style?.token,
                popover: props.style?.popover,
              }}
            />
          )}
          {highlightedLines ? (
            <LineHighlights
              style={{
                margin: showLineNumbers
                  ? undefined
                  : padding
                    ? typeof padding === 'number'
                      ? `0 -${padding}px`
                      : `0 -${padding}`
                    : undefined,
              }}
            />
          ) : null}
          {allowCopy !== false && !shouldRenderToolbar ? (
            <CopyButton
              value={metadata.value}
              style={{
                position: 'absolute',
                right: '1ch',
                top: padding,
              }}
            />
          ) : null}
        </pre>
      </Container>
    </Context>
  )
}
