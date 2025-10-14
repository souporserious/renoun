import { join, posix } from 'node:path'
import type { Diagnostic, Project, SourceFile, ts } from 'ts-morph'
import tsMorph from 'ts-morph'

import type { ConfigurationOptions } from '../components/Config/types.js'
import type { Languages as TextMateLanguages } from '../grammars/index.js'
import type { Highlighter } from './create-highlighter.js'
import { getDebugLogger } from './debug.js'
import { getDiagnosticMessageText } from './get-diagnostic-message.js'
import { getLanguage, type Languages } from './get-language.js'
import { getRootDirectory } from './get-root-directory.js'
import { isJsxOnly } from './is-jsx-only.js'
import { generatedFilenames } from './get-source-text-metadata.js'
import { splitTokenByRanges } from './split-tokens-by-ranges.js'

const { Node, SyntaxKind } = tsMorph

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
  hasTextStyles: boolean
  isBaseColor: boolean
  isDeprecated: boolean
  isSymbol: boolean
  isWhiteSpace: boolean
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

export type TokenizedLines = Tokens[]

export interface GetTokensOptions {
  project: Project
  value: string
  language?: Languages
  filePath?: string
  allowErrors?: boolean | string
  showErrors?: boolean
  highlighter: Highlighter | null
  sourcePath?: string | false
  theme: ConfigurationOptions['theme']
}

