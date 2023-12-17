import type { Symbol, Type } from 'ts-morph'
import { Node, TypeFormatFlags, TypeChecker } from 'ts-morph'
import { kebabCase } from 'case-anything'
import { getDefaultValuesFromProperties } from '@tsxmod/utils'

import { getSourcePath } from './get-source-path'

/** Gets the types for a function declaration. */
export function getFunctionParameterTypes(declaration: Node) {
  const signatures = declaration.getType().getCallSignatures()

  if (signatures.length === 0) {
    return null
  }

  const parameters = signatures.at(0)!.getParameters()

  if (parameters.length === 0) {
    return null
  }

  const typeChecker = declaration.getProject().getTypeChecker()
  let parameterTypes = []

  for (const parameter of parameters) {
    const parameterType = processType(parameter, declaration, typeChecker)
    parameterTypes.push(parameterType)
  }

  return parameterTypes
}

/** Processes a signature parameter into a metadata object. */
function processType(
  parameter: Symbol,
  declaration: Node,
  typeChecker: TypeChecker
) {
  const valueDeclaration = parameter.getValueDeclaration()
  let isObjectBindingPattern = false
  let required = false
  let defaultValue

  if (Node.isParameterDeclaration(valueDeclaration)) {
    isObjectBindingPattern = Node.isObjectBindingPattern(
      valueDeclaration.getNameNode()
    )

    const initializer = valueDeclaration.getInitializer()
    if (initializer) {
      defaultValue = initializer.getText()
    }

    required = valueDeclaration
      ? !valueDeclaration?.hasQuestionToken() && !defaultValue
      : !defaultValue
  }

  const metadata: {
    name: string | null
    slug: string | null
    description: string | null
    defaultValue: any
    required: boolean
    type: string
    properties?: ReturnType<typeof processTypeProperties> | null
    sourcePath?: string
  } = {
    defaultValue,
    required,
    name: isObjectBindingPattern ? null : parameter.getName(),
    slug: isObjectBindingPattern ? null : kebabCase(parameter.getName()),
    description: getDescriptionFromJsDocs(parameter),
    type: parameter
      .getTypeAtLocation(declaration)
      .getText(declaration, TypeFormatFlags.UseAliasDefinedOutsideCurrentScope),
    properties: null,
    sourcePath: getSourcePath(
      declaration.getSourceFile().getFilePath(),
      declaration.getStartLineNumber()
    ),
  }

  if (!valueDeclaration) {
    return metadata
  }

  const parameterType = typeChecker.getTypeAtLocation(valueDeclaration)
  const isTypeInNodeModules = parameterType
    .getSymbol()
    ?.getValueDeclaration()
    ?.getSourceFile()
    .isInNodeModules()

  if (isTypeInNodeModules) {
    return metadata
  }

  const firstChild = valueDeclaration.getFirstChild()
  const defaultValues = Node.isObjectBindingPattern(firstChild)
    ? getDefaultValuesFromProperties(firstChild.getElements())
    : {}

  metadata.properties = processTypeProperties(
    parameterType,
    declaration,
    typeChecker,
    defaultValues
  )

  return metadata
}

export interface PropertyMetadata {
  name: string
  slug: string
  description: string | null
  defaultValue: any
  required: boolean
  type: string
  properties: (PropertyMetadata | null)[] | null
  sourcePath?: string
}

/** Processes the properties of a type. */
function processTypeProperties(
  type: Type,
  declaration: Node,
  typeChecker: TypeChecker,
  defaultValues: Record<string, any>
) {
  return type
    .getApparentProperties()
    .map((property) =>
      processProperty(property, declaration, typeChecker, defaultValues)
    )
    .filter((property): property is NonNullable<typeof property> =>
      Boolean(property)
    )
}

/** Processes a property into a metadata object. */
function processProperty(
  property: Symbol,
  declaration: Node,
  typeChecker: TypeChecker,
  defaultValues: Record<string, any>
) {
  const valueDeclaration = property.getValueDeclaration()

  if (!valueDeclaration || valueDeclaration.getSourceFile().isInNodeModules()) {
    return null
  }

  const propertyName = property.getName()
  const propertyType = property.getTypeAtLocation(declaration)
  const defaultValue = defaultValues[propertyName]
  const propertyMetadata: PropertyMetadata = {
    defaultValue,
    name: propertyName,
    slug: kebabCase(propertyName),
    description: getDescriptionFromJsDocs(property),
    required: Node.isPropertySignature(valueDeclaration)
      ? !valueDeclaration?.hasQuestionToken() && !defaultValue
      : !defaultValue,
    type: propertyType.getText(
      declaration,
      TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
    ),
    properties: null,
    sourcePath: getSourcePath(
      declaration.getSourceFile().getFilePath(),
      declaration.getStartLineNumber()
    ),
  }

  if (propertyType.isObject()) {
    const firstChild = valueDeclaration?.getFirstChild()
    propertyMetadata.properties = processTypeProperties(
      propertyType,
      declaration,
      typeChecker,
      Node.isObjectBindingPattern(firstChild)
        ? getDefaultValuesFromProperties(firstChild.getElements())
        : {}
    )
  }

  return propertyMetadata
}

/** Gets the description from a symbol's jsdocs. */
function getDescriptionFromJsDocs(symbol: Symbol) {
  const description = symbol
    .getDeclarations()
    .filter(Node.isJSDocable)
    .map((declaration) =>
      declaration
        .getJsDocs()
        .map((doc) => doc.getComment())
        .flat()
    )
    .join('\n')

  return description || null
}
