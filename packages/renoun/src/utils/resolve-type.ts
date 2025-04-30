import type {
  ClassDeclaration,
  Decorator,
  FunctionDeclaration,
  GetAccessorDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  Project,
  PropertyDeclaration,
  PropertySignature,
  IndexSignatureDeclaration,
  SetAccessorDeclaration,
  Signature,
  Symbol,
  TypeNode,
  Type,
  Node,
} from 'ts-morph'
import tsMorph from 'ts-morph'

import { getJsDocMetadata } from './get-js-doc-metadata.js'
import {
  getPropertyDefaultValueKey,
  getPropertyDefaultValue,
} from './get-property-default-value.js'
import { getSymbolDescription } from './get-symbol-description.js'

export interface BaseType {
  /** Distinguishs between different kinds of types, such as primitives, objects, classes, functions, etc. */
  kind?: unknown

  /** Whether the type is a function/method parameter or a class/object/interface property. */
  context?: 'parameter' | 'property'

  /** The name of the symbol or declaration if it exists. */
  name?: string

  /** The description of the symbol or declaration if it exists. */
  description?: string

  /** JSDoc tags for the declaration if present. */
  tags?: { tagName: string; text?: string }[]

  /** A stringified representation of the type. */
  text: string

  /** The path to the file where the symbol declaration is located. */
  path?: string

  /** The line and column number of the symbol declaration. */
  position?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
}

export interface ParameterType extends BaseType {
  /** Whether the type is a function/method parameter. */
  context: 'parameter'

  /** The default value assigned to the property parsed as a literal value if possible. */
  defaultValue?: unknown

  /** Whether or not the property has an optional modifier or default value. */
  isOptional?: boolean
}

export type CreateParameterType<Type> = Type extends any
  ? Type & ParameterType
  : never

export interface PropertyType extends BaseType {
  /** Whether the type is a object/class/interface property. */
  context: 'property'

  /** The default value assigned to the property parsed as a literal value if possible. */
  defaultValue?: unknown

  /** Whether or not the property has an optional modifier or default value. */
  isOptional?: boolean

  /** Whether or not the property has a readonly modifier. */
  isReadonly?: boolean
}

export type CreatePropertyType<Type> = Type extends any
  ? Type & PropertyType
  : never

export interface StringType extends BaseType {
  kind: 'String'
  value?: string
}

export interface NumberType extends BaseType {
  kind: 'Number'
  value?: number
}

export interface BooleanType extends BaseType {
  kind: 'Boolean'
}

export interface SymbolType extends BaseType {
  kind: 'Symbol'
}

export interface ArrayType extends BaseType {
  kind: 'Array'
  element: ResolvedType
}

export interface TupleType extends BaseType {
  kind: 'Tuple'
  elements: ResolvedType[]
}

export interface ObjectType extends BaseType {
  kind: 'Object'
  properties: (IndexType | PropertyTypes)[]
}

export interface IntersectionType extends BaseType {
  kind: 'Intersection'
  properties: ResolvedType[]
}

export interface IndexType extends BaseType {
  kind: 'Index'
  key: ResolvedType
  value: ResolvedType
}

export interface EnumType extends BaseType {
  kind: 'Enum'
  members: Record<string, string | number | undefined>
}

export interface UnionType extends BaseType {
  kind: 'Union'
  members: ResolvedType[]
}

export interface ClassType extends BaseType {
  kind: 'Class'
  constructors?: ReturnType<typeof resolveCallSignatures>
  accessors?: ClassAccessorType[]
  methods?: ClassMethodType[]
  properties?: ClassPropertyType[]
}

export interface SharedClassMemberType extends BaseType {
  scope?: 'abstract' | 'static'
  visibility?: 'private' | 'protected' | 'public'
  decorators: ResolvedType[]
}

export interface ClassGetAccessorType extends SharedClassMemberType {
  kind: 'ClassGetAccessor'
}

export type ClassSetAccessorType = SharedClassMemberType & {
  kind: 'ClassSetAccessor'
} & Omit<FunctionSignatureType, 'kind'>

export type ClassAccessorType = ClassGetAccessorType | ClassSetAccessorType

export interface ClassMethodType extends SharedClassMemberType {
  kind: 'ClassMethod'
  signatures: FunctionSignatureType[]
}

export type ClassPropertyType = BaseTypes &
  SharedClassMemberType & {
    defaultValue?: unknown
    isReadonly: boolean
  }

export interface FunctionSignatureType extends BaseType {
  kind: 'FunctionSignature'
  modifier?: 'async' | 'generator'
  generics?: GenericParameterType[]
  parameters: ParameterTypes[]
  returnType: string
}

export interface FunctionType extends BaseType {
  kind: 'Function'
  signatures: FunctionSignatureType[]
}

export interface ComponentSignatureType extends BaseType {
  kind: 'ComponentSignature'
  modifier?: 'async' | 'generator'
  parameter?: ObjectType | ReferenceType
  returnType: string
}

export interface ComponentType extends BaseType {
  kind: 'Component'
  signatures: ComponentSignatureType[]
}

export interface PrimitiveType extends BaseType {
  kind: 'Primitive'
}

export interface ReferenceType extends BaseType {
  kind: 'Reference'
}

export interface GenericParameterType extends BaseType {
  kind: 'GenericParameter'
  constraint?: BaseTypes
  defaultType?: BaseTypes
}

/** Represents a utility type definition e.g. `type Partial<Type> = { [Key in keyof Type]?: Type[Key] }`. */
export interface UtilityType extends BaseType {
  kind: 'Utility'

  /** The resolved type of the utility type. */
  type: ResolvedType | undefined

  /** The type parameters used in the definition of this utility type itself. */
  parameters: GenericParameterType[]
}

/** Represents when a utility type is used as a type reference e.g. `{ options: Partial<Type> }`. */
export interface UtilityReferenceType extends BaseType {
  kind: 'UtilityReference'

  /** The name of the utility type (e.g. "Partial", "Readonly", etc.). */
  typeName: string

  /** The type arguments passed in during usage, e.g. `Type` in `Partial<Type>`. */
  arguments: ResolvedType[]
}

export interface UnknownType extends BaseType {
  kind: 'Unknown'
}

export type BaseTypes =
  | StringType
  | NumberType
  | BooleanType
  | SymbolType
  | ArrayType
  | TupleType
  | ObjectType
  | IntersectionType
  | IndexType
  | EnumType
  | UnionType
  | ClassType
  | FunctionType
  | ComponentType
  | PrimitiveType
  | ReferenceType
  | UtilityType
  | UtilityReferenceType
  | GenericParameterType
  | UnknownType

