import crypto from 'node:crypto'
import { join, sep, isAbsolute } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { format, resolveConfig } from 'prettier'
import 'server-only'

import { getPathRelativeToPackage } from '../../utils/get-relative-path-as-package-import'
import { isJsxOnly } from '../../utils/is-jsx-only'
import type { Languages } from './get-tokens'
import { getLanguage } from './get-tokens'
import { project } from '../project'

type BaseParseMetadataOptions = {
  filename?: string
  language: Languages
  allowErrors?: boolean | string
}

export type ParseMetadataOptions = BaseParseMetadataOptions &
  (
    | { value: string }
    | {
        source: string
        workingDirectory?: string
      }
  )

/** Parses and normalizes source text metadata. */
export async function parseSourceTextMetadata({
  filename: filenameProp,
  language,
  allowErrors = false,
  ...props
}: ParseMetadataOptions) {
  let finalValue: string = ''
  let finalLanguage = language
  let id = 'source' in props ? props.source : filenameProp

  if ('value' in props) {
    finalValue = props.value

    if (id === undefined) {
      const hex = crypto.createHash('sha256').update(props.value).digest('hex')
      if (hex) {
        id = hex
      }
    }
  } else if ('source' in props) {
    const isRelative = !isAbsolute(props.source)
    const workingDirectory = props.workingDirectory

    if (isRelative && !workingDirectory) {
      throw new Error(
        'The [workingDirectory] prop was not provided to the [CodeBlock] component while using a relative path. Pass a valid [workingDirectory] or make sure the mdxts/remark plugin and mdxts/loader are configured correctly if this is being renderend in an MDX file.'
      )
    }

    const sourcePropPath = isRelative
      ? join(workingDirectory!, props.source)
      : props.source

    finalValue = await readFile(sourcePropPath, 'utf-8')

    if (!language) {
      finalLanguage = sourcePropPath.split('.').pop()! as Languages
    }
  }

  if (!finalLanguage) {
    finalLanguage = (filenameProp?.split('.').pop() as Languages) || 'plaintext'
  }

  if (typeof finalLanguage === 'string') {
    finalLanguage = getLanguage(finalLanguage)
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    finalLanguage
  )
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(finalValue) : false
  let filename = 'source' in props ? props.source : filenameProp
  let sourceFile: SourceFile | undefined

  if (!filename) {
    filename = `${id}.${finalLanguage}`
  }

  // Format JavaScript code blocks.
  if (isJavaScriptLikeLanguage) {
    try {
      const config = (await resolveConfig(filename)) || {}
      config.filepath = filename
      config.printWidth = 80
      finalValue = await format(finalValue, config)
    } catch (error) {
      // Ignore formatting errors.
    }

    // Trim semicolon and trailing newline from formatting.
    if (jsxOnly) {
      finalValue = finalValue.trimEnd()

      if (finalValue.startsWith(';')) {
        finalValue = finalValue.slice(1)
      }
    }
  }

  // Scope code block source files since they can conflict with other files on disk.
  if ('value' in props) {
    filename = join('mdxts', filename)
  }

  // Create a ts-morph source file to type-check JavaScript and TypeScript code blocks.
  if (isJavaScriptLikeLanguage) {
    try {
      sourceFile = project.createSourceFile(filename, finalValue, {
        overwrite: true,
      })

      const shouldEmitDiagnostics =
        allowErrors === false ||
        (typeof allowErrors === 'string' && !allowErrors.includes('2307'))

      if (shouldEmitDiagnostics) {
        // Identify and collect missing imports/types to try and resolve theme.
        // This is specifically the case for examples since they import files relative to the package.
        const diagnostics = sourceFile.getPreEmitDiagnostics()

        sourceFile
          .getImportDeclarations()
          .filter((importDeclaration) => {
            return diagnostics.some((diagnostic) => {
              const diagnosticStart = diagnostic.getStart()
              if (diagnosticStart === undefined) {
                return false
              }
              return (
                diagnostic.getCode() === 2307 &&
                diagnosticStart >= importDeclaration.getStart() &&
                diagnosticStart <= importDeclaration.getEnd()
              )
            })
          })
          .forEach((importDeclaration) => {
            importDeclaration.remove()
          })
      }

      // attempt to fix the removed imports and any other missing imports
      sourceFile.fixMissingImports()

      if (shouldEmitDiagnostics) {
        // remap relative module specifiers to package imports if possible
        // e.g. `import { getTheme } from '../../mdxts/src/components'` -> `import { getTheme } from 'mdxts/components'`
        sourceFile.getImportDeclarations().forEach((importDeclaration) => {
          if (importDeclaration.isModuleSpecifierRelative()) {
            const importSpecifier = getPathRelativeToPackage(importDeclaration)
            importDeclaration.setModuleSpecifier(importSpecifier)
          }
        })
      }
    } catch (error) {
      if (error instanceof Error) {
        const workingDirectory = process.cwd()
        throw new Error(
          `[mdxts] Error trying to create CodeBlock source file at working directory "${workingDirectory}"`,
          { cause: error }
        )
      }
    }
  }

  let filenameLabel = filenameProp

  if (!filenameLabel) {
    filenameLabel = filename
      .replace(join('mdxts', sep), '') // Remove mdxts/ prefix
      .replace(/\d+\./, '') // Remove ordered number prefix
  }

  return {
    value: finalValue,
    language: finalLanguage,
    isJsxOnly: jsxOnly,
    sourceFile,
    filename,
    filenameLabel,
  }
}
