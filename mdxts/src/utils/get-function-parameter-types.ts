import type { Symbol, Type } from 'ts-morph'
import {
  Node,
  SyntaxKind,
  TypeFlags,
  TypeFormatFlags,
  TypeChecker,
} from 'ts-morph'
import { kebabCase } from 'case-anything'
import { getDefaultValuesFromProperties } from '@tsxmod/utils'

import { getSourcePath } from './get-source-path'

/** Gets the types for a function declaration. */
export function getFunctionParameterTypes(declaration: Node) {
  const signatures = declaration.getType().getCallSignatures()

  if (signatures.length === 0) {
    return null
  }

  const [signature] = signatures
  const parameters = signature.getParameters()

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

function processType(
  parameter: Symbol,
  declaration: Node,
  typeChecker: TypeChecker
) {
  const valueDeclaration = parameter.getValueDeclaration()
  let isObjectBindingPattern = false
  let defaultValue
  let required

  if (Node.isParameterDeclaration(valueDeclaration)) {
    isObjectBindingPattern =
      valueDeclaration.getNameNode()?.getKind() ===
      SyntaxKind.ObjectBindingPattern

    const initializer = valueDeclaration.getInitializer()
    if (initializer) {
      defaultValue = initializer.getText()
    }

    required = !valueDeclaration?.hasQuestionToken() && !defaultValue
  }

  const metadata: {
    name: string | null
    slug: string | null
    description: string | null
    defaultValue: any
    required: boolean
    type: string
    properties?: ReturnType<typeof processProperties> | null
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

  if (isPrimitiveType(parameterType) || isTypeInNodeModules) {
    return metadata
  }

  const firstChild = valueDeclaration.getFirstChild()
  const defaultValues = Node.isObjectBindingPattern(firstChild)
    ? getDefaultValuesFromProperties(firstChild.getElements())
    : {}

  metadata.properties = processProperties(
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

function processProperties(
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

function processProperty(
  property: Symbol,
  declaration: Node,
  typeChecker: TypeChecker,
  defaultValues: Record<string, any>
) {
  const valueDeclaration = property.getValueDeclaration()

  /**
   * Skip if the property is a method or property signature.
   * e.g. `onPress?: () => void` or `onPress(): void`
   */
  if (
    !Node.isMethodSignature(valueDeclaration) ||
    !Node.isPropertySignature(valueDeclaration)
  ) {
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
    required: !valueDeclaration?.hasQuestionToken() && !defaultValue,
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
    const firstChild = valueDeclaration.getFirstChild()
    propertyMetadata.properties = processProperties(
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

/** Determines if a given type is a primitive type. */
function isPrimitiveType(type: Type): boolean {
  const typeFlags = type.getFlags()
  return (
    (typeFlags & TypeFlags.String) !== 0 ||
    (typeFlags & TypeFlags.Number) !== 0 ||
    (typeFlags & TypeFlags.Boolean) !== 0 ||
    (typeFlags & TypeFlags.Undefined) !== 0 ||
    (typeFlags & TypeFlags.Null) !== 0 ||
    (typeFlags & TypeFlags.Any) !== 0 ||
    (typeFlags & TypeFlags.Unknown) !== 0 ||
    (typeFlags & TypeFlags.Void) !== 0
  )
}
