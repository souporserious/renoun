import React from 'react'
import 'server-only'

import { getThemeColors } from '../../index'
import { CopyButton } from './CopyButton'
import { Tokens } from './Tokens'
import type { Languages } from './get-tokens'
import { getTokens } from './get-tokens'
import type { ContextValue } from './Context'
import { Context } from './Context'
import { CopyButtonContextProvider } from './contexts'
import { LineNumbers } from './LineNumbers'
import { Pre } from './Pre'
import { Toolbar } from './Toolbar'
import { parseSourceTextMetadata } from './parse-source-text-metadata'
import {
  generateFocusedLinesGradient,
  generateHighlightedLinesGradient,
} from './utils'

/** @internal */
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

/** @internal */
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
export async function CodeBlock(props: CodeBlockProps) {
  const {
    filename,
    language,
    highlightedLines,
    focusedLines,
    unfocusedLinesOpacity = 0.5,
    allowCopy,
    allowErrors,
    showErrors,
    showLineNumbers,
    showToolbar,
    sourcePath,
    ...restProps
  } = props
  const padding = restProps.style?.container?.padding ?? '0.5lh'
  const hasValue = 'value' in restProps
  const hasSource = 'source' in restProps
  const options: any = {}

  if (hasValue) {
    options.value = restProps.value
  } else if (hasSource) {
    options.source = restProps.source
    options.workingDirectory = restProps.workingDirectory
  }

  const metadata = await parseSourceTextMetadata({
    filename,
    language,
    allowErrors,
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

  if ('children' in restProps) {
    return (
      <Context value={contextValue}>
        <CopyButtonContextProvider value={metadata.value}>
          {restProps.children}
        </CopyButtonContextProvider>
      </Context>
    )
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
        className: restProps.className?.container,
        style: {
          backgroundColor: theme.background,
          color: theme.foreground,
          borderRadius: 5,
          boxShadow: `0 0 0 1px ${theme.panel.border}`,
          ...restProps.style?.container,
          padding: 0,
        } satisfies React.CSSProperties,
      }
    : {}
  const sharedCodeStyles = {
    gridRow: '1 / -1',
    display: 'block',
    width: 'max-content',
    padding,
  } satisfies React.CSSProperties

  return (
    <Context value={contextValue}>
      <Container {...containerProps}>
        {shouldRenderToolbar ? (
          <Toolbar
            allowCopy={allowCopy === undefined ? Boolean(filename) : allowCopy}
            className={restProps.className?.toolbar}
            style={{ padding, ...restProps.style?.toolbar }}
          />
        ) : null}
        <Pre
          className={
            shouldRenderToolbar ? undefined : restProps.className?.container
          }
          style={{
            position: 'relative',
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            display: 'grid',
            gridTemplateColumns: showLineNumbers ? 'auto 1fr' : undefined,
            margin: 0,
            overflow: 'auto',
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
            ...(shouldRenderToolbar ? {} : restProps.style?.container),
            padding: 0,
          }}
        >
          {showLineNumbers ? (
            <>
              <LineNumbers
                className={restProps.className?.lineNumbers}
                style={{
                  padding,
                  gridColumn: 1,
                  gridRow: '1 / -1',
                  width: '4ch',
                  backgroundPosition: 'inherit',
                  backgroundImage: 'inherit',
                  ...restProps.style?.lineNumbers,
                }}
              />
              <code
                style={{
                  ...sharedCodeStyles,
                  gridColumn: 2,
                  paddingLeft: 0,
                }}
              >
                <Tokens
                  className={{
                    token: restProps.className?.token,
                    popover: restProps.className?.popover,
                  }}
                  style={{
                    token: restProps.style?.token,
                    popover: restProps.style?.popover,
                  }}
                />
              </code>
            </>
          ) : (
            <code
              style={{
                ...sharedCodeStyles,
                gridColumn: 1,
              }}
            >
              <Tokens
                className={{
                  token: restProps.className?.token,
                  popover: restProps.className?.popover,
                }}
                style={{
                  token: restProps.style?.token,
                  popover: restProps.style?.popover,
                }}
              />
            </code>
          )}
          {allowCopy !== false && !shouldRenderToolbar ? (
            <CopyButton
              css={{
                placeSelf: 'start end',
                gridColumn: showLineNumbers ? 2 : 1,
                gridRow: '1 / -1',
                position: 'sticky',
                top: padding,
                right: padding,
                boxShadow: `0 0 0 1px ${theme.panel.border}`,
                backgroundColor: theme.activityBar.background,
                color: theme.activityBar.foreground,
                borderRadius: 5,
              }}
              value={metadata.value}
            />
          ) : null}
        </Pre>
      </Container>
    </Context>
  )
}
