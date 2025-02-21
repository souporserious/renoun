import { join, posix } from 'node:path'
import type { bundledThemes } from 'shiki/bundle/web'
import type { Diagnostic, Project, SourceFile, ts } from 'ts-morph'
import tsMorph from 'ts-morph'

import type { Highlighter } from './create-highlighter.js'
import { getDiagnosticMessageText } from './get-diagnostic-message.js'
import { getLanguage, type Languages } from './get-language.js'
import { getRootDirectory } from './get-root-directory.js'
import { getThemeColors } from './get-theme.js'
import { getTrimmedSourceFileText } from './get-trimmed-source-file-text.js'
import { isJsxOnly } from './is-jsx-only.js'
import { loadConfig } from './load-config.js'
import { generatedFilenames } from './parse-source-text-metadata.js'
import { splitTokenByRanges } from './split-tokens-by-ranges.js'

const { Node, SyntaxKind } = tsMorph

export type Themes = keyof typeof bundledThemes

type Color = string

type ThemeTokenColor = {
  name?: string
  scope: string | string[]
  settings: {
    background?: Color
    foreground?: Color
    fontStyle?: 'italic' | 'bold' | 'underline'
  }
}

export type Theme = {
  name: string
  type: 'light' | 'dark' | 'hc'
  colors: {
    [element: string]: Color
  }
  tokenColors: ThemeTokenColor[]
}

export type TokenDiagnostic = {
  code: number
  message: string
}

export type Token = {
  value: string
  start: number
  end: number
  isBaseColor: boolean
  isSymbol: boolean
  isWhitespace: boolean
  diagnostics?: TokenDiagnostic[]
  quickInfo?: {
    displayText: string
    documentationText: string
  }
  style:
    | {
        color?: string
        fontStyle?: string
        fontWeight?: string
        textDecoration?: string
      }
    | {
        [property: `--${string}`]: string
      }
}

export type Tokens = Token[]

export type GetTokens = (
  value: string,
  language?: Languages,
  filename?: string,
  allowErrors?: string | boolean,
  showErrors?: boolean,
  sourcePath?: string | false
) => Promise<Tokens[]>