export type AllTypes =
  | BaseTypes
  | ClassAccessorType
  | ClassMethodType
  | FunctionSignatureType
  | ComponentSignatureType

export type TypeByKind<Type, Key> = Type extends { kind: Key } ? Type : never

export type TypeOfKind<Key extends AllTypes['kind']> = TypeByKind<AllTypes, Key>

export type ParameterTypes = CreateParameterType<BaseTypes>

export type PropertyTypes = CreatePropertyType<BaseTypes>

export type ResolvedType = BaseTypes | ParameterTypes | PropertyTypes

export type SymbolMetadata = ReturnType<typeof getSymbolMetadata>

export type SymbolFilter = (symbolMetadata: SymbolMetadata) => boolean

/** Tracks exported references to link types together. */
const exportedReferences = new WeakSet<Type>()

/** Tracks root type references to prevent infinite recursion. */
const rootReferences = new WeakSet<Type>()

const enclosingNodeMetadata = new WeakMap<Node, SymbolMetadata>()
const defaultFilter = (metadata: SymbolMetadata) => {
  return !metadata.isPrivate && !metadata.isInNodeModules
}
const TYPE_FORMAT_FLAGS =
  tsMorph.TypeFormatFlags.NoTruncation |
  tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  tsMorph.TypeFormatFlags.WriteArrayAsGenericType

/** Determines if the type is a parameter type. */
export function isParameterType(
  property: AllTypes
): property is ParameterTypes {
  return property.context === 'parameter'
}

/** Determines if the type is a property type. */
export function isPropertyType(property: AllTypes): property is PropertyTypes {
  return property.context === 'property'
}

/** Determines if the type is a parameter or property type. */
export function isMemberType(
  property: AllTypes
): property is ParameterTypes | PropertyTypes {
  return isParameterType(property) || isPropertyType(property)
}

