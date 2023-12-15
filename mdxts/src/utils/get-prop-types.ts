import type { PropertySignature, Symbol, Type } from 'ts-morph'
import { Node, TypeFormatFlags } from 'ts-morph'
import { getDefaultValuesFromProperties } from '@tsxmod/utils'

/** Gets the prop types for a component declaration. */
export function getPropTypes(declaration: Node) {
  const signatures = declaration.getType().getCallSignatures()

  if (signatures.length === 0) {
    return null
  }

  const [propsSignature] = signatures
  const [props] = propsSignature.getParameters()

  if (!props) {
    return null
  }
  const valueDeclaration = props.getValueDeclaration()

  if (!valueDeclaration) {
    return null
  }

  const typeChecker = declaration.getProject().getTypeChecker()
  const basePropsType = typeChecker.getTypeAtLocation(valueDeclaration)
  const propsType = typeChecker.getTypeOfSymbolAtLocation(
    props,
    valueDeclaration
  )
  const firstChild = valueDeclaration.getFirstChild()
  let defaultValues: ReturnType<typeof getDefaultValuesFromProperties> = {}

  if (Node.isObjectBindingPattern(firstChild)) {
    defaultValues = getDefaultValuesFromProperties(firstChild.getElements())
  }

  const baseProps = basePropsType
    .getApparentProperties()
    .map((property) => processProperty(property, declaration, defaultValues))
  let unionProps: ReturnType<typeof processProperty>[] = []

  if (propsType.isUnion()) {
    propsType.getUnionTypes().forEach((type) => {
      unionProps.push(
        handleComplexTypes(type)
          .filter((property) => !basePropsType.getProperty(property.getName()))
          .map((property) =>
            processProperty(property, declaration, defaultValues)
          )
      )
    })
  }

  return { baseProps, unionProps }
}

function handleComplexTypes(type: Type): Symbol[] {
  if (type.isUnion()) {
    return type.getUnionTypes().flatMap((t) => handleComplexTypes(t))
  } else if (type.isIntersection()) {
    return type.getIntersectionTypes().flatMap((t) => handleComplexTypes(t))
  } else {
    return type.getApparentProperties()
  }
}

function processProperty(
  prop: Symbol,
  declaration: Node,
  defaultValues: any
): any {
  const declarations = prop.getDeclarations()
  if (declarations.length === 0 || !Node.isPropertySignature(declarations[0])) {
    return null
  }

  const propDeclaration = declarations[0] as PropertySignature

  if (propDeclaration.getSourceFile().getFilePath().includes('node_modules')) {
    return null
  }

  const propName = prop.getName()
  const propType = prop.getTypeAtLocation(declaration)
  const description = prop
    .getDeclarations()
    .filter(Node.isJSDocable)
    .map((declaration) =>
      declaration
        .getJsDocs()
        .map((doc) => doc.getComment())
        .flat()
    )
    .join('\n')
  const defaultValue = defaultValues[propName]

  return {
    name: propName,
    required: !propDeclaration?.hasQuestionToken() && !defaultValue,
    description: description || null,
    type: propType.getText(
      declaration,
      TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
    ),
    defaultValue,
  }
}