/** Converts a string of code to an array of highlighted tokens. */
export async function getTokens(
  project: Project,
  value: string,
  language: Languages = 'plaintext',
  filename?: string,
  allowErrors: string | boolean = false,
  showErrors: boolean = false,
  isInline: boolean = false,
  highlighter: Highlighter | null = null,
  sourcePath?: string | false
) {
  if (language === 'plaintext' || language === 'diff') {
    return [
      [
        {
          value,
          start: 0,
          end: value.length,
          isBaseColor: true,
          isWhitespace: false,
          isSymbol: false,
          style: {},
        } satisfies Token,
      ],
    ]
  }

  if (highlighter === null) {
    throw new Error(
      '[renoun] Highlighter was not initialized. Ensure that the highlighter is created before calling "getTokens".'
    )
  }

  const componentName = isInline ? 'CodeInline' : 'CodeBlock'
  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(language)
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(value) : false
  const sourceFile = filename ? project.getSourceFile(filename) : undefined
  const finalLanguage = getLanguage(language)
  const config = loadConfig()
  const theme = await getThemeColors()
  const sourceText = sourceFile ? getTrimmedSourceFileText(sourceFile) : value
  const themeNames =
    typeof config.theme === 'string'
      ? [config.theme]
      : Object.values(config.theme)
  let themedTokens: ReturnType<Highlighter['codeToTokens']>['tokens'][] = []

  try {
    for (const themeName of themeNames) {
      const result = highlighter.codeToTokens(sourceText, {
        theme: themeName,
        lang: finalLanguage,
      })
      themedTokens.push(result.tokens)
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `[renoun] Error highlighting the following source text${
          sourcePath ? ` at "${sourcePath}"` : ''
        } for language "${finalLanguage}":\n\n${sourceText}\n\nReceived the following error:\n\n${error.message}`,
        { cause: error }
      )
    }
  }

  const sourceFileDiagnostics = getDiagnostics(
    sourceFile,
    allowErrors,
    showErrors
  )
  const importSpecifiers =
    sourceFile && !jsxOnly
      ? sourceFile
          .getImportDeclarations()
          .map((importDeclaration) => importDeclaration.getModuleSpecifier())
      : []
  const identifiers = sourceFile
    ? sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
    : []
  const symbolRanges = [...importSpecifiers, ...identifiers]
    .filter((node) => {
      const parent = node.getParent()
      const isJsxOnlyImport = jsxOnly
        ? Node.isImportSpecifier(parent) || Node.isImportClause(parent)
        : false
      return (
        !isJsxOnlyImport && !Node.isJSDocTag(parent) && !Node.isJSDoc(parent)
      )
    })
    .map((node) => {
      // Offset module specifiers since they contain quotes which are tokenized separately
      // e.g. import React from 'react' -> ["'", "react", "'"]
      if (Node.isStringLiteral(node)) {
        return {
          start: node.getStart() + 1,
          end: node.getEnd() - 1,
        }
      }

      return {
        start: node.getStart(),
        end: node.getEnd(),
      }
    })
  const rootDirectory = getRootDirectory()
  const baseDirectory = process.cwd().replace(rootDirectory, '')
  const firstThemeTokens = themedTokens[0] || []
  let previousTokenStart = 0
  let parsedTokens: Token[][] = firstThemeTokens.map((line, lineIndex) => {
    // increment position for line breaks if the line is empty
    if (line.length === 0) {
      previousTokenStart += 1
    }

    return line.flatMap((baseToken, tokenIndex) => {
      const tokenStart = previousTokenStart
      const tokenEnd = tokenStart + baseToken.content.length
      const lastToken = tokenIndex === line.length - 1

      // account for newlines
      previousTokenStart = lastToken ? tokenEnd + 1 : tokenEnd

      let style: Record<string, string> = {}

      if (typeof config.theme === 'string') {
        if (baseToken.color) {
          style.color = baseToken.color
        }

        if (baseToken.fontStyle) {
          style = {
            ...style,
            ...getFontStyle(baseToken.fontStyle),
          }
        }
      } else {
        for (
          let themeIndex = 0;
          themeIndex < themedTokens.length;
          themeIndex++
        ) {
          const themeTokens = themedTokens[themeIndex]
          const currentToken = themeTokens[lineIndex][tokenIndex]

          const color = currentToken.color
          if (color) {
            style[`--${themeIndex}`] = color
          }

          const fontStyle = currentToken.fontStyle
          if (fontStyle) {
            const resolvedFontStyles = Object.values(getFontStyle(fontStyle))
            for (let index = 0; index < resolvedFontStyles.length; index++) {
              style[`--${themeIndex}${index}`] = resolvedFontStyles[index]
            }
          }
        }
      }

      const initialToken: Token = {
        value: baseToken.content,
        start: tokenStart,
        end: tokenEnd,
        isBaseColor: baseToken.color
          ? baseToken.color.toLowerCase() === theme.foreground.toLowerCase()
          : false,
        isWhitespace: baseToken.content.trim() === '',
        isSymbol: false,
        style,
      }

      // Split this token further if it intersects symbol ranges
      let processedTokens: Tokens = []

      if (symbolRanges.length) {
        const symbolRange = symbolRanges.find((range) => {
          return range.start >= tokenStart && range.end <= tokenEnd
        })
        const inFullRange = symbolRange
          ? symbolRange.start === tokenStart && symbolRange.end === tokenEnd
          : false

        if (symbolRange && !inFullRange) {
          processedTokens = splitTokenByRanges(initialToken, symbolRanges)
        } else {
          processedTokens.push({
            ...initialToken,
            isSymbol: inFullRange,
          })
        }
      } else {
        processedTokens.push(initialToken)
      }

      return processedTokens.map((token) => {
        if (!token.isSymbol) {
          return token
        }

        const diagnostics = sourceFileDiagnostics
          .filter((diagnostic) => {
            const start = diagnostic.getStart()
            const length = diagnostic.getLength()
            if (!start || !length) {
              return false
            }
            const end = start + length
            return token.start >= start && token.end <= end
          })
          .map((diagnostic) => ({
            code: diagnostic.getCode(),
            message: getDiagnosticMessageText(diagnostic.getMessageText()),
          }))
        const quickInfo =
          sourceFile && filename
            ? getQuickInfo(
                sourceFile,
                filename,
                token.start,
                rootDirectory,
                baseDirectory
              )
            : undefined

        return {
          ...token,
          quickInfo,
          diagnostics: diagnostics.length ? diagnostics : undefined,
        }
      })
    })
  })

  // Remove leading imports and whitespace for jsx only code blocks
  if (jsxOnly) {
    const firstJsxLineIndex = parsedTokens.findIndex((line) =>
      line.find((token) => token.value === '<')
    )
    if (firstJsxLineIndex > 0) {
      parsedTokens = parsedTokens.slice(firstJsxLineIndex)
    }
  }

  if (allowErrors === false && sourceFile && sourceFileDiagnostics.length > 0) {
    throwDiagnosticErrors(
      componentName,
      filename,
      sourceFile,
      sourceFileDiagnostics,
      parsedTokens,
      sourcePath
    )
  }

  return parsedTokens
}