/** Process type metadata. */
export function resolveType(
  type: Type,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  isRootType: boolean = true,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): ResolvedType | undefined {
  const aliasSymbol = type.getAliasSymbol()
  const symbol =
    /* First, attempt to get the aliased symbol for aliased types */
    aliasSymbol ||
    /* Next, try to get the symbol of the type itself */
    type.getSymbol() ||
    /* Finally, try to get the symbol of the apparent type */
    type.getApparentType().getSymbol()
  const symbolMetadata = getSymbolMetadata(symbol, enclosingNode)
  const symbolDeclaration = getPrimaryDeclaration(symbol)

  /* Track the root type's dependencies for changes if they are provided. */
  if (dependencies && symbolDeclaration) {
    const { filePath, isInNodeModules } = symbolMetadata
    if (!isInNodeModules && filePath && !dependencies.has(filePath)) {
      try {
        dependencies.add(filePath)
      } catch {
        // File was probably deleted
      }
    }
  }

  const isPrimitive = isPrimitiveType(type)
  const declaration = symbolDeclaration || enclosingNode
  const typeArguments = type.getTypeArguments()
  const aliasTypeArguments = type.getAliasTypeArguments()
  let typeName: string | undefined = symbolDeclaration
    ? (symbolDeclaration as any)?.getNameNode?.()?.getText()
    : undefined
  let typeText = type.getText(enclosingNode, TYPE_FORMAT_FLAGS)
  let declarationLocation: ReturnType<typeof getDeclarationLocation> = {}

  if (declaration) {
    /* Use the enclosing node's location if it is a member. */
    const isMember =
      tsMorph.Node.isVariableDeclaration(enclosingNode) ||
      tsMorph.Node.isPropertyAssignment(enclosingNode) ||
      tsMorph.Node.isPropertySignature(enclosingNode) ||
      tsMorph.Node.isMethodSignature(enclosingNode) ||
      tsMorph.Node.isParameterDeclaration(enclosingNode) ||
      tsMorph.Node.isPropertyDeclaration(enclosingNode) ||
      tsMorph.Node.isMethodDeclaration(enclosingNode) ||
      tsMorph.Node.isGetAccessorDeclaration(enclosingNode) ||
      tsMorph.Node.isSetAccessorDeclaration(enclosingNode)

    declarationLocation = getDeclarationLocation(
      isMember ? enclosingNode : declaration
    )
  }

  /* When the type is a property signature, check if it is referencing an exported symbol. */
  if (
    tsMorph.Node.isPropertySignature(enclosingNode) &&
    tsMorph.Node.isExportable(symbolDeclaration) &&
    symbolDeclaration.isExported()
  ) {
    return {
      kind: 'Reference',
      text: typeText,
      ...declarationLocation,
    } satisfies ReferenceType
  }

  /* Use the generic name and type text if the type is a type alias or property signature. */
  let genericTypeArguments: TypeNode[] = []

  if (typeArguments.length === 0) {
    if (
      tsMorph.Node.isTypeAliasDeclaration(enclosingNode) ||
      tsMorph.Node.isPropertySignature(enclosingNode)
    ) {
      const typeNode = enclosingNode.getTypeNode()

      if (tsMorph.Node.isTypeReference(typeNode)) {
        genericTypeArguments = typeNode.getTypeArguments()
      }
    }
  }

  /** Determine if the enclosing type is referencing a type in node modules. */
  if (symbol && enclosingNode && !isPrimitive) {
    const enclosingSymbolMetadata = enclosingNodeMetadata.get(enclosingNode)
    const inSeparateProjects =
      enclosingSymbolMetadata?.isInNodeModules === false &&
      symbolMetadata.isInNodeModules

    if (inSeparateProjects) {
      /**
       * Additionally, we check if type arguments exist and are all located in node_modules before
       * treating the entire expression as a reference.
       */
      if (
        typeArguments.length === 0 ||
        isEveryTypeInNodeModules(typeArguments)
      ) {
        if (aliasTypeArguments.length > 0) {
          const resolvedTypeArguments = aliasTypeArguments
            .map((type) =>
              resolveType(
                type,
                declaration,
                filter,
                false,
                defaultValues,
                keepReferences,
                dependencies
              )
            )
            .filter(Boolean) as ResolvedType[]

          if (resolvedTypeArguments.length === 0) {
            return
          }

          return {
            kind: 'UtilityReference',
            text: typeText,
            typeName: typeName!,
            arguments: resolvedTypeArguments,
            ...declarationLocation,
          } satisfies UtilityReferenceType
        } else {
          if (!declarationLocation.filePath) {
            throw new Error(
              `[renoun:resolveType]: No file path found for "${typeText}". Please file an issue if you encounter this error.`
            )
          }
          return {
            kind: 'Reference',
            text: typeText,
            ...declarationLocation,
          } satisfies ReferenceType
        }
      }
    }

    /*
     * Determine if the symbol should be treated as a reference.
     * TODO: this should account for what's actually exported from package.json exports to determine what's resolved.
     */
    const isReference = exportedReferences.has(type) || rootReferences.has(type)
    const isLocallyExportedReference =
      !isRootType &&
      !symbolMetadata.isInNodeModules &&
      !symbolMetadata.isExternal &&
      symbolMetadata.isExported
    const isExternalNonNodeModuleReference =
      symbolMetadata.isExternal && !symbolMetadata.isInNodeModules
    const isNodeModuleReference =
      !symbolMetadata.isGlobal && symbolMetadata.isInNodeModules
    const hasNoTypeArguments =
      typeArguments.length === 0 &&
      aliasTypeArguments.length === 0 &&
      genericTypeArguments.length === 0

    if (
      isReference ||
      ((isLocallyExportedReference ||
        isExternalNonNodeModuleReference ||
        isNodeModuleReference) &&
        hasNoTypeArguments)
    ) {
      if (!declarationLocation.filePath) {
        throw new Error(
          `[renoun:resolveType]: No file path found for "${typeText}". Please file an issue if you encounter this error.`
        )
      }

      /* Allow node_module references to be filtered in. */
      if (filter === defaultFilter ? true : !filter(symbolMetadata)) {
        return {
          kind: 'Reference',
          text: typeText,
          ...declarationLocation,
        } satisfies ReferenceType
      }
    }
  }

  if (
    symbolMetadata.isExported &&
    !symbolMetadata.isGlobal &&
    !symbolMetadata.isVirtual
  ) {
    exportedReferences.add(type)
  }

  if (!symbolMetadata.isVirtual) {
    rootReferences.add(type)
  }

  let resolvedType: ResolvedType = {
    kind: 'Unknown',
    text: typeText,
  } satisfies UnknownType

  if (type.isBoolean() || type.isBooleanLiteral()) {
    resolvedType = {
      kind: 'Boolean',
      name: symbolMetadata.name,
      text: typeText,
    } satisfies BooleanType
  } else if (type.isNumber() || type.isNumberLiteral()) {
    resolvedType = {
      kind: 'Number',
      name: symbolMetadata.name,
      text: typeText,
      value: type.getLiteralValue() as number,
    } satisfies NumberType
  } else if (type.isString() || type.isStringLiteral()) {
    resolvedType = {
      kind: 'String',
      name: symbolMetadata.name,
      text: typeText,
      value: type.getLiteralValue() as string,
    } satisfies StringType
  } else if (isSymbol(type)) {
    resolvedType = {
      kind: 'Symbol',
      name: symbolMetadata.name,
      text: typeText,
    } satisfies SymbolType
  } else if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow()
    const resolvedElementType = resolveType(
      elementType,
      declaration,
      filter,
      false,
      defaultValues,
      keepReferences,
      dependencies
    )
    if (resolvedElementType) {
      resolvedType = {
        kind: 'Array',
        name: symbolMetadata.name,
        text: typeText,
        element: resolvedElementType,
      } satisfies ArrayType
    } else {
      if (!keepReferences) {
        rootReferences.delete(type)
      }
      return
    }
  } else if (
    isRootType &&
    tsMorph.Node.isTypeAliasDeclaration(enclosingNode) &&
    aliasTypeArguments.length > 0
  ) {
    // Prevent the type from being resolved as a reference.
    rootReferences.delete(type)

    const resolvedUtilityType = resolveType(
      type,
      declaration,
      filter,
      false,
      defaultValues,
      keepReferences,
      dependencies
    )

    // Restore the root reference cache after resolving the utility type.
    rootReferences.add(type)

    if (!resolvedUtilityType) {
      console.log(
        `[renoun:resolveType]: No utility type found for "${typeText}". Please file an issue if you encounter this error.`
      )
    }

    resolvedType = {
      kind: 'Utility',
      name: symbolMetadata.name,
      text: typeText,
      type: resolvedUtilityType,
      parameters: aliasTypeArguments.map((type) => {
        return resolveType(
          type,
          declaration,
          filter,
          false,
          defaultValues,
          keepReferences,
          dependencies
        ) as GenericParameterType
      }) as GenericParameterType[],
    } satisfies UtilityType
  } else {
    if (type.isTypeParameter()) {
      const constraintType = type.getConstraint()
      const defaultType = type.getDefault()

      resolvedType = {
        kind: 'GenericParameter',
        name: symbolMetadata.name,
        text: typeText,
        constraint: constraintType
          ? resolveType(
              constraintType,
              enclosingNode,
              filter,
              false,
              defaultValues,
              keepReferences,
              dependencies
            )
          : undefined,
        defaultType: defaultType
          ? resolveType(
              defaultType,
              enclosingNode,
              filter,
              false,
              defaultValues,
              keepReferences,
              dependencies
            )
          : undefined,
      } satisfies GenericParameterType
    } else if (
      type.isClass() ||
      tsMorph.Node.isClassDeclaration(symbolDeclaration)
    ) {
      if (tsMorph.Node.isClassDeclaration(symbolDeclaration)) {
        resolvedType = resolveClass(symbolDeclaration, filter, dependencies)
        if (symbolMetadata.name) {
          resolvedType.name = symbolMetadata.name
        }
      } else {
        throw new Error(
          `[renoun:resolveType]: No class declaration found for "${symbolMetadata.name}". Please file an issue if you encounter this error.`
        )
      }
    } else if (type.isEnum()) {
      if (tsMorph.Node.isEnumDeclaration(symbolDeclaration)) {
        resolvedType = {
          kind: 'Enum',
          name: symbolMetadata.name,
          text: typeText,
          members: Object.fromEntries(
            symbolDeclaration
              .getMembers()
              .map((member) => [member.getName(), member.getValue()])
          ) as Record<string, string | number | undefined>,
        } satisfies EnumType
      } else {
        throw new Error(
          `[renoun:resolveType]: No enum declaration found for "${symbolMetadata.name}". Please file an issue if you encounter this error.`
        )
      }
    } else if (type.isUnion()) {
      const typeNode = tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)
        ? symbolDeclaration.getTypeNode()
        : undefined

      /* type.isIntersection() will be `false` when mixed with unions so we resolve the type nodes individually instead. */
      if (tsMorph.Node.isIntersectionTypeNode(typeNode)) {
        const resolvedIntersectionTypes = typeNode
          .getTypeNodes()
          .map((typeNode) =>
            resolveType(
              typeNode.getType(),
              typeNode,
              filter,
              false,
              defaultValues,
              keepReferences,
              dependencies
            )
          )
          .filter(Boolean) as ResolvedType[]

        if (resolvedIntersectionTypes.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }
          return
        }

        resolvedType = {
          kind: 'Intersection',
          name: symbolMetadata.name,
          text: typeText,
          properties: resolvedIntersectionTypes,
        } satisfies IntersectionType
      } else {
        const resolvedUnionTypes: ResolvedType[] = []

        for (const unionType of type.getUnionTypes()) {
          const resolvedType = resolveType(
            unionType,
            declaration,
            filter,
            false,
            defaultValues,
            keepReferences,
            dependencies
          )

          if (resolvedType) {
            const previousProperty = resolvedUnionTypes.at(-1)

            // Flatten boolean literals to just 'boolean' if both values are present
            if (
              resolvedType.kind === 'Boolean' &&
              previousProperty?.kind === 'Boolean'
            ) {
              resolvedUnionTypes.pop()
              resolvedType.text = 'boolean'
            }

            resolvedUnionTypes.push(resolvedType)
          }
        }

        const uniqueUnionTypes: ResolvedType[] = []

        for (const unionType of resolvedUnionTypes) {
          if (
            !uniqueUnionTypes.some((uniqueUnionType) => {
              const sameStart =
                unionType.position?.start.line ===
                uniqueUnionType.position?.start.line
              const sameEnd =
                unionType.position?.end.line ===
                uniqueUnionType.position?.end.line

              return (
                uniqueUnionType.kind === unionType.kind &&
                uniqueUnionType.text === unionType.text &&
                uniqueUnionType.path === unionType.path &&
                sameStart &&
                sameEnd
              )
            })
          ) {
            uniqueUnionTypes.push(unionType)
          }
        }

        if (uniqueUnionTypes.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }
          return
        }

        resolvedType = {
          kind: 'Union',
          name: symbolMetadata.name,
          text: typeText,
          members: uniqueUnionTypes,
        } satisfies UnionType
      }
    } else if (type.isIntersection()) {
      const resolvedIntersectionTypes = type
        .getIntersectionTypes()
        .map((intersectionType) =>
          resolveType(
            intersectionType,
            declaration,
            filter,
            false,
            defaultValues,
            keepReferences,
            dependencies
          )
        )
        .filter(Boolean) as ResolvedType[]

      // Intersection types can safely merge the immediate object properties to reduce nesting
      const properties: ResolvedType[] = []
      let isObject = true

      for (const resolvedType of resolvedIntersectionTypes) {
        if (resolvedType.kind === 'Object') {
          properties.push(...resolvedType.properties)
        } else {
          properties.push(resolvedType)
          isObject = false
        }
      }

      if (properties.length === 0) {
        if (!keepReferences) {
          rootReferences.delete(type)
        }
        return
      }

      if (isObject) {
        resolvedType = {
          kind: 'Object',
          name: symbolMetadata.name,
          text: typeText,
          properties: properties.map((property) => ({
            ...property,
            context: 'property',
          })),
        } satisfies ObjectType
      } else {
        resolvedType = {
          kind: 'Intersection',
          name: symbolMetadata.name,
          text: typeText,
          properties,
        } satisfies IntersectionType
      }
    } else if (type.isTuple()) {
      const elements = resolveTypeTupleElements(
        type,
        declaration,
        filter,
        false
      )

      if (elements.length === 0) {
        if (!keepReferences) {
          rootReferences.delete(type)
        }
        return
      }

      resolvedType = {
        kind: 'Tuple',
        name: symbolMetadata.name,
        text: typeText,
        elements,
      } satisfies TupleType
    } else {
      const callSignatures = type.getCallSignatures()

      if (callSignatures.length > 0) {
        const resolvedCallSignatures = resolveCallSignatures(
          callSignatures,
          declaration,
          filter,
          dependencies
        )

        if (
          aliasSymbol === undefined &&
          isComponent(symbolMetadata.name, resolvedCallSignatures)
        ) {
          resolvedType = {
            kind: 'Component',
            name: symbolMetadata.name,
            text: typeText,
            signatures: resolvedCallSignatures.map(
              ({ parameters, ...resolvedCallSignature }) => {
                return {
                  ...resolvedCallSignature,
                  kind: 'ComponentSignature',
                  parameter: parameters.at(0) as
                    | ObjectType
                    | ReferenceType
                    | undefined,
                } satisfies ComponentSignatureType
              }
            ),
          } satisfies ComponentType
        } else {
          resolvedType = {
            kind: 'Function',
            name: symbolMetadata.name,
            text: typeText,
            signatures: resolvedCallSignatures,
          } satisfies FunctionType
        }
      } else if (isPrimitive) {
        resolvedType = {
          kind: 'Primitive',
          text: typeText,
        } satisfies PrimitiveType
      } else if (type.isObject()) {
        const indexSignatures = resolveIndexSignatures(
          symbolDeclaration,
          filter,
          false
        )
        const properties = resolveTypeProperties(
          type,
          enclosingNode,
          filter,
          false,
          defaultValues
        )

        if (
          indexSignatures.length === 0 &&
          properties.length === 0 &&
          typeArguments.length > 0
        ) {
          const resolvedTypeArguments = typeArguments
            .map((type) =>
              resolveType(
                type,
                declaration,
                filter,
                false,
                defaultValues,
                keepReferences,
                dependencies
              )
            )
            .filter(Boolean) as ResolvedType[]

          if (resolvedTypeArguments.length === 0) {
            if (!keepReferences) {
              rootReferences.delete(type)
            }
            return
          }

          resolvedType = {
            kind: 'UtilityReference',
            name: symbolMetadata.name,
            text: typeText,
            typeName: typeName!,
            arguments: resolvedTypeArguments,
          } satisfies UtilityReferenceType
        } else if (properties.length === 0 && indexSignatures.length > 0) {
          resolvedType = {
            kind: 'Object',
            name: symbolMetadata.name,
            text: typeText,
            properties: indexSignatures,
          } satisfies ObjectType
        } else if (properties.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }
          return
        } else {
          resolvedType = {
            kind: 'Object',
            name: symbolMetadata.name,
            text: typeText,
            properties: [
              ...indexSignatures,
              ...properties.map((property) => ({
                ...property,
                context: 'property',
              })),
            ] as PropertyTypes[],
          } satisfies ObjectType
        }
      } else {
        /** Finally, try to resolve the apparent type if it is different from the current type. */
        const apparentType = type.getApparentType()

        if (type !== apparentType) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }

          return resolveType(
            apparentType,
            declaration,
            filter,
            false,
            defaultValues,
            keepReferences,
            dependencies
          )
        }
      }
    }
  }

  if (!keepReferences) {
    rootReferences.delete(type)
  }

  let metadataDeclaration = declaration

  /* If the type is a variable declaration, use the parent statement to retrieve jsdoc metadata. */
  if (tsMorph.Node.isVariableDeclaration(enclosingNode)) {
    metadataDeclaration = enclosingNode
  }

  return {
    ...(metadataDeclaration ? getJsDocMetadata(metadataDeclaration) : {}),
    ...resolvedType,
    ...declarationLocation,
  }
}

