import React from 'react'

import { getTheme } from '../../index'
import { getSourcePath } from '../../utils/get-source-path'
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
  highlight?: string

  /** Whether or not to show the toolbar. */
  toolbar?: boolean

  /** Show or hide a button that copies the source code to the clipboard. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Class name to apply to the code block. */
  className?: string

  /** Style to apply to the code block. */
  style?: React.CSSProperties

  /** Accepts `CodeBlock` components including valid React nodes. */
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

/** Private props provided to the CodeBlock component by the remark plugin. */
type PrivateCodeBlockProps = Partial<{
  sourcePath: string
  sourcePathLine: number
  sourcePathColumn: number
}>

export async function CodeBlock({
  filename,
  language,
  lineNumbers,
  highlight,
  toolbar,
  allowCopy,
  allowErrors,
  ...props
}: CodeBlockProps) {
  const { sourcePath, sourcePathLine, sourcePathColumn } =
    props as PrivateCodeBlockProps
  const padding = 'style' in props ? props.style?.padding ?? '1ch' : '1ch'
  const options: any = {}

  if ('value' in props) {
    options.value = props.value
  } else if ('source' in props) {
    options.source = props.source
    options.workingDirectory = props.workingDirectory
  }

  const metadata = await parseSourceTextMetadata({
    filename,
    language,
    ...options,
  })
  const tokens = await getTokens(
    metadata.value,
    metadata.language,
    metadata.filename,
    allowErrors
  )
  const contextValue = {
    value: metadata.value,
    filenameLabel: metadata.filenameLabel,
    sourcePath: sourcePath
      ? getSourcePath(sourcePath, sourcePathLine, sourcePathColumn)
      : undefined,
    tokens,
    highlight,
    padding,
  }

  if ('children' in props) {
    return <Context value={contextValue}>{props.children}</Context>
  }

  const theme = getTheme()
  const shouldRenderFilename = Boolean(filename)
  const shouldRenderToolbar = toolbar
    ? shouldRenderFilename || allowCopy
    : false
  const Container = shouldRenderToolbar ? 'div' : React.Fragment
  const containerProps = shouldRenderToolbar
    ? {
        style: {
          backgroundColor: theme.background,
          color: theme.foreground,
          borderRadius: 5,
          boxShadow: `0 0 0 1px ${theme.colors['panel.border']}70`,
          ...props.style,
        },
      }
    : {}

  return (
    <Context value={contextValue}>
      <Container {...containerProps}>
        {shouldRenderToolbar ? (
          <Toolbar allowCopy={allowCopy} style={{ padding }} />
        ) : null}
        <pre
          className={props.className}
          style={{
            padding: lineNumbers ? 0 : padding,
            display: lineNumbers ? 'flex' : undefined,
            lineHeight: 1.4,
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            overflow: 'auto',
            position: 'relative',
            backgroundColor: shouldRenderToolbar ? undefined : theme.background,
            color: shouldRenderToolbar ? undefined : theme.foreground,
            borderRadius: shouldRenderToolbar ? undefined : 5,
            boxShadow: shouldRenderToolbar
              ? undefined
              : `0 0 0 1px ${theme.colors['panel.border']}70`,
            ...(shouldRenderToolbar ? {} : props.style),
          }}
        >
          {lineNumbers ? (
            <LineNumbers style={{ width: '4ch', padding }} />
          ) : null}
          {lineNumbers ? (
            <div style={{ flex: 1, padding }}>
              <Tokens />
              {highlight ? <LineHighlights /> : null}
            </div>
          ) : (
            <Tokens />
          )}
          {!lineNumbers && highlight ? (
            <LineHighlights offsetTop={padding} />
          ) : null}
        </pre>
      </Container>
    </Context>
  )
}