/** Retrieves diagnostics from a source file. */
export function getDiagnostics(
  sourceFile: SourceFile | undefined,
  allowErrors?: string | boolean,
  showErrors?: boolean
): Diagnostic<ts.Diagnostic>[] {
  const allowedErrorCodes: number[] =
    typeof allowErrors === 'string'
      ? allowErrors.split(',').map((code) => parseInt(code, 10))
      : []

  if (!sourceFile) {
    return []
  }

  const diagnostics = sourceFile
    .getPreEmitDiagnostics()
    .filter((diagnostic) => diagnostic.getSourceFile())

  if (showErrors) {
    if (allowedErrorCodes.length > 0) {
      return diagnostics.filter((diagnostic) => {
        return allowedErrorCodes.includes(diagnostic.getCode())
      })
    }

    return diagnostics
  }

  if (allowErrors && allowedErrorCodes.length === 0) {
    return []
  }

  return diagnostics.filter((diagnostic) => {
    return !allowedErrorCodes.includes(diagnostic.getCode())
  })
}

/** Convert documentation entries to markdown-friendly links. */
function formatDocumentationText(documentation: ts.SymbolDisplayPart[]) {
  let markdownText = ''
  let currentLinkText = ''
  let currentLinkUrl = ''

  documentation.forEach((part) => {
    if (part.kind === 'text') {
      markdownText += part.text
    } else if (part.kind === 'linkText') {
      const [url, ...descriptionParts] = part.text.split(' ')
      currentLinkUrl = url
      currentLinkText = descriptionParts.join(' ') || url
    } else if (part.kind === 'link') {
      if (currentLinkUrl) {
        markdownText += `[${currentLinkText}](${currentLinkUrl})`
        currentLinkText = ''
        currentLinkUrl = ''
      }
    }
  })

  return markdownText
}

const quickInfoCache = new Map<
  string,
  { displayText: string; documentationText: string }
>()

/** Get the quick info a token */
function getQuickInfo(
  sourceFile: SourceFile,
  filename: string,
  tokenStart: number,
  rootDirectory: string,
  baseDirectory: string
) {
  const cacheKey = `${filename}:${tokenStart}`

  if (quickInfoCache.has(cacheKey)) {
    return quickInfoCache.get(cacheKey)
  }

  const quickInfo = sourceFile
    .getProject()
    .getLanguageService()
    .compilerObject.getQuickInfoAtPosition(filename, tokenStart)

  if (!quickInfo) {
    return
  }

  const displayParts = quickInfo.displayParts || []
  const displayText = displayParts
    .map((part) => part.text)
    .join('')
    // First, replace root directory to handle root node_modules
    .replaceAll(rootDirectory, '.')
    // Next, replace base directory for on-disk paths
    .replaceAll(baseDirectory, '')
    // Finally, replace the in-memory renoun directory
    .replaceAll('/renoun', '')
  const documentation = quickInfo.documentation || []
  const documentationText = formatDocumentationText(documentation)
  const result = {
    displayText,
    documentationText,
  }

  quickInfoCache.set(cacheKey, result)

  return result
}

const FontStyle = {
  Italic: 1,
  Bold: 2,
  Underline: 4,
  Strikethrough: 8,
}

