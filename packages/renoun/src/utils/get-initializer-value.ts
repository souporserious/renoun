import { safeAssign } from './safe-assign.ts'
import { getTsMorph } from './ts-morph.ts'
import type {
  Expression,
  ParameterDeclaration,
  VariableDeclaration,
  BindingElement,
  ObjectBindingPattern,
  PropertyDeclaration,
  PropertySignature,
} from './ts-morph.ts'

const tsMorph = getTsMorph()

import {
  resolveLiteralExpression,
  isLiteralExpressionValue,
  type LiteralExpressionValue,
} from './resolve-expressions.ts'

function safeRead<Value>(read: () => Value): Value | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}

/** Gets the key for an initializer value. */
export function getInitializerValueKey(
  property:
    | BindingElement
    | ParameterDeclaration
    | PropertyDeclaration
    | PropertySignature
) {
  /* Handle renamed properties */
  if (tsMorph.Node.isBindingElement(property)) {
    const propertyNameNode = safeRead(() => property.getPropertyNameNode())

    if (propertyNameNode) {
      const propertyNameText = safeRead(() => propertyNameNode.getText())

      if (propertyNameText) {
        return propertyNameText
      }
    }
  }

  return safeRead(() => property.getName())
}

/** Gets the initializer value for a single parameter or property. */
export function getInitializerValue(
  declaration: ParameterDeclaration | PropertyDeclaration
): LiteralExpressionValue {
  if (
    tsMorph.Node.isSpreadAssignment(declaration) ||
    tsMorph.Node.isMethodSignature(declaration)
  ) {
    return
  }

  const nameNode = safeRead(() => declaration.getNameNode())

  if (!nameNode) {
    return
  }

  const name = getInitializerValueKey(declaration)

  if (!('getInitializer' in declaration)) {
    const kindName = (
      safeRead(() =>
        (
          declaration as ParameterDeclaration | PropertyDeclaration
        ).getKindName()
      ) ?? 'unknown'
    )
    throw new Error(
      `[getDefaultValuesFromProperty] Property "${name}" of kind "${kindName}" does not have an initializer, so it cannot have a default value. This declaration should be filtered or file an issue for support.`
    )
  }

  const initializer = safeRead(() => declaration.getInitializer())
  let initializerValue: LiteralExpressionValue = undefined

  if (initializer) {
    initializerValue = resolveInitializerValue(initializer)
  }

  if (tsMorph.Node.isObjectBindingPattern(nameNode)) {
    initializerValue = getObjectBindingPatternInitializerValue(
      nameNode,
      initializerValue
    )
  }

  if (tsMorph.Node.isIdentifier(nameNode)) {
    const references = (safeRead(() => declaration.findReferencesAsNodes()) ?? [])
      .map((reference) => safeRead(() => reference.getParent()))
      .filter(Boolean)
      .filter((reference) =>
        tsMorph.Node.isVariableDeclaration(reference)
      ) as VariableDeclaration[]

    references.forEach((reference) => {
      const referenceNameNode = reference.getNameNode()

      if (tsMorph.Node.isObjectBindingPattern(referenceNameNode)) {
        initializerValue = getObjectBindingPatternInitializerValue(
          referenceNameNode,
          initializerValue
        )
      }
    })
  }

  return initializerValue
}

/** Gets the default value for an object binding pattern. */
function getObjectBindingPatternInitializerValue(
  nameNode: ObjectBindingPattern,
  previousDefaultValue: LiteralExpressionValue
) {
  let defaultValue: Record<string, any> | undefined = undefined

  nameNode.getElements().forEach((element) => {
    const elementName = getInitializerValueKey(element)
    const elementInitializer = safeRead(() => element.getInitializer())

    if (elementName && elementInitializer) {
      let initializerValue = resolveInitializerValue(elementInitializer)

      if (initializerValue !== undefined) {
        if (defaultValue === undefined) {
          defaultValue = {}
        }
        defaultValue[elementName] = initializerValue
      }
    }
  })

  if (defaultValue === undefined) {
    return previousDefaultValue
  }

  // Merge the previous default value if the object binding default value also exists
  if (
    previousDefaultValue?.constructor === Object &&
    (defaultValue as Record<string, any>)?.constructor === Object
  ) {
    return safeAssign(
      previousDefaultValue as Record<PropertyKey, unknown>,
      defaultValue
    ) as LiteralExpressionValue
  }

  return defaultValue
}

/** Gets the value of an initializer expression. */
function resolveInitializerValue(initializer: Expression) {
  const resolvedValue = resolveLiteralExpression(initializer)

  if (isLiteralExpressionValue(resolvedValue)) {
    return resolvedValue
  }

  const literalValue = safeRead(() => initializer.getType().getLiteralValue())

  if (literalValue !== undefined) {
    return literalValue
  }

  return safeRead(() => initializer.getText())
}
