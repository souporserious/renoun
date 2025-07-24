import type {
  Expression,
  ParameterDeclaration,
  VariableDeclaration,
  BindingElement,
  ObjectBindingPattern,
  PropertyDeclaration,
  PropertySignature,
} from 'ts-morph'
import tsMorph from 'ts-morph'

import {
  resolveLiteralExpression,
  isLiteralExpressionValue,
  type LiteralExpressionValue,
} from './resolve-expressions.js'

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
    const propertyNameNode = property.getPropertyNameNode()

    if (propertyNameNode) {
      return propertyNameNode.getText()
    }
  }

  return property.getName()
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

  const nameNode = declaration.getNameNode()

  if (!nameNode) {
    return
  }

  const name = getInitializerValueKey(declaration)

  if (!('getInitializer' in declaration)) {
    const kindName = (
      declaration as ParameterDeclaration | PropertyDeclaration
    ).getKindName()
    throw new Error(
      `[getDefaultValuesFromProperty] Property "${name}" of kind "${kindName}" does not have an initializer, so it cannot have a default value. This declaration should be filtered or file an issue for support.`
    )
  }

  const initializer = declaration.getInitializer()
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
    const references = declaration
      .findReferencesAsNodes()
      .map((reference) => reference.getParentOrThrow())
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
    const elementInitializer = element.getInitializer()

    if (elementInitializer) {
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
    return Object.assign(previousDefaultValue, defaultValue)
  }

  return defaultValue
}

/** Gets the value of an initializer expression. */
function resolveInitializerValue(initializer: Expression) {
  const resolvedValue = resolveLiteralExpression(initializer)

  if (isLiteralExpressionValue(resolvedValue)) {
    return resolvedValue
  }

  const literalValue = initializer.getType().getLiteralValue()

  if (literalValue !== undefined) {
    return literalValue
  }

  return initializer.getText()
}
