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

/** Gets the key for a default value property. */
export function getPropertyDefaultValueKey(
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

/** Gets the default value for a single parameter or property. */
// TODO: rename this to getInitializerValue
export function getPropertyDefaultValue(
  property: ParameterDeclaration | PropertyDeclaration
): LiteralExpressionValue {
  if (
    tsMorph.Node.isSpreadAssignment(property) ||
    tsMorph.Node.isMethodSignature(property)
  ) {
    return
  }

  const nameNode = property.getNameNode()

  if (!nameNode) {
    return
  }

  const name = getPropertyDefaultValueKey(property)

  if (!('getInitializer' in property)) {
    const kindName = (
      property as ParameterDeclaration | PropertyDeclaration
    ).getKindName()
    throw new Error(
      `[getDefaultValuesFromProperty] Property "${name}" of kind "${kindName}" does not have an initializer, so it cannot have a default value. This declaration should be filtered or file an issue for support.`
    )
  }

  const initializer = property.getInitializer()
  let defaultValue: LiteralExpressionValue = undefined

  if (initializer) {
    defaultValue = getInitializerValue(initializer)
  }

  if (tsMorph.Node.isObjectBindingPattern(nameNode)) {
    defaultValue = getObjectBindingPatternDefaultValue(nameNode, defaultValue)
  }

  if (tsMorph.Node.isIdentifier(nameNode)) {
    const references = property
      .findReferencesAsNodes()
      .map((reference) => reference.getParentOrThrow())
      .filter((reference) =>
        tsMorph.Node.isVariableDeclaration(reference)
      ) as VariableDeclaration[]

    references.forEach((reference) => {
      const referenceNameNode = reference.getNameNode()

      if (tsMorph.Node.isObjectBindingPattern(referenceNameNode)) {
        defaultValue = getObjectBindingPatternDefaultValue(
          referenceNameNode,
          defaultValue
        )
      }
    })
  }

  return defaultValue
}

/** Gets the default value for an object binding pattern. */
function getObjectBindingPatternDefaultValue(
  nameNode: ObjectBindingPattern,
  previousDefaultValue: LiteralExpressionValue
) {
  let defaultValue: Record<string, any> | undefined = undefined

  nameNode.getElements().forEach((element) => {
    const elementName = getPropertyDefaultValueKey(element)
    const elementInitializer = element.getInitializer()

    if (elementInitializer) {
      let initializerValue = getInitializerValue(elementInitializer)

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
function getInitializerValue(initializer: Expression) {
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
