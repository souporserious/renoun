import { Project, Node } from 'ts-morph'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { format, resolveConfig } from 'prettier'

export async function addGitSourceToMdxtsConfig(gitSource: string) {
  const project = new Project({ skipAddingFilesFromTsConfig: true })
  const configFileName = existsSync('./next.config.mjs')
    ? 'next.config.mjs'
    : 'next.config.js'
  const nextConfigPath = resolve(configFileName)
  const sourceFile = project.addSourceFileAtPath(nextConfigPath)

  sourceFile.forEachDescendant((node) => {
    if (Node.isCallExpression(node)) {
      if (node.getExpression().getText() === 'createMdxtsPlugin') {
        const [argument] = node.getArguments()
        if (Node.isObjectLiteralExpression(argument)) {
          const gitSourceProperty = argument.getProperty('gitSource')
          if (!gitSourceProperty) {
            argument.addPropertyAssignment({
              name: 'gitSource',
              initializer: `"${gitSource}"`,
            })
          }
        }
      }
    }
  })

  const prettierConfig = await resolveConfig(nextConfigPath)
  const formatted = await format(sourceFile.getFullText(), {
    ...prettierConfig,
    filepath: nextConfigPath,
  })

  sourceFile.replaceWithText(formatted)
  sourceFile.saveSync()

  console.log(`mdxts: added gitSource to ${configFileName}`)
}
