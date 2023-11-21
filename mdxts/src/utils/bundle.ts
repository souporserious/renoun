import { build } from 'esbuild'
import type { Project } from 'ts-morph'

const PLUGIN_NAME = 'mdxts'

/** Bundle a list of entry points from a ts-morph project. */
export async function bundle(
  project: Project,
  entryPoint: string,
  external: string[] = []
) {
  const externalPackages = [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    ...external,
  ]
  const inMemoryFiles = {}
  let entryFilePresent = false

  project.getSourceFiles().forEach((sourceFile) => {
    if (sourceFile.isInNodeModules()) {
      return
    }
    const filePath = sourceFile.getFilePath()
    const fileContents = sourceFile.getFullText()

    inMemoryFiles[filePath] = fileContents

    if (filePath === ensureLeadingSlash(entryPoint)) {
      entryFilePresent = true
    }
  })

  if (!entryFilePresent) {
    console.error(`mdxts esbuild: Entry point not found for ${entryPoint}`)
    return null
  }

  if (Object.keys(inMemoryFiles).length === 0) {
    return null
  }

  const result = await build({
    entryPoints: [ensureLeadingSlash(entryPoint)],
    target: 'esnext',
    format: 'cjs',
    jsxDev: process.env.NODE_ENV === 'development',
    jsx: 'automatic',
    outdir: 'dist',
    bundle: true,
    minify: process.env.NODE_ENV === 'production',
    write: false,
    external: externalPackages,
    banner: {
      js: `'use client';`,
    },
    plugins: [
      {
        name: PLUGIN_NAME,
        setup(build) {
          build.onResolve({ filter: /.*/ }, ({ path, importer }) => {
            if (
              externalPackages.some((externalPackage) =>
                path.includes(externalPackage)
              )
            ) {
              return { path, external: true }
            }

            if (path.startsWith('.')) {
              const importerDirectory = importer.substring(
                0,
                importer.lastIndexOf('/')
              )
              const resolvedPath = path.startsWith('.')
                ? importerDirectory + path.substring(1)
                : importerDirectory + path
              path = ensureLeadingSlash(resolvedPath)
            } else {
              path = ensureLeadingSlash(path)
            }

            const extensions = ['.tsx', '.ts', '.jsx', '.js']

            for (let ext of extensions) {
              const potentialPath = path + ext
              if (potentialPath in inMemoryFiles) {
                return { path: potentialPath, namespace: PLUGIN_NAME }
              }
            }

            return { path, namespace: PLUGIN_NAME }
          })

          build.onLoad({ filter: /.*/, namespace: PLUGIN_NAME }, ({ path }) => {
            if (path in inMemoryFiles) {
              const contents = inMemoryFiles[path]
              const extension = path.split('.').pop() as
                | 'tsx'
                | 'ts'
                | 'jsx'
                | 'js'

              if (!['tsx', 'ts', 'jsx', 'js'].includes(extension)) {
                throw new Error(`Unexpected extension: ${extension}`)
              }

              return {
                contents: maybeTransformJsxOnly(contents),
                loader: extension,
              }
            }

            return {
              errors: [{ text: `mdxts esbuild: File not found: ${path}` }],
            }
          })
        },
      },
    ],
  })

  if (result.outputFiles.length === 0) {
    return null
  }

  return result.outputFiles[0].text
}

function ensureLeadingSlash(path) {
  return path.startsWith('/') ? path : '/' + path
}

function maybeTransformJsxOnly(sourceText: string) {
  const importRegex = /import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g
  const importStatements = (sourceText.match(importRegex) || []).join('\n')
  const jsxContent = sourceText.replace(/^import.*;$/gm, '').trim()
  const isJsxOnly = jsxContent.startsWith('<') && jsxContent.endsWith('>')

  if (isJsxOnly) {
    return `${importStatements}\n\nexport default () => ${jsxContent}`
  }

  return sourceText
}
