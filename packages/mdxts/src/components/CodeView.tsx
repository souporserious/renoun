import React, { Fragment } from 'react'
import type { SourceFile } from 'ts-morph'

import { getTheme } from '../utils/get-theme'
import type { getHighlighter } from './highlighter'
import { Symbol } from './Symbol'
import { QuickInfo } from './QuickInfo'
import { QuickInfoProvider } from './QuickInfoProvider'
import { Pre } from './Pre'
import { Toolbar } from './CodeBlock/Toolbar'
import { getSymbolBounds } from './CodeBlock/get-symbol-bounds'

export type CodeProps = {
  /** Code snippet to be highlighted. */
  value: string

  /** Name of the file. */
  filename?: string

  /** Language of the code snippet. */
  language?: string

  /** Show or hide line numbers. */
  lineNumbers?: boolean

  /** Lines to highlight. */
  highlight?: string

  /** Show or hide the copy button. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide errors. */
  showErrors?: boolean

  /** The font size to apply to the code block. */
  fontSize?: string

  /** The line height to apply to the code block. */
  lineHeight?: string

  /** Padding to apply to the code block. */
  padding?: string

  /** Horizontal padding to apply to the code block. */
  paddingHorizontal?: string

  /** Vertical padding to apply to the code block. */
  paddingVertical?: string

  /** Whether or not to show the toolbar. */
  toolbar?: boolean

  /** Class name to apply to the code block. */
  className?: string

  /** Style to apply to the code block. */
  style?: React.CSSProperties
}

/** Renders a code block with syntax highlighting. */
export function CodeView({
  row,
  tokens,
  lineNumbers,
  sourceFile,
  sourcePath,
  filename,
  filenameLabel,
  highlight,
  highlighter,
  language,
  showErrors,
  className,
  isJsxOnly = false,
  shouldRenderFilename,
  rootDirectory,
  baseDirectory,
  edit,
  value,
  fontSize = '1rem',
  lineHeight = '1.4rem',
  padding = '1rem',
  paddingHorizontal = padding,
  paddingVertical = padding,
  allowErrors,
  allowCopy,
  toolbar,
  style,
}: CodeProps & {
  filenameLabel?: string
  row?: number[] | null
  // tokens: ReturnType<Awaited<ReturnType<typeof getHighlighter>>>
  tokens: any[][]
  sourceFile?: SourceFile
  sourcePath?: string
  highlighter: any
  isJsxOnly?: boolean
  shouldRenderFilename?: boolean
  rootDirectory?: string
  baseDirectory?: string
  edit?: any
}) {
  const theme = getTheme()
  const shouldRenderToolbar = toolbar
    ? shouldRenderFilename || allowCopy
    : false
  const editorForegroundColor = theme.colors['editor.foreground'].toLowerCase()
  const symbolBounds = sourceFile ? getSymbolBounds(sourceFile, isJsxOnly) : []
  const allowedErrorCodes =
    typeof allowErrors === 'string'
      ? allowErrors.split(',').map((code) => parseInt(code))
      : []
  const diagnostics =
    allowedErrorCodes.length === 0 && allowErrors
      ? []
      : sourceFile
        ? getDiagnostics(sourceFile).filter(
            (diagnostic) => !allowedErrorCodes.includes(diagnostic.getCode())
          )
        : []
  const Element = 'div'
  const Container = (props: Record<string, unknown>) => (
    <Element
      style={{
        fontFamily: 'monospace',
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gridTemplateRows: shouldRenderToolbar ? 'auto 1fr' : '0 1fr',
        borderRadius: 5,
        boxShadow: `0 0 0 1px ${theme.colors['panel.border']}70`,
        backgroundColor: theme.colors['editor.background'],
        color: theme.colors['editor.foreground'],
        ...style,
      }}
      {...props}
    />
  )

  return (
    <Container>
      {shouldRenderToolbar ? (
        <Toolbar
          allowCopy={allowCopy}
          filename={shouldRenderFilename ? filenameLabel : undefined}
          value={value}
          sourcePath={sourcePath}
        />
      ) : null}

      <Pre
        fontSize={fontSize}
        lineHeight={lineHeight}
        className={className}
        style={{ gridRow: filename ? 2 : 1 }}
      >
        <QuickInfoProvider>
          <Element
            style={{
              display: 'block',
              paddingTop: paddingVertical,
              paddingBottom: paddingVertical,
              paddingLeft: paddingHorizontal,
              paddingRight: paddingHorizontal,
              overflow: 'auto',
            }}
          >
            {tokens.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {line.map((token, tokenIndex) => {
                  const isForegroundColor = token.color
                    ? token.color.toLowerCase() === editorForegroundColor
                    : false
                  const isWhitespace = token.content.trim() === ''
                  const bounds = symbolBounds.find(
                    (bounds) =>
                      bounds.start === token.start &&
                      bounds.width === token.end - token.start
                  )
                  if (bounds && filename && language) {
                    const tokenDiagnostics = diagnostics.filter(
                      (diagnostic) => {
                        const start = diagnostic.getStart()
                        const length = diagnostic.getLength()
                        if (!start || !length) {
                          return false
                        }
                        const end = start + length
                        return start <= token.start && token.end <= end
                      }
                    )
                    const diagnosticStyle = {
                      backgroundImage: `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23f14c4c'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
                      backgroundRepeat: 'repeat-x',
                      backgroundPosition: 'bottom left',
                    }

                    return (
                      <span
                        key={tokenIndex}
                        style={{
                          ...token.fontStyle,
                          ...(tokenDiagnostics.length && diagnosticStyle),
                          position: 'relative',
                          color: isForegroundColor ? undefined : token.color,
                        }}
                      >
                        {token.content}
                        <Symbol
                          highlightColor={
                            theme.colors['editor.hoverHighlightBackground']
                          }
                        >
                          <QuickInfo
                            position={token.start}
                            filename={filename}
                            highlighter={highlighter}
                            language={language}
                            diagnostics={tokenDiagnostics}
                            edit={edit}
                            rootDirectory={rootDirectory}
                            baseDirectory={baseDirectory}
                          />
                        </Symbol>
                      </span>
                    )
                  }

                  if (isForegroundColor || isWhitespace) {
                    return token.content
                  }

                  return (
                    <span
                      key={tokenIndex}
                      style={{ ...token.fontStyle, color: token.color }}
                    >
                      {token.content}
                    </span>
                  )
                })}
                {lineIndex === tokens.length - 1 ? null : '\n'}
              </Fragment>
            ))}
          </Element>
        </QuickInfoProvider>
      </Pre>
    </Container>
  )
}

/** Get the diagnostics for a source file. */
function getDiagnostics(sourceFile: SourceFile) {
  // if no imports/exports are found, add an empty export to ensure the file is a module
  const hasImports = sourceFile.getImportDeclarations().length > 0
  const hasExports = sourceFile.getExportDeclarations().length > 0

  if (!hasImports && !hasExports) {
    sourceFile.addExportDeclaration({})
  }

  const diagnostics = sourceFile.getPreEmitDiagnostics()

  // remove the empty export
  if (!hasImports && !hasExports) {
    sourceFile.getExportDeclarations().at(0)!.remove()
  }

  return diagnostics
}
