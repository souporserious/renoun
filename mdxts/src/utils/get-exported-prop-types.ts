import { kebabCase } from 'case-anything'
import type {
  CallExpression,
  Expression,
  ExportedDeclarations,
  SourceFile,
  ts,
} from 'ts-morph'
import { Node } from 'ts-morph'
import { getPropTypes } from './get-prop-types'
import { getSourcePath } from './get-source-path'

/** Gets all exported prop types from a source file. */
export function getExportedPropTypes(sourceFile: SourceFile) {
  return Array.from(sourceFile.getExportedDeclarations())
    .map(([name, [declaration]]) => getReactDocs(name, declaration))
    .filter((doc): doc is NonNullable<ReturnType<typeof getReactDocs>> =>
      Boolean(doc)
    )
}

function getReactDocs(name: string, declaration: ExportedDeclarations) {
  const reactFunctionDeclaration = getReactFunctionDeclaration(declaration)
  if (reactFunctionDeclaration) {
    const filePath = declaration.getSourceFile().getFilePath()
    const propTypes = getPropTypes(reactFunctionDeclaration)
    return {
      name,
      baseProps: propTypes ? propTypes.baseProps : null,
      unionProps: propTypes ? propTypes.unionProps : null,
      slug: kebabCase(name),
      sourcePath: getSourcePath(filePath),
    }
  }
  return null
}

export function isComponent(name: string | undefined) {
  return name ? /[A-Z]/.test(name.charAt(0)) : false
}

export function isForwardRefExpression(
  initializer: Expression<ts.Expression> | undefined
) {
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

function getReactFunctionDeclaration(declaration: Node) {
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
