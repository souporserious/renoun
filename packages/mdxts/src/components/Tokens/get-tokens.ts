import TextmateHighlighter from 'textmate-highlighter'
import type { TextMateThemeRaw } from 'textmate-highlighter/dist/types'
import type { SourceFile, Diagnostic, ts } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'
import type { IRawGrammar } from 'vscode-textmate'
import jsGrammar from 'tm-grammars/grammars/javascript.json'
import jsxGrammar from 'tm-grammars/grammars/jsx.json'
import tsGrammar from 'tm-grammars/grammars/typescript.json'
import tsxGrammar from 'tm-grammars/grammars/tsx.json'
import shGrammar from 'tm-grammars/grammars/shellscript.json'
import nightOwlTheme from 'tm-themes/themes/night-owl.json'

import { isJsxOnly } from '../../utils/is-jsx-only'
import { project } from '../project'
import { getTheme } from './get-theme'
import { memoize } from './utils'
import type { TokenProps } from './types'

const languageMap = {
  mjs: 'js',
  javascript: 'js',
  typescript: 'ts',
  shellscript: 'sh',
}

const grammarMap = {
  mjs: 'javascript',
  js: 'javascript',
  ts: 'typescript',
  sh: 'shellscript',
}

type GrammarMapKey = keyof typeof grammarMap

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

export type Token = {
  value: string
  start: number
  end: number
  color?: string
  fontStyle?: string
  fontWeight?: string
  textDecoration?: string
  isBaseColor: boolean
  isWhitespace: boolean
  quickInfo?: { displayText: string; documentationText: string }
  diagnostics?: Diagnostic[]
}

export type Tokens = Token[]

export type GetTokens = (
  value: string,
  language: string,
  filename?: string,
  allowErrors?: string | boolean
) => Promise<Tokens[]>

let highlighter: TextmateHighlighter | null = null

