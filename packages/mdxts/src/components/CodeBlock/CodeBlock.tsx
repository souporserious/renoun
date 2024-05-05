import React from 'react'
import 'server-only'

import { getThemeColors } from '../../index'
import { CopyButton } from '../CopyButton'
import { Tokens } from './Tokens'
import type { Languages } from './get-tokens'
import { getTokens } from './get-tokens'
import { Context } from './Context'
import { LineHighlights } from './LineHighlights'
import { LineNumbers } from './LineNumbers'
import { Toolbar } from './Toolbar'
import { parseSourceTextMetadata } from './parse-source-text-metadata'

export type BaseCodeBlockProps = {
  /** Name of the file. */
  filename?: string

  /** Language of the source code. When using `source`, the file extension will be used by default. */
  language?: Languages

  /** Show or hide line numbers. */
  lineNumbers?: boolean

  /** A string of comma separated lines and ranges to highlight. */
  lineHighlights?: string

  /** Whether or not to show the toolbar. */
  toolbar?: boolean

  /** Show or hide a button that copies the source code to the clipboard. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Whether or not to show error diagnostics. */
  showErrors?: boolean

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
  lineNumbers,
  lineHighlights,
  toolbar,
  allowCopy,
  allowErrors,
  showErrors,
  fixImports,
  sourcePath,
  ...props
}: CodeBlockProps) {
  const padding = props.style?.container?.padding ?? '1ch'
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
    highlight: lineHighlights,
    padding,
    sourcePath,
    tokens,
  }

  if ('children' in props) {
    return <Context value={contextValue}>{props.children}</Context>
  }

  const theme = await getThemeColors()
  const shouldRenderToolbar = Boolean(
    toolbar === undefined ? filename || hasSource || allowCopy : toolbar
  )
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
            display: lineNumbers || lineHighlights ? 'grid' : undefined,
            gridTemplateColumns:
              lineNumbers || lineHighlights ? 'auto 1fr' : undefined,
            gridTemplateRows:
              lineNumbers || lineHighlights
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
            padding: lineNumbers
              ? typeof padding === 'number'
                ? `${padding}px 0`
                : `${padding} 0`
              : padding,
          }}
        >
          {lineNumbers ? (
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
                ...props.style?.lineNumbers,
              }}
            />
          ) : null}
          {lineNumbers || lineHighlights ? (
            <div
              style={{
                gridRow: '1 / -1',
                gridColumn: lineNumbers ? 2 : '1 / -1',
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
          {lineHighlights ? (
            <LineHighlights
              style={{
                margin: lineNumbers
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