/** Process all function signatures of a given type including their parameters and return types. */
function resolveCallSignatures(
  signatures: Signature[],
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  dependencies?: Set<string>
): FunctionSignatureType[] {
  return signatures
    .map((signature) =>
      resolveSignature(signature, enclosingNode, filter, dependencies)
    )
    .filter(Boolean) as FunctionSignatureType[]
}

/** Process a single function signature including its parameters and return type. */
function resolveSignature(
  signature: Signature,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  dependencies?: Set<string>
): FunctionSignatureType | undefined {
  const signatureDeclaration = signature.getDeclaration()
  const signatureParameters = signature.getParameters()
  const parameterDeclarations = signatureParameters.map((parameter) =>
    parameter.getDeclarations().at(0)
  ) as (ParameterDeclaration | undefined)[]
  const genericParameters = signature.getTypeParameters()
  const resolvedGenericParameters = genericParameters
    .map((parameter) =>
      resolveType(
        parameter,
        enclosingNode,
        filter,
        false,
        undefined,
        true,
        dependencies
      )
    )
    .filter(Boolean) as GenericParameterType[]
  const genericsText = resolvedGenericParameters.length
    ? `<${resolvedGenericParameters
        .map((generic) => {
          const constraintText = generic.constraint
            ? ` extends ${generic.constraint.text}`
            : ''
          return generic.name + constraintText
        })
        .join(', ')}>`
    : ''
  const resolvedParameters = signatureParameters
    .map((parameter, index) => {
      const parameterDeclaration = parameterDeclarations[index]
      const isOptional = parameterDeclaration
        ? parameterDeclaration.hasQuestionToken()
        : undefined
      const declaration = parameterDeclaration || enclosingNode

      if (declaration) {
        const defaultValue = parameterDeclaration
          ? getPropertyDefaultValue(parameterDeclaration)
          : undefined
        const parameterType = parameter.getTypeAtLocation(signatureDeclaration)
        const resolvedParameterType = resolveType(
          parameterType,
          declaration,
          filter,
          false,
          defaultValue,
          false,
          dependencies
        )

        if (resolvedParameterType) {
          let name: string | undefined = parameter.getName()

          if (name.startsWith('__')) {
            name = undefined
          }

          return {
            ...resolvedParameterType,
            context: 'parameter',
            name,
            defaultValue,
            isOptional: isOptional ?? Boolean(defaultValue),
            description: getSymbolDescription(parameter),
          } satisfies ParameterTypes
        }
      } else {
        throw new Error(
          `[renoun:resolveCallSignatures]: No parameter declaration found for "${parameter.getName()}". You must pass the enclosing node as the second argument to "resolveCallSignatures".`
        )
      }
    })
    .filter(Boolean) as ParameterTypes[]

  /** Skip signatures with filtered parameters if they are in node_modules. */
  if (
    signatureParameters.length !== 0 &&
    resolvedParameters.length === 0 &&
    signatureDeclaration.getSourceFile().isInNodeModules()
  ) {
    return
  }

  const returnType = signature
    .getReturnType()
    .getText(
      undefined,
      tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
    )
  const parametersText = resolvedParameters
    .map((parameter) => {
      const questionMark = parameter.isOptional ? '?' : ''
      return parameter.name
        ? `${parameter.name}${questionMark}: ${parameter.text}`
        : parameter.text
    })
    .join(', ')
  let simplifiedTypeText: string

  if (tsMorph.Node.isFunctionDeclaration(signatureDeclaration)) {
    simplifiedTypeText = `function ${signatureDeclaration.getName()}${genericsText}(${parametersText}): ${returnType}`
  } else {
    simplifiedTypeText = `${genericsText}(${parametersText}) => ${returnType}`
  }

  const modifier: ReturnType<typeof getModifier> =
    tsMorph.Node.isFunctionDeclaration(signatureDeclaration) ||
    tsMorph.Node.isMethodDeclaration(signatureDeclaration)
      ? getModifier(signatureDeclaration)
      : undefined

  return {
    kind: 'FunctionSignature',
    text: simplifiedTypeText,
    generics: resolvedGenericParameters,
    parameters: resolvedParameters,
    modifier,
    returnType,
    ...getJsDocMetadata(signatureDeclaration),
    ...getDeclarationLocation(signatureDeclaration),
  }
}