function getFontStyle(fontStyle: number) {
  const style: {
    fontStyle?: 'italic'
    fontWeight?: 'bold'
    textDecoration?: 'underline' | 'line-through'
  } = {
    fontStyle: undefined,
    fontWeight: undefined,
    textDecoration: undefined,
  }
  if (fontStyle === FontStyle.Italic) {
    style['fontStyle'] = 'italic'
  }
  if (fontStyle === FontStyle.Bold) {
    style['fontWeight'] = 'bold'
  }
  if (fontStyle === FontStyle.Underline) {
    style['textDecoration'] = 'underline'
  }
  if (fontStyle === FontStyle.Strikethrough) {
    style['textDecoration'] = 'line-through'
  }
  return style
}

/** Converts tokens to plain text. */
function tokensToPlainText(tokens: Token[][]) {
  const lineNumberPadding = 4
  let plainText = ''
  let lineNumber = 1

  for (const line of tokens) {
    const paddedLineNumber = String(lineNumber).padStart(2, ' ')

    plainText += `${paddedLineNumber} `

    const anyLineDiagnostics = line.some(
      (token) => token.diagnostics && token.diagnostics.length > 0
    )

    if (anyLineDiagnostics) {
      plainText += '|'
    } else {
      plainText += ' '
    }

    let lineContent = ''
    const errorMarkers: { startIndex: number; tokenLength: number }[] = []

    for (const token of line) {
      lineContent += token.value

      if (token.diagnostics && token.diagnostics.length > 0) {
        const tokenLength = token.value.length ?? 1
        const startIndex = lineContent.length - token.value.length
        errorMarkers.push({ startIndex, tokenLength })
      }
    }

    plainText += `${lineContent}\n`

    if (errorMarkers.length > 0) {
      let errorLine = ' '.repeat(lineNumberPadding)
      for (const { startIndex, tokenLength } of errorMarkers) {
        while (errorLine.length < startIndex + lineNumberPadding) {
          errorLine += ' '
        }
        errorLine += '^'.repeat(tokenLength)
      }
      plainText += `${errorLine}\n`
    }

    lineNumber++
  }

  return plainText
}

/** Throws diagnostic errors, formatting them for display. */
function throwDiagnosticErrors(
  componentName: string,
  filename: string | undefined,
  sourceFile: SourceFile,
  diagnostics: Diagnostic[],
  tokens: Token[][],
  sourcePath?: string | false
) {
  const workingDirectory = join(process.cwd(), 'renoun', posix.sep)
  const formattedPath = generatedFilenames.has(filename!)
    ? ''
    : `for filename "${sourceFile.getFilePath().replace(workingDirectory, '')}"`
  const errorMessages = diagnostics.map((diagnostic) => {
    const message = getDiagnosticMessageText(diagnostic.getMessageText())
    const start = diagnostic.getStart()
    const code = diagnostic.getCode()

    if (!start) {
      return ` ⓧ ${message} ts(${code})`
    }

    const startLineAndCol = sourceFile.getLineAndColumnAtPos(start)

    return ` ⓧ ${message} ts(${code}) [Ln ${startLineAndCol.line}, Col ${startLineAndCol.column}]`
  })
  const formattedErrors = errorMessages.join('\n')
  const actionsToTake = `You can fix this error by taking one of the following actions:
  - Use the diagnostic ${errorMessages.length > 1 ? 'messages' : 'message'} above to identify and fix any issues in the ${componentName} component.
  - If type declarations are missing, ensure that the necessary types are installed and available in the targeted workspace.
  - Make sure "filename" is unique and does not conflict with other filenames in the same module. Prefix the filename with a number for progressive examples e.g. filename="01.${filename}".
  - If this error is expected for educational purposes or temporary migrations, pass the "allowErrors" prop to the ${componentName} component.
  - If you are unable to resolve this error, please file an issue at: https://github.com/souporserious/renoun/issues
  `
  const errorMessage = `${formattedErrors}\n\n${tokensToPlainText(tokens)}\n\n${actionsToTake}`

  throw new Error(
    `[renoun] ${componentName} type errors found ${
      sourcePath ? `at "${sourcePath}" ` : ''
    }${formattedPath}\n\n${errorMessage}\n\n`
  )
}
