import { safeAssign } from './safe-assign.ts'
import { getTsMorph } from './ts-morph.ts'
import type {
  ArrayLiteralExpression,
  Expression,
  ObjectLiteralExpression,
} from './ts-morph.ts'

const tsMorph = getTsMorph()
const { Node, ts } = tsMorph

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

  if (Node.isParenthesizedExpression(expression)) {
    return resolveLiteralExpression(expression.getExpression())
  }

  if (Node.isConditionalExpression(expression)) {
    const condition = resolveLiteralExpression(expression.getCondition())
    if (typeof condition === 'boolean') {
      return resolveLiteralExpression(
        condition ? expression.getWhenTrue() : expression.getWhenFalse()
      )
    }

    return EMPTY_LITERAL_EXPRESSION_VALUE
  }

  if (Node.isPrefixUnaryExpression(expression)) {
    const value = resolveLiteralExpression(expression.getOperand())

    if (value === EMPTY_LITERAL_EXPRESSION_VALUE) {
      return value
    }

    const operatorKind = expression.getOperatorToken()

    if (operatorKind === ts.SyntaxKind.MinusToken && typeof value === 'number') {
      return -value
    }

    if (operatorKind === ts.SyntaxKind.PlusToken && typeof value === 'number') {
      return value
    }

    if (
      operatorKind === ts.SyntaxKind.ExclamationToken &&
      typeof value === 'boolean'
    ) {
      return !value
    }
  }

  if (Node.isBinaryExpression(expression)) {
    const leftValue = resolveLiteralExpression(expression.getLeft())
    const rightValue = resolveLiteralExpression(expression.getRight())
    const operatorKind = expression.getOperatorToken().getKind()

    if (
      leftValue === EMPTY_LITERAL_EXPRESSION_VALUE ||
      rightValue === EMPTY_LITERAL_EXPRESSION_VALUE
    ) {
      return EMPTY_LITERAL_EXPRESSION_VALUE
    }

    if (operatorKind === ts.SyntaxKind.PlusToken) {
      if (
        (typeof leftValue === 'string' &&
          (typeof rightValue === 'string' || typeof rightValue === 'number')) ||
        (typeof rightValue === 'string' &&
          (typeof leftValue === 'string' || typeof leftValue === 'number'))
      ) {
        return `${leftValue}${rightValue}`
      }

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return leftValue + rightValue
      }
    }

    if (
      operatorKind === ts.SyntaxKind.MinusToken &&
      typeof leftValue === 'number' &&
      typeof rightValue === 'number'
    ) {
      return leftValue - rightValue
    }

    if (
      operatorKind === ts.SyntaxKind.AsteriskToken &&
      typeof leftValue === 'number' &&
      typeof rightValue === 'number'
    ) {
      return leftValue * rightValue
    }

    if (
      operatorKind === ts.SyntaxKind.SlashToken &&
      typeof leftValue === 'number' &&
      typeof rightValue === 'number' &&
      rightValue !== 0
    ) {
      return leftValue / rightValue
    }

    if (operatorKind === ts.SyntaxKind.QuestionQuestionToken) {
      return leftValue ?? rightValue
    }
  }

  if (Node.isTemplateExpression(expression)) {
    const head = expression.getHead().getLiteralText()
    let value = head

    for (const span of expression.getTemplateSpans()) {
      const substitution = resolveLiteralExpression(span.getExpression())
      const resolvedSubstitution =
        substitution === null ||
        typeof substitution === 'boolean' ||
        typeof substitution === 'number' ||
        typeof substitution === 'string'
          ? `${substitution}`
          : EMPTY_LITERAL_EXPRESSION_VALUE

      if (resolvedSubstitution === EMPTY_LITERAL_EXPRESSION_VALUE) {
        return EMPTY_LITERAL_EXPRESSION_VALUE
      }

      value += resolvedSubstitution
      value += span.getLiteral().getLiteralText()
    }

    return value
  }

    if (
      Node.isSpreadElement(expression) ||
      Node.isAsExpression(expression) ||
      Node.isTypeAssertion(expression)
    ) {
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

      safeAssign(object, resolveLiteralExpression(spreadExpression))
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
