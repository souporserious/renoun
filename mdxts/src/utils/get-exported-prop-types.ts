import { kebabCase } from 'case-anything'
import type { CallExpression, SourceFile } from 'ts-morph'
import { Node } from 'ts-morph'
import { getPropTypes } from './get-prop-types'
import { getSourcePath } from './get-source-path'

/** Gets all exported prop types from a source file. */
export function getExportedPropTypes(sourceFile: SourceFile) {
  return Array.from(sourceFile.getExportedDeclarations())
    .map(([name, [declaration]]) => getReactDocs(name, declaration))
    .filter(Boolean)
}

function getReactDocs(name, declaration) {
  const reactFunctionDeclaration = getReactFunctionDeclaration(declaration)
  if (reactFunctionDeclaration) {
    const filePath = declaration.getSourceFile().getFilePath()
    const { baseProps, unionProps } = getPropTypes(reactFunctionDeclaration)
    return {
      name,
      baseProps,
      unionProps,
      slug: kebabCase(name),
      sourcePath: getSourcePath(filePath),
    }
  }
  return null
}

export function isComponent(name) {
  return /[A-Z]/.test(name.charAt(0))
}

export function isForwardRefExpression(initializer) {
  if (Node.isCallExpression(initializer)) {
    const expression = initializer.getExpression()

    /**
     * forwardRef(() => <Component />)
     */
    if (
      Node.isIdentifier(expression) &&
      expression.getText() === 'forwardRef'
    ) {
      return true
    }

    /**
     * React.forwardRef(() => <Component />)
     */
    if (
      Node.isPropertyAccessExpression(expression) &&
      expression.getText() === 'React.forwardRef'
    ) {
      return true
    }
  }

  return false
}

function getReactFunctionDeclaration(declaration: Node): Node {
  if (Node.isVariableDeclaration(declaration)) {
    const name = declaration.getName()
    const initializer = declaration.getInitializer()

    if (isComponent(name)) {
      /**
       * If we're dealing with a 'forwardRef' call we take the first argument of
       * the function since that is the component declaration.
       */
      if (isForwardRefExpression(initializer)) {
        const callExpression = initializer as CallExpression
        const [declaration] = callExpression.getArguments()
        return declaration
      }
      return declaration
    }
  }

  if (Node.isFunctionDeclaration(declaration)) {
    const name = declaration.getName()
    if (isComponent(name)) {
      return declaration
    }
  }

  return null
}