/** Process index signatures of an interface or type alias. */
function resolveIndexSignatures(
  node?: Node,
  filter: SymbolFilter = defaultFilter,
  isRootType: boolean = true
) {
  return getIndexSignatures(node).map((indexSignature) => {
    const text = indexSignature.getText()
    const keyType = resolveType(
      indexSignature.getKeyType(),
      indexSignature,
      filter,
      isRootType
    )

    if (!keyType) {
      throw new Error(
        `[renoun]: No key type found for "${text}". Please file an issue if you encounter this error.`
      )
    }

    const valueType = resolveType(
      indexSignature.getReturnType(),
      indexSignature,
      filter,
      isRootType
    )

    if (!valueType) {
      throw new Error(
        `[renoun]: No value type found for "${text}". Please file an issue if you encounter this error.`
      )
    }

    return {
      kind: 'Index',
      key: keyType,
      value: valueType,
      text,
    } satisfies IndexType
  }) as IndexType[]
}

/** Get the index signature of an interface or type alias. */
function getIndexSignatures(node?: Node) {
  let indexSignatures: IndexSignatureDeclaration[] = []

  if (tsMorph.Node.isInterfaceDeclaration(node)) {
    indexSignatures = node.getIndexSignatures()
  } else if (tsMorph.Node.isTypeAliasDeclaration(node)) {
    const typeNode = node.getTypeNodeOrThrow()
    if (tsMorph.Node.isTypeLiteral(typeNode)) {
      indexSignatures = typeNode.getIndexSignatures()
    }
  }

  return indexSignatures
}

