import type {
  ClassDeclaration,
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
import { get } from 'http'
import type { Init } from 'v8'

export namespace Kind {
  /** Metadata present in all types. */
  export interface Shared {
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

  /** Metadata present in all type declarations. */
  export interface SharedDocumentable extends Shared {
    /** The name of the declaration. Implicit names will be undefined. */
    name?: string

    /** The description of the declaration if present. */
    description?: string

    /** JSDoc tags for the declaration if present. */
    tags?: { name: string; text?: string }[]
  }

  export interface String extends Shared {
    kind: 'String'
    value?: string
  }

  export interface Number extends Shared {
    kind: 'Number'
    value?: number
  }

  export interface Boolean extends Shared {
    kind: 'Boolean'
  }

  export interface Symbol extends Shared {
    kind: 'Symbol'
  }

  export interface Array<Element extends TypeExpression = TypeExpression>
    extends Shared {
    kind: 'Array'

    /** The type of the accepted array element. */
    element: Element

    /** Whether the array is marked as readonly, e.g. `readonly string[]` or `ReadonlyArray<string>`. */
    isReadonly?: boolean
  }

  export interface TupleElement<Type extends TypeExpression = TypeExpression>
    extends Shared {
    kind: 'TupleElement'

    /** The label of the tuple element, e.g. `x` in `[x: number]`. */
    name?: string

    /** Element type or array element type for rest tuples. */
    type: Type

    /** Whether the element is written with a `...` rest prefix. */
    isRest?: boolean

    /** Whether the element has a question token, e.g. `[x?: number]`. */
    isOptional?: boolean

    /** Whether the element has a `readonly` modifier, e.g. `[readonly x: string]`. */
    isReadonly?: boolean
  }

  export interface Tuple extends Shared {
    kind: 'Tuple'

    /** The elements of the tuple. */
    elements: TupleElement[]

    /** Whether the tuple is readonly, e.g. `readonly [x: number]`. */
    isReadonly?: boolean
  }

  export interface Any extends Shared {
    kind: 'Any'
  }

  export interface Unknown extends Shared {
    kind: 'Unknown'
  }

  export interface TypeLiteral extends Shared {
    kind: 'TypeLiteral'

    /** The member types of the type literal. */
    members: (
      | CallSignature
      | ConstructSignature
      | GetAccessorSignature
      | SetAccessorSignature
      | IndexSignature
      | MethodSignature
      | PropertySignature
    )[]
  }

  export interface IntersectionType<
    Types extends TypeExpression[] = TypeExpression[],
  > extends Shared {
    kind: 'IntersectionType'
    types: Types
  }

  export interface UnionType<Types extends TypeExpression[] = TypeExpression[]>
    extends Shared {
    kind: 'UnionType'
    types: Types
  }

  export interface MappedType extends Shared {
    kind: 'MappedType'

    /** The type parameter e.g. `[Key in keyof Type]` for `{ [Key in keyof Type]: Type[Key] }`. */
    parameter: TypeParameter

    /** The resolved type e.g. `Type[Key]` for `{ [Key in keyof Type]: Type[Key] }`. */
    type: TypeExpression

    /** Whether the resolved keys are marked readonly. */
    isReadonly?: boolean

    /** Whether the resolved keys are marked optional. */
    isOptional?: boolean
  }

  export interface IndexSignature<Type extends TypeExpression = TypeExpression>
    extends Shared {
    kind: 'IndexSignature'
    key: 'string' | 'number' | 'symbol'
    type: Type
  }

  export interface EnumMember extends SharedDocumentable {
    kind: 'EnumMember'

    /** The value of the enum member. */
    value?: string | number
  }

  export interface Enum extends SharedDocumentable {
    kind: 'Enum'
    members: EnumMember[]
  }

  export interface Initializer extends Shared {
    /** The initializer source text. */
    text: string

    /** The initializer parsed as a literal value if possible. */
    value?: unknown
  }

  export interface Class extends SharedDocumentable {
    kind: 'Class'
    constructor?: ClassConstructor
    accessors?: ClassAccessor[]
    methods?: ClassMethod[]
    properties?: ClassProperty[]
    extends?: TypeReference
    implements?: TypeReference[]
  }

  export interface ClassConstructor extends SharedDocumentable {
    kind: 'ClassConstructor'
    signatures: FunctionSignature[]
  }

  export interface SharedClassMember extends SharedDocumentable {
    /** The scope modifier of the class member. If not provided, the member is related to the instance. */
    scope?: 'abstract' | 'static'

    /** The visibility modifier of the class member. If not provided, the member is assumed to be public. */
    visibility?: 'private' | 'protected' | 'public'

    /** Whether the property is an override of a base class property. */
    isOverride?: boolean
  }

  export interface ClassGetAccessor extends SharedClassMember {
    kind: 'ClassGetAccessor'

    /** The return type of the getter. */
    returnType: TypeExpression
  }

  export interface ClassSetAccessor extends SharedClassMember {
    kind: 'ClassSetAccessor'

    /** The parameter of the setter. */
    parameter: Parameter
  }

  export type ClassAccessor = ClassGetAccessor | ClassSetAccessor

  export interface ClassMethod extends SharedClassMember {
    kind: 'ClassMethod'
    signatures: FunctionSignature[]
  }

  export interface ClassProperty<Type extends TypeExpression = TypeExpression>
    extends SharedClassMember {
    kind: 'ClassProperty'

    /** The type of the class property. */
    type: Type

    /** The initial value assigned to the property. */
    initializer?: Initializer

    /** Whether the property has a question token or initial value. */
    isOptional?: boolean

    /** Whether the property has a readonly modifier. */
    isReadonly?: boolean
  }

  export interface SharedCallable extends Shared {
    /** The parameters of the call signature. */
    typeParameters?: TypeParameter[]

    /** The return type of the call signature. */
    returnType: TypeExpression

    /** Whether an async modifier is present or the return type includes a promise. */
    isAsync?: boolean

    /** Whether the call signature is a generator function. */
    isGenerator?: boolean
  }

  export interface ConstructSignature
    extends SharedDocumentable,
      SharedCallable {
    kind: 'ConstructSignature'
    parameters: Parameter[]
  }

  export interface CallSignature extends SharedDocumentable, SharedCallable {
    kind: 'CallSignature'
    parameters: Parameter[]
  }

  export interface GetAccessorSignature
    extends SharedDocumentable,
      SharedCallable {
    kind: 'GetAccessorSignature'

    /** The return type of the getter. */
    returnType: TypeExpression
  }

  export interface SetAccessorSignature
    extends SharedDocumentable,
      SharedCallable {
    kind: 'SetAccessorSignature'

    /** The parameter type of the setter. */
    parameter: Parameter
  }

  export interface FunctionSignature
    extends SharedDocumentable,
      SharedCallable {
    kind: 'FunctionSignature'
    parameters: Parameter[]
  }

  export interface Function extends SharedDocumentable {
    kind: 'Function'
    signatures: FunctionSignature[]
  }

  export interface FunctionType extends SharedCallable {
    kind: 'FunctionType'
    parameters: Parameter[]
  }

  export type ComponentParameter =
    | TypeLiteral
    | TypeReference
    | IntersectionType<ComponentParameter[]>
    | UnionType<ComponentParameter[]>

  export interface ComponentSignature
    extends SharedDocumentable,
      SharedCallable {
    kind: 'ComponentSignature'
    parameter?: ComponentParameter
  }

  export interface Component extends SharedDocumentable {
    kind: 'Component'
    signatures: ComponentSignature[]
  }

  export interface ComponentType extends SharedCallable {
    kind: 'ComponentType'
    parameter?: ComponentParameter
  }

  export interface Interface extends SharedDocumentable {
    kind: 'Interface'

    /** The member types of the interface. */
    members: (
      | CallSignature
      | ConstructSignature
      | GetAccessorSignature
      | SetAccessorSignature
      | IndexSignature
      | MethodSignature
      | PropertySignature
    )[]
  }

  export interface TypeParameter extends SharedDocumentable {
    kind: 'TypeParameter'

    /** The constraint type of the type parameter. */
    constraint?: TypeExpression

    /** The default type of the type parameter. */
    defaultType?: TypeExpression
  }

  /** Represents a type alias declaration e.g. `type Partial<Type> = { [Key in keyof Type]?: Type[Key] }`. */
  export interface TypeAlias<Type extends TypeExpression = TypeExpression>
    extends SharedDocumentable {
    kind: 'TypeAlias'

    /** The type expression. */
    type: Type

    /** The type parameters that can be provided as arguments to the type alias. */
    parameters: TypeParameter[]
  }

  /** Represents when a type alias is used as a reference e.g. `Partial<Type>`. */
  export interface TypeReference extends Shared {
    kind: 'TypeReference'

    /** The name of the type reference, e.g. `Partial` in `Partial<Type>`. */
    name: string

    /** The type arguments passed in during usage, e.g. `Type` in `Partial<Type>`. */
    arguments?: TypeExpression[]
  }

  /** A function or method parameter. */
  export interface Parameter<Type extends TypeExpression = TypeExpression>
    extends SharedDocumentable {
    kind: 'Parameter'

    /** The type expression of the parameter. */
    type: Type

    /** The initial value assigned to the parameter. */
    initializer?: Initializer

    /** Whether the parameter has an optional modifier or initial value. If `isRest` is `true`, the parameter is always optional. */
    isOptional?: boolean

    /** Whether the parameter is a rest parameter, e.g. `...rest`. */
    isRest?: boolean
  }

  /** An interface or type alias property signature. */
  export interface PropertySignature<
    Type extends TypeExpression = TypeExpression,
  > extends SharedDocumentable {
    kind: 'PropertySignature'

    /** The type expression of the property signature. */
    type: Type

    /** Whether the property has an optional modifier. */
    isOptional?: boolean

    /** Whether the property has a readonly modifier. */
    isReadonly?: boolean
  }

  /** An interface or type alias method signature. */
  export interface MethodSignature extends SharedDocumentable, SharedCallable {
    kind: 'MethodSignature'
    parameters: Parameter[]
  }

  export type TypeExpression =
    | String
    | Number
    | Boolean
    | Symbol
    | Array
    | Tuple
    | IntersectionType
    | UnionType
    | MappedType
    | FunctionType
    | ComponentType
    | TypeReference
    | TypeLiteral
    | Any
    | Unknown

  export type All =
    | TypeExpression
    | Class
    | ClassProperty
    | ClassMethod
    | ClassAccessor
    | Function
    | Component
    | Interface
    | Enum
    | EnumMember
    | TypeAlias
    | TypeParameter
    | CallSignature
    | ConstructSignature
    | ComponentSignature
    | FunctionSignature
    | IndexSignature
    | MethodSignature
    | PropertySignature
    | Parameter

  // TODO: still need to add ThisType, InferType, ConditionalType, IndexedAccessType
}

export type TypeByKind<Type, Key> = Type extends { kind: Key } ? Type : never

export type TypeOfKind<Key extends Kind.All['kind']> = TypeByKind<Kind.All, Key>

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

/** Process type metadata. */
export function resolveType(
  type: Type,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  isRootType: boolean = true,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.All | undefined {
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
  const declaration = symbolDeclaration || enclosingNode

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

  if (
    tsMorph.Node.isTypeReference(enclosingNode) &&
    (symbolMetadata.isExported ||
      symbolMetadata.isInNodeModules ||
      symbolMetadata.isExternal)
  ) {
    const name = typeName ?? symbolMetadata.name

    if (!name) {
      throw new Error(
        `[renoun:resolveType]: No type name found for type reference "${typeText}" with kind "${symbolDeclaration?.getKindName()}" and enclosing node kind "${enclosingNode.getKindName()}". Please file an issue if you encounter this error.`
      )
    }

    return {
      kind: 'TypeReference',
      name,
      text: typeText,
      arguments: enclosingNode
        .getTypeArguments()
        .map((argument) =>
          resolveType(
            argument.getType(),
            argument,
            filter,
            false,
            defaultValues,
            keepReferences,
            dependencies
          )
        )
        .filter(Boolean) as Kind.TypeExpression[],
      ...declarationLocation,
    } satisfies Kind.TypeReference
  }

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
  const typeArguments = type.getTypeArguments()
  const aliasTypeArguments = type.getAliasTypeArguments()

  /* When the type is a property signature, check if it is referencing an exported symbol. */
  if (
    tsMorph.Node.isPropertySignature(enclosingNode) &&
    tsMorph.Node.isExportable(symbolDeclaration) &&
    symbolDeclaration.isExported()
  ) {
    const name = typeName ?? symbolMetadata.name

    if (!name) {
      throw new Error(
        `[renoun:resolveType]: No type name found for property signature "${typeText}" with kind "${symbolDeclaration?.getKindName()}" and enclosing node kind "${enclosingNode.getKindName()}". Please file an issue if you encounter this error.`
      )
    }

    return {
      kind: 'TypeReference',
      name,
      text: typeText,
      ...declarationLocation,
    } satisfies Kind.TypeReference
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
            .filter((type): type is Kind.TypeExpression => Boolean(type))

          if (resolvedTypeArguments.length === 0) {
            return
          }

          const name = typeName ?? symbolMetadata.name

          if (!name) {
            throw new Error(
              `[renoun:resolveType]: No type name found for type reference "${typeText}" with kind "${symbolDeclaration?.getKindName()}" and enclosing node kind "${enclosingNode.getKindName()}". Please file an issue if you encounter this error.`
            )
          }

          return {
            kind: 'TypeReference',
            text: typeText,
            name,
            arguments: resolvedTypeArguments,
            ...declarationLocation,
          } satisfies Kind.TypeReference
        } else {
          if (!declarationLocation.filePath) {
            throw new Error(
              `[renoun:resolveType]: No file path found for "${typeText}". Please file an issue if you encounter this error.`
            )
          }
          let name = typeName ?? symbolMetadata.name

          if (!name && tsMorph.Node.isPropertySignature(enclosingNode)) {
            const typeNode = enclosingNode.getTypeNode()
            if (typeNode) {
              name = typeNode.getText()
            }
          }

          if (!name) {
            throw new Error(
              `[renoun:resolveType]: No type name found for type reference "${typeText}" with kind "${symbolDeclaration?.getKindName()}" and enclosing node kind "${enclosingNode.getKindName()}". Please file an issue if you encounter this error.`
            )
          }

          return {
            kind: 'TypeReference',
            name,
            text: typeText,
            ...declarationLocation,
          } satisfies Kind.TypeReference
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

    if (
      isReference ||
      isLocallyExportedReference ||
      isExternalNonNodeModuleReference ||
      isNodeModuleReference
    ) {
      if (!declarationLocation.filePath) {
        throw new Error(
          `[renoun:resolveType]: No file path found for "${typeText}". Please file an issue if you encounter this error.`
        )
      }

      /* Allow node_module references to be filtered in. */
      if (filter === defaultFilter ? true : !filter(symbolMetadata)) {
        let name = typeName ?? symbolMetadata.name

        if (!name && tsMorph.Node.isParameterDeclaration(enclosingNode)) {
          const typeNode = enclosingNode.getTypeNode()
          if (typeNode) {
            name = typeNode.getText()
          }
        }

        return {
          kind: 'TypeReference',
          name: name ?? '',
          text: typeText,
          ...declarationLocation,
        } satisfies Kind.TypeReference
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

  let resolvedType: Kind.All = {
    kind: 'Unknown',
    text: typeText,
  } satisfies Kind.Unknown

  if (type.isBoolean() || type.isBooleanLiteral()) {
    resolvedType = {
      kind: 'Boolean',
      text: typeText,
    } satisfies Kind.Boolean
  } else if (type.isNumber() || type.isNumberLiteral()) {
    resolvedType = {
      kind: 'Number',
      text: typeText,
      value: type.getLiteralValue() as number,
    } satisfies Kind.Number
  } else if (type.isString() || type.isStringLiteral()) {
    resolvedType = {
      kind: 'String',
      text: typeText,
      value: type.getLiteralValue() as string,
    } satisfies Kind.String
  } else if (isSymbol(type)) {
    resolvedType = {
      kind: 'Symbol',
      text: typeText,
    } satisfies Kind.Symbol
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
    ) as Kind.TypeExpression | undefined
    if (resolvedElementType) {
      resolvedType = {
        kind: 'Array',
        text: typeText,
        element: resolvedElementType,
      } satisfies Kind.Array
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

    const name = typeName ?? symbolMetadata.name

    if (!name) {
      throw new Error(
        `[renoun:resolveType]: No type name found for type alias "${typeText}" with kind "${symbolDeclaration?.getKindName()}" and enclosing node kind "${enclosingNode.getKindName()}". Please file an issue if you encounter this error.`
      )
    }

    resolvedType = {
      kind: 'TypeAlias',
      name,
      text: typeText,
      type: resolvedUtilityType as Kind.TypeExpression,
      parameters: aliasTypeArguments
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
        .filter((type): type is Kind.TypeParameter => Boolean(type)),
    } satisfies Kind.TypeAlias
  } else {
    if (type.isTypeParameter()) {
      if (tsMorph.Node.isTypeReference(enclosingNode)) {
        const name = typeName ?? symbolMetadata.name

        if (!name) {
          throw new Error(
            `[renoun:resolveType]: No type name found for type reference "${typeText}" with kind "${symbolDeclaration?.getKindName()}" and enclosing node kind "${enclosingNode.getKindName()}". Please file an issue if you encounter this error.`
          )
        }

        resolvedType = {
          kind: 'TypeReference',
          name,
          text: typeText,
          arguments: typeArguments
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
            .filter(Boolean) as Kind.TypeExpression[],
        } satisfies Kind.TypeReference
      } else {
        const constraintType = type.getConstraint()
        const defaultType = type.getDefault()
        const name = typeName ?? symbolMetadata.name

        if (!name) {
          throw new Error(
            `[renoun:resolveType]: No type name found for type parameter "${typeText}" with kind "${symbolDeclaration?.getKindName()}" and enclosing node kind "${enclosingNode?.getKindName()}". Please file an issue if you encounter this error.`
          )
        }

        resolvedType = {
          kind: 'TypeParameter',
          name,
          text: typeText,
          constraint: constraintType
            ? (resolveType(
                constraintType,
                symbolDeclaration,
                filter,
                false,
                defaultValues,
                keepReferences,
                dependencies
              ) as Kind.TypeExpression)
            : undefined,
          defaultType: defaultType
            ? (resolveType(
                defaultType,
                symbolDeclaration,
                filter,
                false,
                defaultValues,
                keepReferences,
                dependencies
              ) as Kind.TypeExpression)
            : undefined,
        } satisfies Kind.TypeParameter
      }
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
          members: symbolDeclaration.getMembers().map((member) => {
            const name = member.getName()
            const value = member.getValue()

            return {
              kind: 'EnumMember',
              name,
              value,
              text: member.getText(),
              ...getJsDocMetadata(member),
              ...getDeclarationLocation(member),
            } satisfies Kind.EnumMember
          }),
        } satisfies Kind.Enum
      } else {
        throw new Error(
          `[renoun:resolveType]: No enum declaration found for "${symbolMetadata.name}". Please file an issue if you encounter this error.`
        )
      }
    } else if (type.isUnion()) {
      let typeNode: tsMorph.TypeNode | undefined

      if (tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)) {
        typeNode = symbolDeclaration.getTypeNode()
      } else if (
        tsMorph.Node.isTypeAliasDeclaration(enclosingNode) ||
        tsMorph.Node.isPropertySignature(enclosingNode) ||
        tsMorph.Node.isPropertyDeclaration(enclosingNode) ||
        tsMorph.Node.isParameterDeclaration(enclosingNode)
      ) {
        typeNode = enclosingNode.getTypeNode()
      }

      // Mixed intersection inside union (`A & B | C`)
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
          .filter(Boolean) as Kind.TypeExpression[]

        if (resolvedIntersectionTypes.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }
          return
        }

        resolvedType = {
          kind: 'IntersectionType',
          text: typeText,
          types: resolvedIntersectionTypes,
        } satisfies Kind.IntersectionType
      } else {
        const unionMembers: Kind.TypeExpression[] = []
        const unionNode = tsMorph.Node.isUnionTypeNode(typeNode)
          ? typeNode
          : tsMorph.Node.isUnionTypeNode(enclosingNode)
            ? (enclosingNode as tsMorph.UnionTypeNode)
            : undefined
        const unionTypeNodes = unionNode
          ? unionNode
              .getTypeNodes()
              .map((node) => ({ node, type: node.getType() }))
          : type.getUnionTypes().map((t) => ({ node: enclosingNode, type: t }))

        for (const { node: memberNode, type: memberType } of unionTypeNodes) {
          const resolved = resolveType(
            memberType,
            memberNode,
            filter,
            false,
            defaultValues,
            keepReferences,
            dependencies
          ) as Kind.TypeExpression | undefined

          if (resolved) {
            const previous = unionMembers.at(-1)
            /* Collapse `true | false` to just `boolean` */
            if (resolved.kind === 'Boolean' && previous?.kind === 'Boolean') {
              unionMembers.pop()
              resolved.text = 'boolean'
            }
            unionMembers.push(resolved)
          }
        }

        const uniqueUnionTypes: Kind.TypeExpression[] = []

        for (const member of unionMembers) {
          const duplicate = uniqueUnionTypes.some((unionType) => {
            return (
              unionType.kind === member.kind &&
              unionType.text === member.text &&
              unionType.path === member.path &&
              member.position?.start.line === unionType.position?.start.line &&
              member.position?.end.line === unionType.position?.end.line
            )
          })
          if (!duplicate) {
            uniqueUnionTypes.push(member)
          }
        }

        if (uniqueUnionTypes.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }
          return
        }

        resolvedType = {
          kind: 'UnionType',
          text:
            symbolMetadata.name === typeText
              ? uniqueUnionTypes.map((type) => type.text).join(' | ')
              : typeText,
          types: uniqueUnionTypes,
        } satisfies Kind.UnionType
      }
    } else if (type.isIntersection()) {
      let intersectionNode: tsMorph.IntersectionTypeNode | undefined

      if (tsMorph.Node.isIntersectionTypeNode(enclosingNode)) {
        intersectionNode = enclosingNode
      } else if (tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)) {
        const typeNode = symbolDeclaration.getTypeNode()
        if (tsMorph.Node.isIntersectionTypeNode(typeNode)) {
          intersectionNode = typeNode
        }
      }

      const intersectionTypes = type.getIntersectionTypes()
      const intersectionNodes = intersectionNode
        ? intersectionNode.getTypeNodes()
        : []
      const resolvedIntersectionTypes = intersectionTypes
        .map((intersectionType, index) => {
          const intersectionNode = intersectionNodes[index]
          const isRootMapped = tsMorph.Node.isMappedTypeNode(intersectionNode)

          return resolveType(
            intersectionType,
            isRootMapped ? intersectionNode : declaration,
            filter,
            false,
            defaultValues,
            keepReferences,
            dependencies
          )
        })
        .filter(Boolean) as Kind.TypeExpression[]

      // Intersection types can safely merge the immediate property signatures to reduce nesting
      const propertySignatures: Kind.PropertySignature[] = []
      let allTypesArePropertySignatures = true

      for (const resolveType of resolvedIntersectionTypes) {
        if (resolveType.kind === 'TypeLiteral') {
          for (const member of resolveType.members) {
            if (member.kind === 'PropertySignature') {
              propertySignatures.push(member)
            } else {
              allTypesArePropertySignatures = false
              break
            }
          }
        } else {
          allTypesArePropertySignatures = false
          break
        }
      }

      if (allTypesArePropertySignatures) {
        if (propertySignatures.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }
          return
        }

        resolvedType = {
          kind: 'TypeLiteral',
          text: typeText,
          members: propertySignatures,
        } satisfies Kind.TypeLiteral
      } else {
        if (resolvedIntersectionTypes.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }
          return
        }

        resolvedType = {
          kind: 'IntersectionType',
          text: typeText,
          types: resolvedIntersectionTypes,
        } satisfies Kind.IntersectionType
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
        text: typeText,
        elements,
      } satisfies Kind.Tuple
    } else if (
      !symbolMetadata.isExported &&
      !symbolMetadata.isInNodeModules &&
      !symbolMetadata.isGlobal &&
      type.isInterface() &&
      tsMorph.Node.isInterfaceDeclaration(symbolDeclaration)
    ) {
      const resolvedMembers = symbolDeclaration
        .getMembers()
        .map((member) => {
          const memberType = resolveType(
            member.getType(),
            symbolDeclaration,
            filter,
            false,
            defaultValues,
            keepReferences,
            dependencies
          ) as Kind.TypeExpression | undefined

          if (!memberType) {
            return undefined
          }

          const memberText = member
            .getType()
            .getText(
              undefined,
              tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
            )

          if (tsMorph.Node.isPropertySignature(member)) {
            return {
              kind: 'PropertySignature',
              name: member.getName(),
              type: memberType,
              text: memberText,
              isOptional: member.hasQuestionToken(),
              isReadonly: member.isReadonly(),
              ...getJsDocMetadata(member),
              ...getDeclarationLocation(member),
            } satisfies Kind.PropertySignature
          } else if (tsMorph.Node.isMethodSignature(member)) {
            const callSignatures = member.getType().getCallSignatures()

            // TODO: need to handle multiple signatures
            return {
              kind: 'MethodSignature',
              name: member.getName(),
              text: memberText,
              parameters:
                callSignatures[0]?.getParameters().map((param) => ({
                  kind: 'Parameter',
                  name: param.getName(),
                  type: resolveType(
                    param.getTypeAtLocation(member),
                    member,
                    filter,
                    false,
                    undefined,
                    false,
                    dependencies
                  ) as Kind.TypeExpression,
                  text: param
                    .getTypeAtLocation(member)
                    .getText(
                      undefined,
                      tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
                    ),
                  isOptional: param.isOptional(),
                })) ?? [],
              returnType: resolveType(
                callSignatures[0]?.getReturnType() ?? type,
                member,
                filter,
                false,
                undefined,
                false,
                dependencies
              ) as Kind.TypeExpression,
              ...getJsDocMetadata(member),
              ...getDeclarationLocation(member),
            } satisfies Kind.MethodSignature
          } else if (tsMorph.Node.isIndexSignatureDeclaration(member)) {
            return {
              ...resolveIndexSignature(member, filter, false),
              ...getJsDocMetadata(member),
              ...getDeclarationLocation(member),
            } satisfies Kind.IndexSignature
          }
        })
        .filter(Boolean) as (
        | Kind.PropertySignature
        | Kind.MethodSignature
        | Kind.IndexSignature
      )[]

      resolvedType = {
        kind: 'Interface',
        name: symbolMetadata.name,
        text: typeText,
        members: resolvedMembers,
      } satisfies Kind.Interface
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
              ({ kind, parameters, isGenerator, ...resolvedCallSignature }) => {
                if (isGenerator) {
                  throw new Error(
                    '[renoun] Components cannot be generator functions.'
                  )
                }

                return {
                  ...resolvedCallSignature,
                  kind: 'ComponentSignature',
                  parameter: parameters.at(0) as
                    | Kind.TypeLiteral
                    | Kind.TypeReference
                    | undefined,
                } satisfies Kind.ComponentSignature
              }
            ),
          } satisfies Kind.Component
        } else {
          resolvedType = {
            kind: 'Function',
            name: symbolMetadata.name,
            text: typeText,
            signatures: resolvedCallSignatures.map(
              ({ kind, ...resolvedCallSignature }) => {
                return {
                  kind: 'FunctionSignature',
                  ...resolvedCallSignature,
                } satisfies Kind.FunctionSignature
              }
            ),
          } satisfies Kind.Function
        }
      } else if (type.isUnknown()) {
        resolvedType = {
          kind: 'Unknown',
          text: typeText,
        } satisfies Kind.Unknown
      } else if (type.isAny()) {
        resolvedType = {
          kind: 'Any',
          text: typeText,
        } satisfies Kind.Any
      } else if (type.isObject()) {
        const isMapped = Boolean(
          type.compilerType.objectFlags & tsMorph.ObjectFlags.Mapped
        )

        if (isMapped) {
          let mappedDeclaration: tsMorph.MappedTypeNode | undefined

          if (symbolDeclaration) {
            if (tsMorph.Node.isMappedTypeNode(symbolDeclaration)) {
              mappedDeclaration = symbolDeclaration
            } else if (tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)) {
              const typeNode = symbolDeclaration.getTypeNode()
              if (tsMorph.Node.isMappedTypeNode(typeNode)) {
                mappedDeclaration = typeNode
              }
            }
          }

          const hasFreeTypeParameter = containsFreeTypeParameter(type)

          const isValueLike =
            tsMorph.Node.isVariableDeclaration(enclosingNode) ||
            tsMorph.Node.isPropertyDeclaration(enclosingNode) ||
            tsMorph.Node.isPropertySignature(enclosingNode)
          const isLocalMapped =
            symbolDeclaration === undefined ||
            symbolDeclaration === enclosingNode
          const shouldExpandMapped =
            isValueLike || (!isLocalMapped && !hasFreeTypeParameter)

          // Handle mapped types e.g. `{ [Key in keyof Type]: Type[Key] }`
          if (!shouldExpandMapped && mappedDeclaration) {
            const valueNode = mappedDeclaration.getTypeNode() // `Type[Key]`
            const valueType = valueNode
              ? (resolveType(
                  valueNode.getType(),
                  valueNode,
                  filter,
                  false,
                  undefined,
                  true,
                  dependencies
                ) as Kind.TypeExpression | undefined)
              : undefined

            if (valueType) {
              const typeParameter = mappedDeclaration.getTypeParameter()
              const typeParameterName = typeParameter.getName()
              const constraint = typeParameter.getConstraintOrThrow()
              const constraintType = resolveType(
                constraint.getType(),
                constraint,
                filter,
                false,
                undefined,
                true,
                dependencies
              ) as Kind.TypeExpression | undefined

              if (!constraintType) {
                throw new Error(
                  `[renoun:resolveType]: No constraint type found for Mapped type "${typeText}". Please file an issue if you encounter this error.`
                )
              }

              resolvedType = {
                kind: 'MappedType',
                text: typeText,
                parameter: {
                  kind: 'TypeParameter',
                  name: typeParameterName,
                  text: `${typeParameterName} in ${constraintType.text}`,
                  constraint: constraintType,
                } satisfies Kind.TypeParameter,
                type: valueType,
                isReadonly: Boolean(mappedDeclaration.getReadonlyToken()),
                isOptional: Boolean(mappedDeclaration.getQuestionToken()),
              } satisfies Kind.MappedType

              if (!keepReferences) {
                rootReferences.delete(type)
              }

              return {
                ...(mappedDeclaration
                  ? getJsDocMetadata(mappedDeclaration)
                  : {}),
                ...resolvedType,
                ...declarationLocation,
              }
            }
          }
        }

        const indexSignatures = resolveIndexSignatures(
          symbolDeclaration,
          filter,
          false
        )
        const propertySignatures = resolvePropertySignatures(
          type,
          enclosingNode,
          filter,
          false,
          defaultValues,
          keepReferences,
          dependencies
        )

        if (
          indexSignatures.length === 0 &&
          propertySignatures.length === 0 &&
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
            .filter(Boolean) as Kind.TypeExpression[]

          if (resolvedTypeArguments.length === 0) {
            if (!keepReferences) {
              rootReferences.delete(type)
            }
            return
          }

          const name = typeName ?? symbolMetadata.name

          if (!name) {
            throw new Error(
              `[renoun:resolveType]: No type name found for type reference "${typeText}" with kind "${symbolDeclaration?.getKindName()}" and enclosing node kind "${enclosingNode?.getKindName()}". Please file an issue if you encounter this error.`
            )
          }

          resolvedType = {
            kind: 'TypeReference',
            name,
            text: typeText,
            arguments: resolvedTypeArguments,
          } satisfies Kind.TypeReference
        } else if (
          propertySignatures.length === 0 &&
          indexSignatures.length > 0
        ) {
          resolvedType = {
            kind: 'TypeLiteral',
            text: typeText,
            members: indexSignatures,
          } satisfies Kind.TypeLiteral
        } else if (propertySignatures.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }

          let name = typeName ?? symbolMetadata.name

          if (tsMorph.Node.isMappedTypeNode(symbolDeclaration)) {
            name = symbolDeclaration.getTypeParameter().getName()
          }

          resolvedType = {
            kind: 'TypeReference',
            name: name ?? '',
            text: typeText,
            arguments: typeArguments
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
              .filter(Boolean) as Kind.TypeExpression[],
          } satisfies Kind.TypeReference
        } else {
          resolvedType = {
            kind: 'TypeLiteral',
            text: typeText,
            members: [...propertySignatures, ...indexSignatures],
          } satisfies Kind.TypeLiteral
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
): Kind.CallSignature[] {
  return signatures
    .map((signature) =>
      resolveCallSignature(signature, enclosingNode, filter, dependencies)
    )
    .filter(Boolean) as Kind.CallSignature[]
}