/** Converts a string of code to an array of highlighted tokens. */
export const getTokens: GetTokens = memoize(async function getTokens(
  value: string,
  language: string,
  filename?: string,
  allowErrors?: string | boolean
) {
  if (highlighter === null) {
    highlighter = new TextmateHighlighter({
      getGrammar: (grammar: string) => {
        const language = grammar.split('.').pop()
        const finalGrammar = grammarMap[language as GrammarMapKey] || language

        if (grammar === 'source.js') {
          return jsGrammar as unknown as IRawGrammar
        }

        if (grammar === 'source.jsx') {
          return jsxGrammar as unknown as IRawGrammar
        }

        if (grammar === 'source.ts') {
          return tsGrammar as unknown as IRawGrammar
        }

        if (grammar === 'source.tsx') {
          return tsxGrammar as unknown as IRawGrammar
        }

        if (grammar === 'source.sh') {
          return shGrammar as unknown as IRawGrammar
        }

        throw new Error(`[mdxts] "${finalGrammar}" grammar was not loaded`)
      },
      getTheme: (theme: string) => {
        return nightOwlTheme as unknown as TextMateThemeRaw
      },
      getOniguruma: () => {
        return `https://unpkg.com/vscode-oniguruma@2.0.1/release/onig.wasm`
      },
    })
  }

  // TODO: figure out how to optimize markdown since it requires all grammars even if they are not used
  if (
    language === 'plaintext' ||
    language === 'markdown' ||
    language === 'mdx'
  ) {
    return [
      [
        {
          value,
          start: 0,
          end: value.length,
          isBaseColor: true,
          isWhitespace: false,
        } satisfies Token,
      ],
    ]
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(language)
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(value) : false
  const sourceFile = filename ? project.getSourceFile(filename) : undefined
  const allowedErrorCodes =
    typeof allowErrors === 'string'
      ? allowErrors.split(',').map((code) => parseInt(code))
      : []
  const sourceFileDiagnostics =
    allowedErrorCodes.length === 0 && allowErrors
      ? []
      : sourceFile
        ? getDiagnostics(sourceFile).filter(
            (diagnostic) => !allowedErrorCodes.includes(diagnostic.getCode())
          )
        : []
  const theme = await getTheme()
  const tokens = (await new Promise(async (resolve) => {
    await highlighter!.highlightToAbstract(
      {
        code: sourceFile ? sourceFile.getFullText() : value,
        grammar: `source.${languageMap[language as keyof typeof languageMap] || language}`,
        theme: 'night-owl',
      },
      resolve
    )
  })) as TokenProps[][]
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
        ? parent?.getKind() === SyntaxKind.ImportSpecifier ||
          parent?.getKind() === SyntaxKind.ImportClause
        : false
      return (
        !isJsxOnlyImport && !Node.isJSDocTag(parent) && !Node.isJSDoc(parent)
      )
    })
    .map((node) => ({
      start: node.getStart(),
      end: node.getEnd(),
    }))
  let previousTokenStart = 0
  let parsedTokens = tokens.map((line) => {
    // increment position for line breaks
    if (line.length === 0) {
      previousTokenStart += 1
    }
    return line.flatMap((token, tokenIndex) => {
      const tokenStart = previousTokenStart
      const tokenEnd = tokenStart + token.value.length
      const lastToken = tokenIndex === line.length - 1

      // account for newlines
      previousTokenStart = lastToken ? tokenEnd + 1 : tokenEnd

      const initialToken = {
        value: token.value,
        start: tokenStart,
        end: tokenEnd,
        color: token.color,
        fontStyle: token.fontStyle,
        fontWeight: token.fontWeight,
        textDecoration: token.textDecoration,
        isBaseColor: token.color
          ? token.color.toLowerCase() === theme.foreground.toLowerCase()
          : false,
        isWhitespace: token.value.trim() === '',
      }
      let processedTokens: Tokens = []

      // split tokens by symbol ranges
      if (symbolRanges) {
        const tokenRange = symbolRanges.find((range) => {
          return range.start >= tokenStart && range.end <= tokenEnd
        })
        const inFullRange = tokenRange
          ? tokenRange.start === tokenStart && tokenRange.end === tokenEnd
          : false

        // split the token to isolate the symbol
        if (tokenRange && !inFullRange) {
          const symbolStart = tokenRange.start - tokenStart
          const symbolEnd = tokenRange.end - tokenStart
          const symbolToken = {
            ...initialToken,
            value: token.value.slice(symbolStart, symbolEnd),
            start: tokenStart + symbolStart,
            end: tokenStart + symbolEnd,
          } satisfies Token
          const beforeSymbolToken = {
            ...initialToken,
            value: token.value.slice(0, symbolStart),
            start: tokenStart,
            end: tokenStart + symbolStart,
          } satisfies Token
          const afterSymbolToken = {
            ...initialToken,
            value: token.value.slice(symbolEnd),
            start: tokenStart + symbolEnd,
            end: tokenEnd,
          } satisfies Token

          processedTokens = [beforeSymbolToken, symbolToken, afterSymbolToken]
        } else {
          processedTokens.push(initialToken)
        }
      } else {
        processedTokens.push(initialToken)
      }

      // Now that all tokens are split the diagnostics and quick info can be attached
      return processedTokens.map((token) => {
        const tokenQuickInfo =
          sourceFile && filename
            ? getQuickInfo(sourceFile, filename, token.start)
            : undefined
        const tokenDiagnostics = sourceFileDiagnostics.filter((diagnostic) => {
          const start = diagnostic.getStart()
          const length = diagnostic.getLength()
          if (!start || !length) {
            return false
          }
          const end = start + length
          return start <= token.start && token.end <= end
        })
        return {
          ...token,
          quickInfo: tokenQuickInfo,
          diagnostics: tokenDiagnostics.length ? tokenDiagnostics : undefined,
        }
      })
    })
  })

  // Remove leading imports and whitespace for jsx only code blocks
  if (jsxOnly) {
    const firstJsxLineIndex = parsedTokens.findIndex((line) =>
      line.find((token) => token.value === '<')
    )
    parsedTokens = parsedTokens.slice(firstJsxLineIndex)
  }

  return parsedTokens
})

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

/** Get the quick info a token */
function getQuickInfo(
  sourceFile: SourceFile,
  filename: string,
  tokenStart: number
) {
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
    // // First, replace root directory to handle root node_modules
    // .replaceAll(rootDirectory, '.')
    // // Next, replace base directory for on disk paths
    // .replaceAll(baseDirectory, '')
    // Finally, replace the in-memory mdxts directory
    .replaceAll('/mdxts', '')
  const documentation = quickInfo.documentation || []
  const documentationText = formatDocumentationText(documentation)

  return {
    displayText,
    documentationText,
  }
}

/** Get the diagnostics for a source file, coerced into a module if necessary. */
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