/** Process all apparent properties of a given type. */
export function resolveTypeProperties(
  type: Type,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  isRootType: boolean = true,
  defaultValues?: Record<string, unknown> | unknown
): ResolvedType[] {
  const isReadonly = isTypeReadonly(type, enclosingNode)

  return type
    .getApparentProperties()
    .map((property) => {
      const symbolMetadata = getSymbolMetadata(property, enclosingNode)
      const propertyDeclaration = property.getDeclarations().at(0) as
        | PropertySignature
        | undefined
      const declaration = propertyDeclaration || enclosingNode
      const filterResult = filter(symbolMetadata)

      if (filterResult === false) {
        return
      }

      if (declaration) {
        const name = property.getName()
        const defaultValue =
          defaultValues && propertyDeclaration
            ? (defaultValues as Record<string, unknown>)[
                getPropertyDefaultValueKey(propertyDeclaration)
              ]
            : undefined

        // Store the metadata of the enclosing node for file location comparison used in resolveType
        enclosingNodeMetadata.set(declaration, symbolMetadata)

        const propertyType = property.getTypeAtLocation(declaration)
        const resolvedProperty = resolveType(
          propertyType,
          declaration,
          filter,
          isRootType,
          defaultValue
        )

        if (resolvedProperty) {
          const isOptional = Boolean(
            propertyDeclaration?.hasQuestionToken() || defaultValue
          )
          const isPropertyReadonly = propertyDeclaration
            ? 'isReadonly' in propertyDeclaration
              ? propertyDeclaration.isReadonly()
              : false
            : false

          return {
            ...resolvedProperty,
            ...getJsDocMetadata(declaration),
            context: 'property',
            name,
            defaultValue,
            isOptional,
            isReadonly: isReadonly || isPropertyReadonly,
          } satisfies PropertyTypes
        }
      } else {
        throw new Error(
          `[renoun:resolveTypeProperties]: No property declaration found for "${property.getName()}". You must pass the enclosing node as the second argument to "resolveTypeProperties".`
        )
      }
    })
    .filter(Boolean) as PropertyTypes[]
}

/** Process all elements of a tuple type. */
function resolveTypeTupleElements(
  type: Type,
  enclosingNode?: Node,
  filter?: SymbolFilter,
  isRootType: boolean = true
) {
  const tupleNames = type
    .getText()
    .slice(1, -1)
    .split(',')
    .map((signature) => {
      const [name] = signature.split(':')
      return name ? name.trim() : undefined
    })
  return type
    .getTupleElements()
    .map((tupleElementType, index) => {
      const resolvedType = resolveType(
        tupleElementType,
        enclosingNode,
        filter,
        isRootType
      )
      if (resolvedType) {
        return {
          ...resolvedType,
          name: tupleNames[index],
        } satisfies ResolvedType
      }
    })
    .filter(Boolean) as ResolvedType[]
}

/** Check if every type argument is in node_modules. */
function isEveryTypeInNodeModules(types: (Type | TypeNode)[]) {
  if (types.length === 0) {
    return false
  }
  return types.every((type) =>
    type.getSymbol()?.getDeclarations().at(0)?.getSourceFile().isInNodeModules()
  )
}

/** Checks if a type is a primitive type. */
function isPrimitiveType(type: Type) {
  return (
    type.isBoolean() ||
    type.isBooleanLiteral() ||
    type.isNumber() ||
    type.isNumberLiteral() ||
    type.isString() ||
    type.isStringLiteral() ||
    type.isTemplateLiteral() ||
    type.isUndefined() ||
    type.isNull() ||
    type.isAny() ||
    type.isUnknown() ||
    type.isNever() ||
    isSymbol(type) ||
    isBigInt(type)
  )
}

/** Check if a type is a symbol. */
function isSymbol(type: Type) {
  const symbol = type.getSymbol()
  return symbol?.getName() === 'Symbol'
}

/** Check if a type is a bigint. */
function isBigInt(type: Type) {
  return type.getText() === 'bigint'
}

/** Gather metadata about a symbol. */
function getSymbolMetadata(
  symbol?: Symbol,
  enclosingNode?: Node
): {
  /** The name of the symbol if it exists. */
  name?: string

  /** Whether or not the symbol is exported. */
  isExported: boolean

  /** Whether or not the symbol is external to the current source file. */
  isExternal: boolean

  /** Whether or not the symbol is located in node_modules. */
  isInNodeModules: boolean

  /** Whether or not the symbol is global. */
  isGlobal: boolean

  /** Whether or not the node is generated by the compiler. */
  isVirtual: boolean

  /** Whether or not the symbol is private. */
  isPrivate: boolean

  /** The file path for the symbol declaration. */
  filePath?: string
} {
  if (!symbol) {
    return {
      isExported: false,
      isExternal: false,
      isInNodeModules: false,
      isGlobal: false,
      isVirtual: true,
      isPrivate: false,
    }
  }

  const declarations = symbol.getDeclarations()

  if (declarations.length === 0) {
    return {
      isExported: false,
      isExternal: false,
      isInNodeModules: false,
      isGlobal: false,
      isVirtual: false,
      isPrivate: false,
    }
  }

  const declaration = declarations.at(0)!
  const declarationSourceFile = declaration?.getSourceFile()
  const enclosingNodeSourceFile = enclosingNode?.getSourceFile()

  /** Attempt to get the name of the symbol. */
  let name: string | undefined

  if (
    // If the symbol value declaration is a variable use the name from the enclosing node if provided
    tsMorph.Node.isVariableDeclaration(symbol.getValueDeclaration()) ||
    // Otherwise, use the enclosing node if it is a variable declaration
    tsMorph.Node.isVariableDeclaration(enclosingNode)
  ) {
    if (
      tsMorph.Node.isVariableDeclaration(enclosingNode) &&
      declaration !== enclosingNode
    ) {
      name = enclosingNode.getName()
    }
    // Don't use the name from the symbol if this fails to prevent using apparent names like String, Number, etc.
  } else {
    name = symbol.getName()
  }

  // Ignore private symbol names e.g. __type, __call, __0, etc.
  if (name?.startsWith('__')) {
    name = undefined
  }

  /** Check if the symbol is exported if it is not the enclosing node. */
  let isExported = false

  if (declaration !== enclosingNode) {
    if ('isExported' in declaration) {
      // @ts-expect-error - isExported is not defined on all declaration types
      isExported = declaration.isExported()
    } else {
      // alternatively, check if the declaration's parent is an exported variable declaration
      const variableDeclaration = declaration.getParent()
      if (tsMorph.Node.isVariableDeclaration(variableDeclaration)) {
        isExported = variableDeclaration.isExported()
      }
    }
  }

  /** Check if a type is external to the enclosing source file. */
  let isExternal = false

  // TODO: this is not sufficient because the enclosing node can be from node modules e.g. Promise
  // this should use a root source file to determine if the symbol is external
  if (enclosingNodeSourceFile && !enclosingNodeSourceFile.isInNodeModules()) {
    isExternal = enclosingNodeSourceFile !== declarationSourceFile
  }

  const isInNodeModules = declarationSourceFile.isInNodeModules()

  return {
    name,
    isExported,
    isExternal,
    isInNodeModules,
    isPrivate: name ? name.startsWith('#') || name.startsWith('_') : false,
    isGlobal: isInNodeModules && !isExported,
    isVirtual: false,
    filePath: declarationSourceFile.getFilePath(),
  }
}

