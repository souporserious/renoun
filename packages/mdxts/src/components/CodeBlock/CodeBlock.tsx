import React, { Fragment } from 'react'

import { getSourcePath } from '../../utils/get-source-path'
import { Tokens } from '../Tokens/Tokens'
import { getTokens } from '../Tokens/get-tokens'
import { getTheme } from '../Tokens/get-theme'
import { Toolbar } from './Toolbar'
import { LineHighlights } from './LineHighlights'
import { LineNumbers } from './LineNumbers'
import { parseSourceTextMetadata } from './parse-source-text-metadata'

export type BaseCodeBlockProps = {
  /** Name of the file. */
  filename?: string

  /** Language of the source text. */
  language: string

  /** A string of comma separated lines and ranges to highlight. */
  highlight?: string

  /** Show or hide line numbers. */
  lineNumbers?: boolean

  /** Whether or not to render the toolbar with the filename and optional copy button. */
  toolbar?: boolean

  /** Show or hide the copy button in the toolbar. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide errors. */
  showErrors?: boolean

  /** Class name to apply to the code block. */
  className?: string

  /** Style to apply to the code block. */
  style?: React.CSSProperties
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
  source,
  value,
  highlight,
  lineNumbers,
  allowCopy,
  toolbar = true,
  className,
  style,
  ...props
}: any) {
  const { sourcePath, sourcePathLine, sourcePathColumn } =
    props as PrivateCodeBlockProps
  const options: any = {}

  if (value) {
    options.value = value
  } else if (source) {
    options.source = source
    options.workingDirectory = props.workingDirectory
  }

  const metadata = await parseSourceTextMetadata({
    filename,
    language,
    ...options,
  })
  const theme = await getTheme()
  const tokens = await getTokens(
    metadata.value,
    metadata.language,
    metadata.filename
  )
  const shouldRenderFilename = Boolean(filename)
  const shouldRenderToolbar = toolbar
    ? shouldRenderFilename || allowCopy
    : false
  const Container = shouldRenderToolbar ? 'div' : Fragment
  const containerProps = shouldRenderToolbar
    ? {
        style: {
          backgroundColor: theme.background,
          color: theme.foreground,
          borderRadius: 5,
          boxShadow: `0 0 0 1px ${theme.colors['panel.border']}70`,
        },
      }
    : {}
  const padding = '1ch'

  return (
    <Container {...containerProps}>
      {shouldRenderToolbar ? (
        <Toolbar
          allowCopy={allowCopy}
          filename={shouldRenderFilename ? metadata.filenameLabel : undefined}
          value={metadata.value}
          sourcePath={
            sourcePath
              ? getSourcePath(sourcePath, sourcePathLine, sourcePathColumn)
              : undefined
          }
          style={{ padding }}
        />
      ) : null}
      <pre
        className={className}
        style={{
          display: shouldRenderToolbar ? undefined : 'flex',
          padding: shouldRenderToolbar ? padding : 0,
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
          ...style,
        }}
      >
        {lineNumbers ? (
          <LineNumbers
            tokens={tokens}
            highlightRanges={highlight}
            style={{ width: '4ch', padding }}
          />
        ) : null}
        {lineNumbers ? (
          <div style={{ flex: 1, padding }}>
            <Tokens tokens={tokens} />
            {highlight ? (
              <LineHighlights
                highlightRanges={highlight}
                // style={{ minWidth: `calc(4ch + ${maxLineLength} * 1ch)` }}
              />
            ) : null}
          </div>
        ) : (
          <Tokens tokens={tokens} />
        )}
        {!lineNumbers && highlight ? (
          <LineHighlights
            highlightRanges={highlight}
            // style={{ minWidth: `calc(4ch + ${maxLineLength} * 1ch)` }}
          />
        ) : null}
      </pre>
    </Container>
  )
}
