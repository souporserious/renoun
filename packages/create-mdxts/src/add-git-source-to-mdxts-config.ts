import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Project, Node } from 'ts-morph'

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

  sourceFile.formatText()
  sourceFile.saveSync()
}