/** Gets the location of a declaration. */
function getDeclarationLocation(declaration: Node): {
  /** The file path for the symbol declaration relative to the project. */
  filePath?: string

  /** The line and column number of the symbol declaration. */
  position?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
} {
  const filePath = getFilePathRelativeToProject(declaration)
  const sourceFile = declaration.getSourceFile()

  return {
    filePath,
    position: {
      start: sourceFile.getLineAndColumnAtPos(declaration.getStart()),
      end: sourceFile.getLineAndColumnAtPos(declaration.getEnd()),
    },
  }
}

/** Calculate a file path of a source file relative to the project root. */
function getFilePathRelativeToProject(declaration: Node) {
  const sourceFile = declaration.getSourceFile()
  const rootFilePath = getRootFilePath(sourceFile.getProject())
  let trimmedFilePath = sourceFile.getFilePath().replace(rootFilePath, '')

  if (trimmedFilePath.includes('node_modules')) {
    trimmedFilePath = trimmedFilePath.slice(
      trimmedFilePath.lastIndexOf('node_modules') - 1
    )
  }

  return trimmedFilePath.startsWith('/')
    ? trimmedFilePath.slice(1)
    : trimmedFilePath
}

const rootFilePaths = new WeakMap<Project, string>()

/** Gets the root source file path for a project. */
function getRootFilePath(project: Project) {
  let rootFilePath: string

  if (!rootFilePaths.has(project)) {
    rootFilePath = project.getFileSystem().getCurrentDirectory()
    rootFilePaths.set(project, rootFilePath)
  } else {
    rootFilePath = rootFilePaths.get(project)!
  }

  return rootFilePath
}

/** Get the modifier of a function or method declaration. */
function getModifier(node: FunctionDeclaration | MethodDeclaration) {
  if (node.isAsync()) {
    return 'async'
  }

  if (node.isGenerator()) {
    return 'generator'
  }
}

/** Get the visibility of a class member. */
function getVisibility(
  node:
    | MethodDeclaration
    | SetAccessorDeclaration
    | GetAccessorDeclaration
    | PropertyDeclaration
) {
  if (node.hasModifier(tsMorph.SyntaxKind.PrivateKeyword)) {
    return 'private'
  }

  if (node.hasModifier(tsMorph.SyntaxKind.ProtectedKeyword)) {
    return 'protected'
  }

  if (node.hasModifier(tsMorph.SyntaxKind.PublicKeyword)) {
    return 'public'
  }
}

/** Get the scope of a class member. */
function getScope(
  node:
    | MethodDeclaration
    | SetAccessorDeclaration
    | GetAccessorDeclaration
    | PropertyDeclaration
) {
  if (node.isAbstract()) {
    return 'abstract'
  }

  if (node.isStatic()) {
    return 'static'
  }
}

/** Processes a class declaration into a metadata object. */
function resolveClass(
  classDeclaration: ClassDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): ClassType {
  const classMetadata: ClassType = {
    kind: 'Class',
    name: classDeclaration.getName(),
    text: classDeclaration
      .getType()
      .getText(classDeclaration, TYPE_FORMAT_FLAGS),
    ...getJsDocMetadata(classDeclaration),
  }

  const constructorSignatures = classDeclaration
    .getConstructors()
    .map((constructor) => constructor.getSignature())

  if (constructorSignatures.length) {
    classMetadata.constructors = resolveCallSignatures(
      constructorSignatures,
      classDeclaration,
      filter,
      dependencies
    )
  }

  classDeclaration.getMembers().forEach((member) => {
    if (
      tsMorph.Node.isGetAccessorDeclaration(member) ||
      tsMorph.Node.isSetAccessorDeclaration(member)
    ) {
      if (!member.hasModifier(tsMorph.SyntaxKind.PrivateKeyword)) {
        if (!classMetadata.accessors) {
          classMetadata.accessors = []
        }
        const resolvedAccessor = resolveClassAccessor(
          member,
          filter,
          dependencies
        )
        if (resolvedAccessor) {
          classMetadata.accessors.push(resolvedAccessor)
        }
      }
    } else if (tsMorph.Node.isMethodDeclaration(member)) {
      if (!member.hasModifier(tsMorph.SyntaxKind.PrivateKeyword)) {
        if (!classMetadata.methods) {
          classMetadata.methods = []
        }
        const resolvedMethod = resolveClassMethod(member, filter, dependencies)
        if (resolvedMethod) {
          classMetadata.methods.push(resolvedMethod)
        }
      }
    } else if (tsMorph.Node.isPropertyDeclaration(member)) {
      if (!member.hasModifier(tsMorph.SyntaxKind.PrivateKeyword)) {
        if (!classMetadata.properties) {
          classMetadata.properties = []
        }
        const resolvedProperty = resolveClassProperty(
          member,
          filter,
          dependencies
        )
        if (resolvedProperty) {
          classMetadata.properties.push(resolvedProperty)
        }
      }
    }
  })

  return classMetadata
}

/** Processes a class accessor (getter or setter) declaration into a metadata object. */
function resolveClassAccessor(
  accessor: GetAccessorDeclaration | SetAccessorDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): ClassAccessorType | undefined {
  const symbolMetadata = getSymbolMetadata(accessor.getSymbol(), accessor)
  const filterResult = filter(symbolMetadata)

  if (filterResult === false) {
    return
  }

  const sharedMetadata: SharedClassMemberType = {
    name: accessor.getName(),
    scope: getScope(accessor),
    visibility: getVisibility(accessor),
    text: accessor.getType().getText(accessor, TYPE_FORMAT_FLAGS),
    decorators: resolveDecorators(
      accessor.getDecorators(),
      filter,
      dependencies
    ),
    ...getJsDocMetadata(accessor),
  }

  if (tsMorph.Node.isSetAccessorDeclaration(accessor)) {
    const resolvedSignature = resolveSignature(
      accessor.getSignature(),
      accessor,
      filter,
      dependencies
    )

    if (resolvedSignature) {
      return {
        ...resolvedSignature,
        ...sharedMetadata,
        kind: 'ClassSetAccessor',
        text: accessor.getType().getText(accessor, TYPE_FORMAT_FLAGS),
      } satisfies ClassSetAccessorType
    }

    throw new Error(
      `[renoun:resolveClassAccessor] Class accessor type could not be resolved. This declaration was either filtered, should be marked as internal, or filed as an issue for support.\n\n${printNode(accessor)}`
    )
  }

  return {
    ...sharedMetadata,
    kind: 'ClassGetAccessor',
  } satisfies ClassGetAccessorType
}