/** Converts a string of code to an array of highlighted tokens. */
export async function getTokens({
  project,
  value,
  language = 'plaintext',
  filePath,
  allowErrors,
  showErrors,
  highlighter = null,
  theme: themeConfig,
}: GetTokensOptions): Promise<TokenizedLines> {
  return getDebugLogger().trackTokenProcessing(
    language,
    filePath,
    value.length,
    async () => {
      if (
        language === 'plaintext' ||
        language === 'text' ||
        language === 'txt' ||
        language === 'diff' // TODO: add support for diff highlighting
      ) {
        return [
          [
            {
              value,
              start: 0,
              end: value.length,
              hasTextStyles: false,
              isBaseColor: true,
              isDeprecated: false,
              isWhiteSpace: false,
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

      const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
        language
      )
      const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(value) : false
      const finalLanguage = getLanguage(language)

      let themeNames: string[] =
        typeof themeConfig === 'string'
          ? [themeConfig]
          : themeConfig
            ? (Object.values(themeConfig) as Array<string | [string, any]>).map(
                (themeVariant) =>
                  typeof themeVariant === 'string'
                    ? themeVariant
                    : themeVariant[0]
              )
            : []

      // Fallback to the built-in default theme when none is configured
      if (themeNames.length === 0) {
        themeNames = ['default']
      }

      // Track highlighter performance
      const tokens = await getDebugLogger().trackOperation(
        'highlighter',
        async () => {
          return await highlighter(
            value,
            finalLanguage as TextMateLanguages,
            themeNames
          )
        },
        {
          data: {
            language: finalLanguage,
            valueLength: value.length,
            themeCount: themeNames.length,
          },
        }
      )

      const sourceFile = filePath ? project.getSourceFile(filePath) : undefined

      const sourceFileDiagnostics = getDiagnostics(
        sourceFile,
        allowErrors,
        showErrors
      )

      const importSpecifiers =
        sourceFile && !jsxOnly
          ? sourceFile
              .getImportDeclarations()
              .map((importDeclaration) =>
                importDeclaration.getModuleSpecifier()
              )
          : []
      const identifiers = sourceFile
        ? sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
        : []

      const suggestionDiagnostics = sourceFile
        ? project
            .getLanguageService()
            .compilerObject.getSuggestionDiagnostics(sourceFile.getFilePath())
        : []
      const deprecatedRanges = suggestionDiagnostics
        .filter(
          (diagnostic) =>
            (diagnostic.reportsDeprecated || diagnostic.code === 6385) &&
            diagnostic.start !== undefined
        )
        .map((diagnostic) => ({
          start: diagnostic.start,
          end: diagnostic.start + (diagnostic.length ?? 0),
        }))

      const symbolMetadata = [...importSpecifiers, ...identifiers]
        .filter((node) => {
          const parent = node.getParent()
          const isJsxOnlyImport = jsxOnly
            ? Node.isImportSpecifier(parent) || Node.isImportClause(parent)
            : false
          return (
            !isJsxOnlyImport &&
            !Node.isJSDocTag(parent) &&
            !Node.isJSDoc(parent)
          )
        })
        .map((node) => {
          let start = node.getStart()
          let end = node.getEnd()

          // Offset module specifiers since they contain quotes which are tokenized separately
          // e.g. import React from 'react' -> ["'", "react", "'"]
          if (Node.isStringLiteral(node)) {
            start += 1
            end -= 1
          }

          const isDeprecated = deprecatedRanges.some(
            (range) => range.start === start && range.end === end
          )

          return {
            start: node.getStart(),
            end: node.getEnd(),
            isDeprecated,
          }
        })

      const rootDirectory = getRootDirectory()
      const baseDirectory = process.cwd().replace(rootDirectory, '')
      let previousTokenStart = 0
      let parsedTokens: Token[][] = tokens.map((line) => {
        // increment position for line breaks if the line is empty
        if (line.length === 0) {
          previousTokenStart += 1
        }

        return line.flatMap((baseToken, tokenIndex) => {
          const tokenStart = previousTokenStart
          const tokenEnd = tokenStart + baseToken.value.length
          const lastToken = tokenIndex === line.length - 1

          // account for newlines
          previousTokenStart = lastToken ? tokenEnd + 1 : tokenEnd

          const initialToken: Token = {
            value: baseToken.value,
            start: tokenStart,
            end: tokenEnd,
            hasTextStyles: baseToken.hasTextStyles,
            isBaseColor: baseToken.isBaseColor,
            isWhiteSpace: baseToken.isWhiteSpace,
            isDeprecated: false,
            isSymbol: false,
            style: baseToken.style,
          }

          // Split this token further if it intersects symbol ranges
          let processedTokens: Tokens = []

          if (symbolMetadata.length) {
            const symbol = symbolMetadata.find((range) => {
              return range.start >= tokenStart && range.end <= tokenEnd
            })
            const inFullRange = symbol
              ? symbol.start === tokenStart && symbol.end === tokenEnd
              : false

            if (symbol) {
              initialToken.isDeprecated = symbol.isDeprecated
            }

            if (symbol && !inFullRange) {
              processedTokens = splitTokenByRanges(initialToken, symbolMetadata)
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
              sourceFile && filePath
                ? getQuickInfo(
                    sourceFile,
                    filePath,
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

      if (
        allowErrors === false &&
        sourceFile &&
        sourceFileDiagnostics.length > 0
      ) {
        throwDiagnosticErrors(
          filePath,
          sourceFile,
          sourceFileDiagnostics,
          parsedTokens
        )
      }

      // Log summary statistics for performance monitoring
      const totalTokens = parsedTokens.reduce(
        (sum: number, line: Token[]) => sum + line.length,
        0
      )

      getDebugLogger().logTokenProcessing(
        finalLanguage,
        filePath,
        value.length,
        parsedTokens.length,
        totalTokens,
        symbolMetadata.length,
        sourceFileDiagnostics.length
      )

      return parsedTokens
    }
  )
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

interface QuickInfoEntry {
  displayText: string
  documentationText: string
}

const quickInfoCache = new Map<string, QuickInfoEntry>()
const MAX_QUICK_INFO_CACHE_SIZE = 2000

/** Get the quick info a token */
function getQuickInfo(
  sourceFile: SourceFile,
  filePath: string,
  tokenStart: number,
  rootDirectory: string,
  baseDirectory: string
) {
  const cacheKey = `${filePath}:${tokenStart}`
  const cachedQuickInfo = getCachedQuickInfo(cacheKey)

  if (cachedQuickInfo) {
    return cachedQuickInfo
  }

  const quickInfo = sourceFile
    .getProject()
    .getLanguageService()
    .compilerObject.getQuickInfoAtPosition(filePath, tokenStart)

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
  const result: QuickInfoEntry = {
    displayText,
    documentationText,
  }

  setCachedQuickInfo(cacheKey, result)

  return result
}

function getCachedQuickInfo(cacheKey: string) {
  const cachedQuickInfo = quickInfoCache.get(cacheKey)

  if (!cachedQuickInfo) {
    return undefined
  }

  // Maintain LRU ordering by re-inserting the entry at the end of the map
  quickInfoCache.delete(cacheKey)
  quickInfoCache.set(cacheKey, cachedQuickInfo)

  return cachedQuickInfo
}

function setCachedQuickInfo(cacheKey: string, value: QuickInfoEntry) {
  if (
    MAX_QUICK_INFO_CACHE_SIZE !== Number.POSITIVE_INFINITY &&
    quickInfoCache.size >= MAX_QUICK_INFO_CACHE_SIZE
  ) {
    const leastRecentlyUsedEntry = quickInfoCache.keys().next()

    if (!leastRecentlyUsedEntry.done) {
      quickInfoCache.delete(leastRecentlyUsedEntry.value)
    }
  }

  quickInfoCache.set(cacheKey, value)
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
  fileName: string | undefined,
  sourceFile: SourceFile,
  diagnostics: Diagnostic[],
  tokens: Token[][]
) {
  const workingDirectory = join(process.cwd(), 'renoun', posix.sep)
  const formattedPath = generatedFilenames.has(fileName!)
    ? ''
    : `for file path "${sourceFile.getFilePath().replace(workingDirectory, '')}"`
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
  - Use the diagnostic ${errorMessages.length > 1 ? 'messages' : 'message'} above to identify and fix any issues.
  - If type declarations are missing, ensure that the necessary types are installed and available in the targeted workspace.
  - Make sure the "path" is unique and does not conflict with other file paths in the same project. Prefix the file name with a number for progressive examples e.g. path="01.${fileName}".
  - If this error is expected for educational purposes or temporary migrations, pass the "allowErrors" prop to the component.
  - If you are unable to resolve this error, please file an issue at: https://github.com/souporserious/renoun/issues
  `
  const errorMessage = `${formattedErrors}\n\n${tokensToPlainText(tokens)}\n\n${actionsToTake}`

  throw new Error(
    `[renoun] Type errors found when rendering Tokens component for ${formattedPath}\n\n${errorMessage}\n\n`
  )
}
