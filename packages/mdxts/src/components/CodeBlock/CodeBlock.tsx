import React from 'react'
import 'server-only'

import { getThemeColors } from '../../index'
import { CopyButton } from '../CopyButton'
import { Tokens } from './Tokens'
import type { Languages } from './get-tokens'
import { getTokens } from './get-tokens'
import type { ContextValue } from './Context'
import { Context } from './Context'
import { LineNumbers } from './LineNumbers'
import { Toolbar } from './Toolbar'
import { parseSourceTextMetadata } from './parse-source-text-metadata'
import {
  generateFocusedLinesGradient,
  generateHighlightedLinesGradient,
} from './utils'

export type BaseCodeBlockProps = {
  /** Name or path of the code block. Ordered filenames will be stripped from the name e.g. `01.index.tsx` becomes `index.tsx`. */
  filename?: string

  /** Language of the source code. When used with `source`, the file extension will be used by default. */
  language?: Languages

  /** A string of comma separated lines and ranges to highlight e.g. `'1, 3-5, 7'`. */
  highlightedLines?: string

  /** A string of comma separated lines and ranges to focus e.g. `'6-8, 12'`. */
  focusedLines?: string

  /** Opacity of unfocused lines when using `focusedLines`. */
  unfocusedLinesOpacity?: number

  /** Show or hide a button that copies the source code to the clipboard. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide error diagnostics. */
  showErrors?: boolean

  /** Show or hide line numbers. */
  showLineNumbers?: boolean

  /** Show or hide the toolbar. */
  showToolbar?: boolean

  /** Path to the source file on disk in development and the git provider source in production. */
  sourcePath?: string | false

  /** Whether or not to attempt to fix broken imports. Useful for code using imports outside of the project. */
  fixImports?: boolean

  /** Class names to apply to code block elements. Use the `children` prop for full control of styling. */
  className?: {
    container?: string
    toolbar?: string
    lineNumbers?: string
    token?: string
    popover?: string
  }

  /** Styles to apply to code block elements. Use the `children` prop for full control of styling. */
  style?: {
    container?: React.CSSProperties
    toolbar?: React.CSSProperties
    lineNumbers?: React.CSSProperties
    token?: React.CSSProperties
    popover?: React.CSSProperties
  }

  /** Overrides default rendering to allow full control over styles using `CodeBlock` components like `Tokens`, `LineNumbers`, and `Toolbar`. */
  children?: React.ReactNode
}

export type CodeBlockProps =
  | ({
      /** Source code to highlight. */
      value: string
    } & BaseCodeBlockProps)
  | ({
      /** Path to the source file on disk to highlight. */
      source: string

      /** The working directory for the `source`. Added automatically when using `mdxts/loader`. */
      workingDirectory?: string
    } & BaseCodeBlockProps)

/** Renders a `pre` element with syntax highlighting, type information, and type checking. */
export async function CodeBlock({
  filename,
  language,
  highlightedLines,
  focusedLines,
  unfocusedLinesOpacity = 0.6,
  allowCopy,
  allowErrors,
  showErrors,
  showLineNumbers,
  showToolbar,
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
    showToolbar === undefined ? filename || hasSource || allowCopy : showToolbar
  )
  const highlightedLinesGradient = highlightedLines
    ? generateHighlightedLinesGradient(highlightedLines)
    : undefined
  const focusedLinesGradient = focusedLines
    ? generateFocusedLinesGradient(focusedLines)
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
            display: showLineNumbers ? 'grid' : undefined,
            gridTemplateColumns: showLineNumbers ? 'auto 1fr' : undefined,
            gridTemplateRows: showLineNumbers
              ? `repeat(${tokens.length}, 1lh)`
              : undefined,
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
            ...(highlightedLines
              ? {
                  '--h0': `rgba(0, 0, 0, 0)`,
                  '--h1': theme.editor.rangeHighlightBackground,
                  backgroundPosition: `0 ${padding}`,
                  backgroundImage: highlightedLinesGradient,
                }
              : {}),
            ...(focusedLines
              ? {
                  '--m0': `rgba(0, 0, 0, ${unfocusedLinesOpacity})`,
                  '--m1': 'rgba(0, 0, 0, 1)',
                  maskPosition: `0 ${padding}`,
                  maskImage: focusedLinesGradient,
                }
              : {}),
            ...(shouldRenderToolbar ? {} : props.style?.container),
            padding: typeof padding === 'number' ? `${padding}px` : padding,
            paddingLeft: showLineNumbers ? 0 : undefined,
          }}
        >
          {showLineNumbers ? (
            <>
              <LineNumbers
                className={props.className?.lineNumbers}
                style={{
                  gridColumn: 1,
                  gridRow: '1 / -1',
                  width: '4ch',
                  padding: padding
                    ? typeof padding === 'number'
                      ? `0 ${padding}px`
                      : `0 ${padding}`
                    : undefined,
                  backgroundImage: highlightedLines
                    ? highlightedLinesGradient
                    : undefined,
                  ...props.style?.lineNumbers,
                }}
              />
              <div
                style={{
                  gridRow: '1 / -1',
                  gridColumn: 2,
                  width: 'max-content',
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
            </>
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