/** Processes a method declaration into a metadata object. */
function resolveClassMethod(
  method: MethodDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): ClassMethodType | undefined {
  const callSignatures = method.getType().getCallSignatures()
  const symbolMetadata = getSymbolMetadata(method.getSymbol(), method)
  const filterResult = filter(symbolMetadata)

  if (filterResult === false) {
    return
  }

  return {
    kind: 'ClassMethod',
    name: method.getName(),
    scope: getScope(method),
    visibility: getVisibility(method),
    signatures: resolveCallSignatures(
      callSignatures,
      method,
      filter,
      dependencies
    ),
    text: method.getType().getText(method, TYPE_FORMAT_FLAGS),
    decorators: resolveDecorators(method.getDecorators(), filter, dependencies),
    ...getJsDocMetadata(method),
  } satisfies ClassMethodType
}

/** Processes a class property declaration into a metadata object. */
function resolveClassProperty(
  property: PropertyDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): ClassPropertyType | undefined {
  const symbolMetadata = getSymbolMetadata(property.getSymbol(), property)
  const filterResult = filter(symbolMetadata)

  if (filterResult === false) {
    return
  }

  const resolvedType = resolveType(
    property.getType(),
    property,
    filter,
    false,
    undefined,
    false,
    dependencies
  )

  if (resolvedType) {
    return {
      ...resolvedType,
      ...getJsDocMetadata(property),
      name: property.getName(),
      defaultValue: getPropertyDefaultValue(property),
      scope: getScope(property),
      visibility: getVisibility(property),
      isReadonly: property.isReadonly(),
      decorators: resolveDecorators(
        property.getDecorators(),
        filter,
        dependencies
      ),
    } satisfies ClassPropertyType
  }

  throw new Error(
    `[renoun:resolveClassProperty] Class property type could not be resolved. This declaration was either filtered, should be marked as internal, or filed as an issue for support.\n\n${printNode(property)}`
  )
}

/** Resolve the decorators of a class member. */
function resolveDecorators(
  decorators: Decorator[],
  filter?: SymbolFilter,
  dependencies?: Set<string>
) {
  return decorators
    .map((decorator) => {
      const expression = decorator.getExpression()
      return resolveType(
        expression.getType(),
        expression,
        filter,
        false,
        undefined,
        false,
        dependencies
      )
    })
    .filter(Boolean) as ResolvedType[]
}

/** Get the primary declaration of a symbol preferred by type hierarchy. */
function getPrimaryDeclaration(symbol: Symbol | undefined): Node | undefined {
  if (!symbol) return undefined

  const declarations = symbol.getDeclarations()

  // Prioritize declarations based on the preferred type hierarchy
  // Type-related symbols: TypeAlias, Interface, Enum, Class
  const typeRelatedDeclaration = declarations.find(
    (declaration) =>
      declaration.getKind() === tsMorph.SyntaxKind.TypeAliasDeclaration ||
      declaration.getKind() === tsMorph.SyntaxKind.InterfaceDeclaration ||
      declaration.getKind() === tsMorph.SyntaxKind.EnumDeclaration ||
      declaration.getKind() === tsMorph.SyntaxKind.ClassDeclaration
  )

  if (typeRelatedDeclaration) {
    return typeRelatedDeclaration
  }

  // If no type-related declaration, check for functions with a body in the case of function overloads
  const functionWithBodyDeclaration = declarations.find((declaration) => {
    return (
      tsMorph.Node.isFunctionDeclaration(declaration) && declaration.hasBody()
    )
  })

  if (functionWithBodyDeclaration) {
    return functionWithBodyDeclaration
  }

  // If no type-related or function with body, fallback to any available declaration
  return declarations[0]
}

/** Determines if a type is readonly. */
function isTypeReadonly(type: Type, enclosingNode: Node | undefined) {
  let isReadonly = false

  /** Check if the type is marked as Readonly using the TypeScript utility type. */
  if (type.getText().startsWith('Readonly')) {
    isReadonly = Boolean(
      type
        .getSymbol()
        ?.getDeclarations()
        .at(0)
        ?.getSourceFile()
        .getFilePath()
        .includes('node_modules/typescript')
    )
  }

  /** Alternatively, check for const assertion. */
  if (
    isReadonly === false &&
    tsMorph.Node.isVariableDeclaration(enclosingNode)
  ) {
    const initializer = enclosingNode.getInitializer()

    if (tsMorph.Node.isAsExpression(initializer)) {
      const typeNode = initializer.getTypeNode()

      if (typeNode) {
        isReadonly = typeNode.getText() === 'const'
      }
    }
  }

  return isReadonly
}

/** Determines if a function is a component based on its name and call signature shape. */
function isComponent(
  name: string | undefined,
  callSignatures: FunctionSignatureType[]
) {
  if (!name) {
    return false
  }

  const isFirstLetterCapitalized = /[A-Z]/.test(name.charAt(0))

  if (!isFirstLetterCapitalized || callSignatures.length === 0) {
    return false
  }

  return callSignatures.every((signature) => {
    const parameterCount = signature.parameters.length
    return parameterCount === 0 || parameterCount === 1
  })
}

/** Prints helpful information about a node for debugging. */
function printNode(
  node: tsMorph.Node | tsMorph.FunctionDeclaration | tsMorph.PropertyDeclaration
) {
  const kindName = node.getKindName()
  let output = `(${kindName})\n`

  if (tsMorph.Node.isFunctionDeclaration(node)) {
    output += `Name: ${node.getName()}\n`
    output += `Signature: ${node.getSignature().getDeclaration().getText()}\n`
  } else if (tsMorph.Node.isPropertyDeclaration(node)) {
    output += `Name: ${node.getName()}\n`
    output += `Type: ${node.getType().getText()}\n`
  }

  output += `Text:\n${node.getText()}\n`
  output += `Start: ${node.getStart()}, End: ${node.getEnd()}\n`

  return output
}
