import React from 'react'

import { Tokens } from './Tokens'
import type { Languages } from './get-tokens'
import { getTokens } from './get-tokens'
import { Context } from './Context'
import { Pre } from './Pre'
import { parseSourceTextMetadata } from './parse-source-text-metadata'

export type BaseCodeBlockProps = {
  /** Name of the file. */
  filename?: string

  /** Language of the source code. When using `source`, the file extension will be used by default. */
  language?: Languages

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide errors. */
  showErrors?: boolean

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
  ...props
}: CodeBlockProps) {
  const { sourcePath } = props as PrivateCodeBlockProps
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
    metadata.filename
  )
  const padding = 'style' in props ? props.style?.padding ?? '1ch' : '1ch'

  if ('children' in props) {
    return (
      <Context
        value={{
          value: metadata.value,
          filenameLabel: metadata.filenameLabel,
          sourcePath,
          tokens,
          padding,
        }}
      >
        {props.children}
      </Context>
    )
  }

  const { className, style } = props as {
    className?: string
    style: React.CSSProperties
  }

  return (
    <Pre className={className} style={{ padding, ...style }}>
      <Tokens tokens={tokens} />
    </Pre>
  )
}
