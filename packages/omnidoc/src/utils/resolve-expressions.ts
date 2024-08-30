import type {
  Expression,
  ArrayLiteralExpression,
  ObjectLiteralExpression,
} from 'ts-morph'
import { Node } from 'ts-morph'

export type LiteralExpressionValue =
  | undefined
  | null
  | boolean
  | number
  | string
  | Record<string, any>
  | LiteralExpressionValue[]

const EMPTY_LITERAL_EXPRESSION_VALUE = Symbol('EMPTY_LITERAL_EXPRESSION_VALUE')

/** Recursively resolves an expression into a literal value. */
export function resolveLiteralExpression(
  expression: Expression
): LiteralExpressionValue | LiteralExpressionValue[] | Symbol {
  if (Node.isNullLiteral(expression)) {
    return null
  }

  if (Node.isFalseLiteral(expression)) {
    return false
  }

  if (Node.isTrueLiteral(expression)) {
    return true
  }

  if (Node.isNumericLiteral(expression)) {
    return expression.getLiteralValue()
  }

  if (
    Node.isStringLiteral(expression) ||
    Node.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.getLiteralText()
  }

  if (Node.isIdentifier(expression)) {
    let initializer

    for (const node of expression.getDefinitionNodes()) {
      if (Node.isVariableDeclaration(node)) {
        initializer = node.getInitializer()
        if (initializer) {
          return resolveLiteralExpression(initializer)
        }
      }
    }
  }

  if (Node.isArrayLiteralExpression(expression)) {
    return resolveArrayLiteralExpression(expression)
  }

  if (Node.isObjectLiteralExpression(expression)) {
    return resolveObjectLiteralExpression(expression)
  }

  if (Node.isSpreadElement(expression) || Node.isAsExpression(expression)) {
    return resolveLiteralExpression(expression.getExpression())
  }

  return EMPTY_LITERAL_EXPRESSION_VALUE
}

/** Resolves an array literal expression to an array. */
export function resolveArrayLiteralExpression(
  expression: ArrayLiteralExpression
): LiteralExpressionValue[] {
  return expression.getElements().map((element) => {
    return resolveLiteralExpression(element)
  })
}

/** Resolves an object literal expression to a plain object. */
export function resolveObjectLiteralExpression(
  expression: ObjectLiteralExpression
) {
  let object: Record<string, any> = {}

  for (const property of expression.getProperties()) {
    if (Node.isPropertyAssignment(property)) {
      object[property.getName()] = resolveLiteralExpression(
        property.getInitializerOrThrow()
      )
    }

    if (Node.isSpreadAssignment(property)) {
      const spreadExpression = property.getExpression()

      Object.assign(object, resolveLiteralExpression(spreadExpression))
    }
  }

  return object
}

/** Determines when a value was resolved in `resolveLiteralExpression`. */
export function isLiteralExpressionValue(
  value: ReturnType<typeof resolveLiteralExpression>
): value is LiteralExpressionValue | LiteralExpressionValue[] {
  return value !== EMPTY_LITERAL_EXPRESSION_VALUE
}