/** Process a single function signature including its parameters and return type. */
function resolveCallSignature(
  signature: Signature,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  dependencies?: Set<string>
): Kind.CallSignature | undefined {
  const signatureDeclaration = signature.getDeclaration()
  const signatureParameters = signature.getParameters()
  const parameterDeclarations = signatureParameters.map((parameter) =>
    getPrimaryDeclaration(parameter)
  ) as (ParameterDeclaration | undefined)[]
  const resolvedTypeParameters = signature
    .getTypeParameters()
    .map((parameter) => {
      const parameterSymbol = parameter.getSymbol()

      if (!parameterSymbol) return undefined

      const parameterDeclaration = getPrimaryDeclaration(parameterSymbol) as
        | tsMorph.TypeParameterDeclaration
        | undefined

      if (
        !parameterDeclaration ||
        !tsMorph.Node.isTypeParameterDeclaration(parameterDeclaration)
      ) {
        return undefined
      }

      const name = parameterDeclaration.getName()

      if (!name) {
        return undefined
      }

      const constraint = parameter.getConstraint()
      const defaultType = parameter.getDefault()
      const resolvedConstraint = constraint
        ? (resolveType(
            constraint,
            parameterDeclaration,
            filter,
            false,
            undefined,
            true,
            dependencies
          ) as Kind.TypeExpression | undefined)
        : undefined
      const resolvedDefaultType = defaultType
        ? (resolveType(
            defaultType,
            parameterDeclaration,
            filter,
            false,
            undefined,
            true,
            dependencies
          ) as Kind.TypeExpression | undefined)
        : undefined
      const typeParameter: Kind.TypeParameter = {
        kind: 'TypeParameter',
        name,
        text: parameterDeclaration.getText(),
        constraint: resolvedConstraint,
        defaultType: resolvedDefaultType,
      }
      return typeParameter
    })
    .filter((type): type is Kind.TypeParameter => Boolean(type))

  const typeParametersText = resolvedTypeParameters.length
    ? `<${resolvedTypeParameters
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
        const parameterType = getTypeAtLocation(
          parameter,
          signatureDeclaration,
          parameterDeclaration
        )
        const resolvedParameterType = resolveType(
          parameterType,
          declaration,
          filter,
          false,
          defaultValue,
          false,
          dependencies
        ) as Kind.TypeExpression | undefined

        if (resolvedParameterType) {
          const resolvedType =
            (isOptional ?? Boolean(defaultValue))
              ? filterUndefinedFromUnion(resolvedParameterType)
              : resolvedParameterType
          let name: string | undefined = parameter.getName()

          if (name.startsWith('__')) {
            name = undefined
          }

          return {
            kind: 'Parameter',
            name,
            type: resolvedType,
            initializer: defaultValue
              ? {
                  text: parameterDeclaration
                    ? (parameterDeclaration.getInitializer()?.getText() ?? '')
                    : '',
                  value: defaultValue,
                }
              : undefined,
            isOptional: isOptional ?? Boolean(defaultValue),
            description: getSymbolDescription(parameter),
            text: parameterType.getText(
              undefined,
              tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
            ),
            ...getJsDocMetadata(declaration),
            ...getDeclarationLocation(declaration),
          } satisfies Kind.Parameter
        }
      } else {
        throw new Error(
          `[renoun:resolveCallSignatures]: No parameter declaration found for "${parameter.getName()}". You must pass the enclosing node as the second argument to "resolveCallSignatures".`
        )
      }
    })
    .filter(Boolean) as Kind.Parameter[]

  /** Skip signatures with filtered parameters if they are in node_modules. */
  if (
    signatureParameters.length !== 0 &&
    resolvedParameters.length === 0 &&
    signatureDeclaration.getSourceFile().isInNodeModules()
  ) {
    return
  }

  const returnType = resolveType(
    signature.getReturnType(),
    signatureDeclaration,
    filter,
    false,
    undefined,
    false,
    dependencies
  ) as Kind.TypeExpression | undefined

  if (!returnType) {
    throw new Error(
      `[renoun:resolveCallSignature]: No return type found for "${signatureDeclaration.getText()}". Please file an issue if you encounter this error.`
    )
  }

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
    simplifiedTypeText = `function ${signatureDeclaration.getName()}${typeParametersText}(${parametersText}): ${returnType.text}`
  } else {
    simplifiedTypeText = `${typeParametersText}(${parametersText}) => ${returnType.text}`
  }

  const resolvedType: Kind.CallSignature = {
    kind: 'CallSignature',
    text: simplifiedTypeText,
    parameters: resolvedParameters,
    returnType,
    ...getJsDocMetadata(signatureDeclaration),
    ...getDeclarationLocation(signatureDeclaration),
  }

  if (
    tsMorph.Node.isFunctionDeclaration(signatureDeclaration) ||
    tsMorph.Node.isMethodDeclaration(signatureDeclaration)
  ) {
    resolvedType.isAsync = signatureDeclaration.isAsync()
    resolvedType.isGenerator = signatureDeclaration.isGenerator()
  }

  if (resolvedTypeParameters.length) {
    resolvedType.typeParameters = resolvedTypeParameters
  }

  return resolvedType
}

/** Process index signatures of an interface or type alias. */
function resolveIndexSignatures(
  node?: Node,
  filter: SymbolFilter = defaultFilter,
  isRootType: boolean = true
) {
  return getIndexSignatures(node).map((indexSignature) => {
    return resolveIndexSignature(indexSignature, filter, isRootType)
  }) as Kind.IndexSignature[]
}

/** Process an index signature. */
function resolveIndexSignature(
  indexSignature: IndexSignatureDeclaration,
  filter: SymbolFilter = defaultFilter,
  isRootType: boolean = true
) {
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
  ) as Kind.TypeExpression | undefined

  if (!valueType) {
    throw new Error(
      `[renoun]: No value type found for "${text}". Please file an issue if you encounter this error.`
    )
  }

  const keyTypeText = keyType.text
  if (
    keyTypeText !== 'string' &&
    keyTypeText !== 'number' &&
    keyTypeText !== 'symbol'
  ) {
    throw new Error(
      `[renoun]: Invalid key type "${keyTypeText}" for index signature. Key type must be string, number, or symbol.`
    )
  }

  return {
    kind: 'IndexSignature',
    key: keyTypeText,
    type: valueType,
    text,
  } satisfies Kind.IndexSignature
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
export function resolvePropertySignatures(
  type: Type,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  isRootType: boolean = true,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.PropertySignature[] {
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

        const propertyType = getTypeAtLocation(
          property,
          enclosingNode ?? propertyDeclaration ?? declaration,
          propertyDeclaration
        )
        const resolvedPropertyType = resolveType(
          propertyType,
          declaration,
          filter,
          isRootType,
          defaultValue,
          keepReferences,
          dependencies
        ) as Kind.TypeExpression | undefined

        if (resolvedPropertyType) {
          const isOptional =
            (property.getFlags() & tsMorph.SymbolFlags.Optional) !== 0 ||
            defaultValue !== undefined
          const isPropertyReadonly = propertyDeclaration
            ? 'isReadonly' in propertyDeclaration
              ? propertyDeclaration.isReadonly()
              : false
            : false
          const resolvedType =
            (isOptional ?? Boolean(defaultValue))
              ? filterUndefinedFromUnion(resolvedPropertyType)
              : resolvedPropertyType

          return {
            kind: 'PropertySignature',
            name,
            type: resolvedType,
            isOptional,
            isReadonly: isReadonly || isPropertyReadonly,
            text: propertyType.getText(
              undefined,
              tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
            ),
            ...getJsDocMetadata(declaration),
            ...getDeclarationLocation(declaration),
          } satisfies Kind.PropertySignature
        }
      } else {
        throw new Error(
          `[renoun:resolveTypeProperties]: No property declaration found for "${property.getName()}". You must pass the enclosing node as the second argument to "resolveTypeProperties".`
        )
      }
    })
    .filter(Boolean) as Kind.PropertySignature[]
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
      ) as Kind.TypeExpression | undefined
      if (resolvedType) {
        const name = tupleNames[index]

        if (!name) {
          throw new Error(
            `[renoun:resolveType]: No type name found for tuple element "${tupleElementType.getText()}". Please file an issue if you encounter this error.`
          )
        }

        return {
          kind: 'TupleElement',
          type: resolvedType,
          text: resolvedType.text,
          name,
        } satisfies Kind.TupleElement<Kind.TypeExpression>
      }
    })
    .filter(Boolean) as Kind.TupleElement[]
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

  /** Whether the symbol is exported. */
  isExported: boolean

  /** Whether the symbol is external to the current source file. */
  isExternal: boolean

  /** Whether the symbol is located in node_modules. */
  isInNodeModules: boolean

  /** Whether the symbol is global. */
  isGlobal: boolean

  /** Whether the node is generated by the compiler. */
  isVirtual: boolean

  /** Whether the symbol is private. */
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

/** Filters out undefined from a union type. */
function filterUndefinedFromUnion(
  type: Kind.TypeExpression
): Kind.TypeExpression {
  if (type.kind !== ('UnionType' as Kind.UnionType['kind'])) return type

  const filteredMembers = type.types.filter(
    (member) => !(member.kind === 'Any' && member.text === 'undefined')
  )

  // Leave untouched if union only contained undefined
  if (filteredMembers.length === 0) {
    return type
  }

  // If exactly one member remains, collapse the union
  if (filteredMembers.length === 1) {
    return filteredMembers[0]
  }

  // Otherwise return a narrowed union
  return {
    ...type,
    types: filteredMembers,
    text: filteredMembers.map((member) => member.text).join(' | '),
  } satisfies Kind.UnionType
}

/** Processes a class declaration into a metadata object. */
function resolveClass(
  classDeclaration: ClassDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): Kind.Class {
  const name = classDeclaration.getName()

  if (!name) {
    throw new Error(
      `[renoun:resolveType]: No type name found for class declaration "${classDeclaration.getText()}". Please file an issue if you encounter this error.`
    )
  }

  const classMetadata: Kind.Class = {
    kind: 'Class',
    name,
    text: classDeclaration
      .getType()
      .getText(classDeclaration, TYPE_FORMAT_FLAGS),
    constructor: undefined,
    ...getJsDocMetadata(classDeclaration),
    ...getDeclarationLocation(classDeclaration),
  }

  const constructorDeclarations = classDeclaration.getConstructors()

  if (constructorDeclarations.length > 0) {
    const constructorSignaturesToResolve = constructorDeclarations.map(
      (constructor) => constructor.getSignature()
    )
    const resolvedFunctionSignatures = resolveCallSignatures(
      constructorSignaturesToResolve,
      classDeclaration,
      filter,
      dependencies
    )

    if (resolvedFunctionSignatures.length > 0) {
      const primaryConstructorDeclaration = constructorDeclarations[0]
      const constructor: Kind.ClassConstructor = {
        kind: 'ClassConstructor',
        signatures: resolvedFunctionSignatures.map((signature) => {
          return {
            ...signature,
            kind: 'FunctionSignature',
          } satisfies Kind.FunctionSignature
        }),
        text: primaryConstructorDeclaration.getText(),
        ...getJsDocMetadata(primaryConstructorDeclaration),
        ...getDeclarationLocation(primaryConstructorDeclaration),
      }
      classMetadata.constructor = constructor
    }
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

  const baseClass = classDeclaration.getExtends()

  if (baseClass) {
    const resolvedBaseClass = resolveType(
      baseClass.getType(),
      classDeclaration,
      filter,
      false,
      undefined,
      true
    ) as Kind.TypeReference

    if (resolvedBaseClass) {
      classMetadata.extends = resolvedBaseClass
    }
  }

  const implementClauses = classDeclaration.getImplements()

  if (implementClauses.length) {
    const resolvedImplementClauses = implementClauses
      .map((implementClause) =>
        resolveType(
          implementClause.getExpression().getType(),
          classDeclaration,
          filter,
          false,
          undefined,
          true
        )
      )
      .filter(Boolean) as Kind.TypeReference[]

    if (resolvedImplementClauses.length) {
      classMetadata.implements = resolvedImplementClauses
    }
  }

  return classMetadata
}

/** Processes a class accessor (getter or setter) declaration into a metadata object. */
function resolveClassAccessor(
  accessor: GetAccessorDeclaration | SetAccessorDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): Kind.ClassAccessor | undefined {
  const symbolMetadata = getSymbolMetadata(accessor.getSymbol(), accessor)
  const filterResult = filter(symbolMetadata)

  if (filterResult === false) {
    return
  }

  const sharedMetadata: Kind.SharedClassMember = {
    name: accessor.getName(),
    scope: getScope(accessor),
    visibility: getVisibility(accessor),
    text: accessor.getType().getText(accessor, TYPE_FORMAT_FLAGS),
    ...getJsDocMetadata(accessor),
  }

  if (tsMorph.Node.isSetAccessorDeclaration(accessor)) {
    const resolvedSignature = resolveCallSignature(
      accessor.getSignature(),
      accessor,
      filter,
      dependencies
    )

    if (resolvedSignature) {
      const parameter = resolvedSignature.parameters[0]

      if (!parameter) {
        throw new Error(
          `[renoun:resolveClassAccessor] Class setter parameter could not be resolved. This declaration was either filtered, should be marked as internal, or filed as an issue for support.\n\n${printNode(accessor)}`
        )
      }

      return {
        ...sharedMetadata,
        kind: 'ClassSetAccessor',
        parameter,
      } satisfies Kind.ClassSetAccessor
    }

    throw new Error(
      `[renoun:resolveClassAccessor] Class accessor type could not be resolved. This declaration was either filtered, should be marked as internal, or filed as an issue for support.\n\n${printNode(accessor)}`
    )
  }

  const returnType = resolveType(
    accessor.getReturnType(),
    accessor,
    filter,
    false,
    undefined,
    false,
    dependencies
  ) as Kind.TypeExpression | undefined

  if (!returnType) {
    throw new Error(
      `[renoun:resolveClassAccessor] Class getter return type could not be resolved. This declaration was either filtered, should be marked as internal, or filed as an issue for support.\n\n${printNode(accessor)}`
    )
  }

  return {
    ...sharedMetadata,
    kind: 'ClassGetAccessor',
    returnType,
  } satisfies Kind.ClassGetAccessor
}

/** Processes a method declaration into a metadata object. */
function resolveClassMethod(
  method: MethodDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): Kind.ClassMethod | undefined {
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
    ).map((signature) => {
      return {
        ...signature,
        kind: 'FunctionSignature',
      } satisfies Kind.FunctionSignature
    }),
    text: method.getType().getText(method, TYPE_FORMAT_FLAGS),
    ...getJsDocMetadata(method),
  } satisfies Kind.ClassMethod
}

/** Processes a class property declaration into a metadata object. */
function resolveClassProperty(
  property: PropertyDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): Kind.ClassProperty | undefined {
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
  ) as Kind.TypeExpression | undefined

  if (resolvedType) {
    const defaultValue = getPropertyDefaultValue(property)

    return {
      ...getJsDocMetadata(property),
      kind: 'ClassProperty',
      name: property.getName(),
      type: resolvedType,
      initializer: defaultValue
        ? {
            text: property.getInitializer()?.getText() ?? '',
            value: defaultValue,
          }
        : undefined,
      scope: getScope(property),
      visibility: getVisibility(property),
      isOptional: property.hasQuestionToken() || defaultValue !== undefined,
      isReadonly: property.isReadonly(),
      text: property.getType().getText(property, TYPE_FORMAT_FLAGS),
    } satisfies Kind.ClassProperty
  }

  throw new Error(
    `[renoun:resolveClassProperty] Class property type could not be resolved. This declaration was either filtered, should be marked as internal, or filed as an issue for support.\n\n${printNode(property)}`
  )
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
  callSignatures: Kind.CallSignature[]
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

    if (parameterCount === 0) {
      return true
    }

    if (parameterCount !== 1) {
      return false
    }

    const parameter = signature.parameters[0]

    // Check if the parameter type is a primitive type
    if (
      parameter.type.kind === 'String' ||
      parameter.type.kind === 'Number' ||
      parameter.type.kind === 'Boolean' ||
      parameter.type.kind === 'Symbol' ||
      parameter.type.kind === 'Any'
    ) {
      return false
    }

    // Check if the parameter type is a union containing primitive types
    if (parameter.type.kind === ('UnionType' as Kind.UnionType['kind'])) {
      for (
        let index = 0, length = parameter.type.types.length;
        index < length;
        ++index
      ) {
        const member = parameter.type.types[index]
        if (
          member.kind === 'String' ||
          member.kind === 'Number' ||
          member.kind === 'Boolean' ||
          member.kind === 'Symbol' ||
          member.kind === 'Any'
        ) {
          return false
        }
      }
    }

    return true
  })
}

/** Checks if a type contains free type parameters that are not bound to a specific type. */
function containsFreeTypeParameter(type: Type | undefined): boolean {
  if (!type) {
    return false
  }

  if (type.isTypeParameter()) {
    return true
  }

  const aliasArguments = type.getAliasTypeArguments()
  for (let index = 0, length = aliasArguments.length; index < length; ++index) {
    if (containsFreeTypeParameter(aliasArguments[index])) {
      return true
    }
  }

  const typeArguments = type.getTypeArguments()
  for (let index = 0, length = typeArguments.length; index < length; ++index) {
    if (containsFreeTypeParameter(typeArguments[index])) {
      return true
    }
  }

  return false
}

/** Gets the declared annotation type of a node. */
function getDeclaredAnnotationType(declaration?: Node): Type | undefined {
  if (!declaration) return undefined

  let typeNode: TypeNode | undefined

  if (
    tsMorph.Node.isPropertySignature(declaration) ||
    tsMorph.Node.isPropertyDeclaration(declaration) ||
    tsMorph.Node.isVariableDeclaration(declaration) ||
    tsMorph.Node.isParameterDeclaration(declaration)
  ) {
    typeNode = declaration.getTypeNode()
  } else if (
    tsMorph.Node.isGetAccessorDeclaration(declaration) ||
    tsMorph.Node.isSetAccessorDeclaration(declaration)
  ) {
    typeNode = declaration.getReturnTypeNode()
  }

  const type = typeNode ? typeNode.getType() : undefined

  return containsFreeTypeParameter(type) ? undefined : type
}

/** Preserves aliases when the declaration has an explicit annotation. */
export function getTypeAtLocation<
  Symbol extends { getTypeAtLocation(node: Node): Type },
>(symbol: Symbol, location: Node, declaration?: Node): Type {
  return (
    getDeclaredAnnotationType(declaration) ?? symbol.getTypeAtLocation(location)
  )
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
