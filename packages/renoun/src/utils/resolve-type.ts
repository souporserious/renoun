import type {
  Project,
  ClassDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  GetAccessorDeclaration,
  SetAccessorDeclaration,
  PropertyDeclaration,
  PropertySignature,
  IndexSignatureDeclaration,
  TypeAliasDeclaration,
  VariableDeclaration,
  Signature,
  Symbol,
  TypeNode,
  Type,
  Node,
} from 'ts-morph'
import tsMorph from 'ts-morph'

import {
  getInitializerValueKey,
  getInitializerValue,
} from './get-initializer-value.js'
import { getJsDocMetadata } from './get-js-doc-metadata.js'
import { getSymbolDescription } from './get-symbol-description.js'

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

  export interface Null extends Shared {
    kind: 'Null'
  }

  export interface Undefined extends Shared {
    kind: 'Undefined'
  }

  export interface BigInt extends Shared {
    kind: 'BigInt'

    /** The literal value of the bigint if it is a bigint literal. */
    value?: BigInteger
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

  export interface Void extends Shared {
    kind: 'Void'
  }

  export interface Any extends Shared {
    kind: 'Any'
  }

  export interface Unknown extends Shared {
    kind: 'Unknown'
  }

  export interface Never extends Shared {
    kind: 'Never'
  }

  export type MemberUnion =
    | CallSignature
    | ConstructSignature
    | GetAccessorSignature
    | SetAccessorSignature
    | IndexSignature
    | MethodSignature
    | PropertySignature

  export interface TypeLiteral<Member extends MemberUnion = MemberUnion>
    extends Shared {
    kind: 'TypeLiteral'

    /** The member types of the type literal. */
    members: Member[]
  }

  export interface IntersectionType<
    Type extends TypeExpression = TypeExpression,
  > extends Shared {
    kind: 'IntersectionType'
    types: Type[]
  }

  export interface UnionType<Type extends TypeExpression = TypeExpression>
    extends Shared {
    kind: 'UnionType'
    types: Type[]
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

  export interface ConditionalType extends Shared {
    kind: 'ConditionalType'

    /** Left‑hand side of `Type extends Union ? … : …`. */
    checkType: TypeExpression

    /** Right‑hand side of the `extends` clause. */
    extendsType: TypeExpression

    /** Result when the `extends` test succeeds. */
    trueType: TypeExpression

    /** Result when the `extends` test fails. */
    falseType: TypeExpression

    /**
     * **`true`** when `checkType` is a *naked* type parameter
     * (e.g. `Type extends ...`) so the conditional will distribute over unions.
     *
     * **`false`** or `undefined` when `checkType` is wrapped
     * (e.g. `[Type]`, `Type[]`, `Promise<Type>`, `keyof Type`, etc.), which disables
     * distribution.
     */
    isDistributive?: boolean
  }

  export interface IndexedAccessType extends Shared {
    kind: 'IndexedAccessType'

    /** The type of the object being indexed. */
    objectType: TypeExpression

    /** The type of the index. */
    indexType: TypeExpression
  }

  export type IndexSignatureParameterType =
    | Kind.String
    | Kind.Number
    | Kind.Symbol

  export interface IndexSignatureParameter<
    Type extends IndexSignatureParameterType = IndexSignatureParameterType,
  > extends Shared {
    kind: 'IndexSignatureParameter'

    /** The name of the index signature parameter, e.g. `key` in `{ [key: string]: Type }`. */
    name: string

    /** The type of the index signature parameter, e.g. `string` in `{ [key: string]: Type }`. */
    type: Type
  }

  export interface IndexSignature<Type extends TypeExpression = TypeExpression>
    extends Shared {
    kind: 'IndexSignature'
    parameter: IndexSignatureParameter
    type: Type
    isReadonly?: boolean
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
    visibility?: 'public' | 'protected' | 'private'

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

  export interface ClassProperty<
    Type extends TypeExpression = TypeExpression,
    Initializer extends unknown = unknown,
  > extends SharedClassMember {
    kind: 'ClassProperty'

    /** The type of the class property. */
    type: Type

    /** The initialized value assigned to the property. */
    initializer?: Initializer

    /** Whether the property has a question token or initialized value. */
    isOptional?: boolean

    /** Whether the property has a readonly modifier. */
    isReadonly?: boolean
  }

  export interface SharedCallable extends Shared {
    /** The parameters of the call signature. */
    typeParameters?: TypeParameter[]

    /** The return type of the call signature. */
    returnType?: TypeExpression

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
    | TypeLiteral<MethodSignature | PropertySignature>
    | TypeReference
    | IntersectionType<ComponentParameter>
    | UnionType<ComponentParameter>

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

  /** Represents a top-level `const`, `let`, or `var` statement. */
  export interface Variable extends SharedDocumentable {
    kind: 'Variable'

    /** The annotated or inferred type of the variable. */
    type: TypeExpression
  }

  export interface Interface<Member extends MemberUnion = MemberUnion>
    extends SharedDocumentable {
    kind: 'Interface'

    /** The member types of the interface. */
    members: Member[]
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

  /** Represents a type operator e.g. `keyof Type` or `readonly Type`. */
  export interface TypeOperator<
    Type extends Kind.TypeExpression = Kind.TypeExpression,
  > extends Kind.Shared {
    kind: 'TypeOperator'

    /** The operator of the type operator e.g. `keyof` or `readonly`. */
    operator: 'keyof' | 'readonly' | 'unique'

    /** The type operand of the type operator e.g. `Type` in `keyof Type`. */
    type: Type
  }

  /** Represents when a type alias is used as a reference e.g. `Partial<Type>`. */
  export interface TypeReference extends Shared {
    kind: 'TypeReference'

    /** The type arguments passed in during usage, e.g. `Type` in `Partial<Type>`. */
    arguments?: TypeExpression[]

    /** The module specifier where the referenced type is exported from (e.g. "react"). */
    moduleSpecifier?: string
  }

  /** A function or method parameter. */
  export interface Parameter<
    Type extends All = All,
    Initializer extends unknown = unknown,
  > extends SharedDocumentable {
    kind: 'Parameter'

    /** The type expression of the parameter. */
    type: Type

    /** The initialized value assigned to the parameter. */
    initializer?: Initializer

    /** Whether the parameter has an optional modifier or initialized value. If `isRest` is `true`, the parameter is always optional. */
    isOptional?: boolean

    /** Whether the parameter is a rest parameter, e.g. `...rest`. */
    isRest?: boolean
  }

  /** An interface or type alias property signature. */
  export interface PropertySignature<Type extends All = All>
    extends SharedDocumentable {
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
    | BigInt
    | Array
    | Tuple
    | IntersectionType
    | UnionType
    | MappedType
    | ConditionalType
    | IndexedAccessType
    | FunctionType
    | ComponentType
    | TypeLiteral
    | TypeOperator
    | TypeReference
    | Void
    | Null
    | Undefined
    | Any
    | Unknown
    | Never

  export type All =
    | TypeExpression
    | Class
    | ClassProperty
    | ClassMethod
    | ClassAccessor
    | Function
    | Component
    | Variable
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

  // TODO: still need to add ThisType, InferType
}

export type TypeByKind<Type, Key> = Type extends { kind: Key } ? Type : never

export type TypeOfKind<Key extends Kind.All['kind']> = TypeByKind<Kind.All, Key>

export type SymbolMetadata = ReturnType<typeof getSymbolMetadata>

export type SymbolFilter = (symbolMetadata: SymbolMetadata) => boolean

/** Tracks exported references to link types together. */
const exportedReferences = new WeakSet<Type>()

/** Tracks root type references to prevent infinite recursion. */
const rootReferences = new WeakSet<Type>()

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
  const declarationLocation = declaration
    ? getDeclarationLocation(declaration)
    : undefined
  let typeText = type.getText(enclosingNode, TYPE_FORMAT_FLAGS)

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
  const callSignatures = type.getCallSignatures()

  if (
    callSignatures.length === 0 &&
    tsMorph.Node.isVariableDeclaration(enclosingNode)
  ) {
    const typeNode = enclosingNode.getTypeNode()
    let variableTypeResolved: Kind.TypeExpression | undefined

    if (typeNode) {
      variableTypeResolved = resolveTypeExpression(
        typeNode.getType(),
        typeNode,
        filter,
        defaultValues,
        false,
        dependencies
      )
    } else {
      variableTypeResolved = resolveTypeExpression(
        type,
        enclosingNode,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )
    }

    if (!variableTypeResolved) {
      if (!keepReferences) {
        rootReferences.delete(type)
      }
      return
    }

    resolvedType = {
      kind: 'Variable',
      name: symbolMetadata.name,
      text: typeText,
      type: variableTypeResolved,
    } satisfies Kind.Variable
  } else if (tsMorph.Node.isClassDeclaration(symbolDeclaration)) {
    resolvedType = resolveClass(symbolDeclaration, filter, dependencies)
    if (symbolMetadata.name) {
      resolvedType.name = symbolMetadata.name
    }
  } else if (tsMorph.Node.isEnumDeclaration(symbolDeclaration)) {
    resolvedType = {
      kind: 'Enum',
      name: symbolMetadata.name,
      text: typeText,
      members: symbolDeclaration.getMembers().map((member) => ({
        kind: 'EnumMember',
        name: member.getName(),
        text: member.getText(),
        value: member.getValue(),
        ...getJsDocMetadata(member),
        ...getDeclarationLocation(member),
      })),
    } satisfies Kind.Enum
  } else if (tsMorph.Node.isTypeParameterDeclaration(symbolDeclaration)) {
    const constraintNode = symbolDeclaration.getConstraint()
    const defaultNode = symbolDeclaration.getDefault()

    resolvedType = {
      kind: 'TypeParameter',
      name: symbolDeclaration.getName(),
      text: typeText,
      constraint: constraintNode
        ? resolveTypeExpression(
            constraintNode.getType(),
            constraintNode,
            filter,
            defaultValues,
            keepReferences,
            dependencies
          )
        : undefined,
      defaultType: defaultNode
        ? resolveTypeExpression(
            defaultNode.getType(),
            defaultNode,
            filter,
            defaultValues,
            keepReferences,
            dependencies
          )
        : undefined,
    } satisfies Kind.TypeParameter
  } else if (tsMorph.Node.isTypeAliasDeclaration(enclosingNode)) {
    const typeNode = enclosingNode.getTypeNodeOrThrow()
    const resolvedTypeExpression = resolveTypeExpression(
      typeNode.getType(),
      typeNode,
      filter,
      defaultValues,
      true,
      dependencies
    )

    if (!resolvedTypeExpression) {
      if (!keepReferences) {
        rootReferences.delete(type)
      }
      return
    }

    const resolvedTypeParameters = enclosingNode
      .getTypeParameters()
      .map((typeParameter) =>
        resolveType(
          typeParameter.getType(),
          typeParameter,
          filter,
          defaultValues,
          keepReferences,
          dependencies
        )
      ) as Kind.TypeParameter[]

    resolvedType = {
      kind: 'TypeAlias',
      name: symbolMetadata.name,
      text: typeText,
      parameters: resolvedTypeParameters,
      type: resolvedTypeExpression,
    } satisfies Kind.TypeAlias
  } else if (tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)) {
    const typeNode = symbolDeclaration.getTypeNodeOrThrow()
    const resolvedTypeExpression = resolveTypeExpression(
      typeNode.getType(),
      typeNode,
      filter,
      defaultValues,
      true,
      dependencies
    )

    if (!resolvedTypeExpression) {
      if (!keepReferences) {
        rootReferences.delete(type)
      }
      return
    }

    const resolvedTypeParameters = symbolDeclaration
      .getTypeParameters()
      .map((typeParameter) =>
        resolveType(
          typeParameter.getType(),
          typeParameter,
          filter,
          defaultValues,
          keepReferences,
          dependencies
        )
      ) as Kind.TypeParameter[]

    resolvedType = {
      kind: 'TypeAlias',
      name: symbolMetadata.name,
      text: typeText,
      parameters: resolvedTypeParameters,
      type: resolvedTypeExpression,
    } satisfies Kind.TypeAlias
  } else if (tsMorph.Node.isInterfaceDeclaration(symbolDeclaration)) {
    resolvedType = {
      kind: 'Interface',
      name: symbolMetadata.name,
      text: typeText,
      members: resolveMemberSignatures(
        symbolDeclaration.getMembers(),
        filter,
        defaultValues,
        keepReferences,
        dependencies
      ),
    } satisfies Kind.Interface
  } else if (callSignatures.length > 0) {
    const resolvedCallSignatures = resolveCallSignatures(
      callSignatures,
      declaration,
      filter,
      dependencies
    )

    if (isComponent(symbolMetadata.name, resolvedCallSignatures)) {
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
                | Kind.ComponentParameter
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
  } else {
    const resolvedTypeExpression = resolveTypeExpression(
      type,
      declaration,
      filter,
      defaultValues,
      keepReferences,
      dependencies
    )

    if (resolvedTypeExpression) {
      resolvedType = resolvedTypeExpression
    } else {
      throw new Error(
        `[renoun:resolveType]: No type could be resolved for "${symbolMetadata.name}". Please file an issue if you encounter this error.`
      )
    }
  }

  if (!keepReferences) {
    rootReferences.delete(type)
  }

  let metadataDeclaration = declaration

  /* If the type is a variable declaration, use the parent statement to retrieve JSDoc metadata. */
  if (tsMorph.Node.isVariableDeclaration(enclosingNode)) {
    metadataDeclaration = enclosingNode
  }

  return {
    ...(metadataDeclaration ? getJsDocMetadata(metadataDeclaration) : {}),
    ...resolvedType,
    ...declarationLocation,
  }
}

/** Resolves a type expression to a type. */
export function resolveTypeExpression(
  type: tsMorph.Type,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences = false,
  dependencies?: Set<string>
): Kind.TypeExpression | undefined {
  const typeText = type.getText(
    undefined,
    tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
  )
  const symbol = type.getAliasSymbol() ?? type.getSymbol()
  const primaryDeclaration = getPrimaryDeclaration(symbol)

  rootReferences.add(type)

  try {
    const symbol = type.getSymbol()
    const symbolDeclaration = getPrimaryDeclaration(symbol)
    let resolvedType: Kind.TypeExpression | undefined

    if (isTypeReference(type)) {
      resolvedType = {
        kind: 'TypeReference',
        text: typeText,
        ...(primaryDeclaration
          ? getDeclarationLocation(primaryDeclaration)
          : {}),
      } satisfies Kind.TypeReference
    } else if (tsMorph.Node.isTypeReference(enclosingNode)) {
      resolvedType = {
        kind: 'TypeReference',
        text: typeText,
        ...getDeclarationLocation(enclosingNode),
      } satisfies Kind.TypeReference
    } else if (tsMorph.Node.isTypeOperatorTypeNode(enclosingNode)) {
      const operandNode = enclosingNode.getTypeNode()
      const operandType = resolveTypeExpression(
        operandNode.getType(),
        operandNode,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )

      if (!operandType) {
        throw new UnresolvedTypeExpressionError(type.getText(), operandNode)
      }

      const operator = enclosingNode.getOperator()

      resolvedType = {
        kind: 'TypeOperator',
        text: typeText,
        operator: tsMorph.ts.tokenToString(operator) as
          | 'keyof'
          | 'readonly'
          | 'unique',
        type: operandType,
      } satisfies Kind.TypeOperator
    } else if (
      isIndexedAccessType(type) &&
      tsMorph.Node.isIndexedAccessTypeNode(enclosingNode)
    ) {
      const objectType = enclosingNode.getObjectTypeNode()
      const resolvedObjectType = resolveTypeExpression(
        objectType.getType(),
        objectType,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )
      const indexType = enclosingNode.getIndexTypeNode()
      const resolvedIndexType = resolveTypeExpression(
        indexType.getType(),
        indexType,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )

      if (!resolvedObjectType || !resolvedIndexType) {
        throw new UnresolvedTypeExpressionError(type.getText(), enclosingNode)
      }

      resolvedType = {
        kind: 'IndexedAccessType',
        text: typeText,
        objectType: resolvedObjectType,
        indexType: resolvedIndexType,
      } satisfies Kind.IndexedAccessType
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
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
    } else if (type.isBigInt() || type.isBigIntLiteral()) {
      resolvedType = {
        kind: 'BigInt',
        text: typeText,
        value: type.getLiteralValue() as unknown as BigInteger,
      } satisfies Kind.BigInt
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
    } else if (type.isTuple()) {
      const elements = resolveTypeTupleElements(type, symbolDeclaration, filter)

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
    } else if (type.isArray() && tsMorph.Node.isArrayTypeNode(enclosingNode)) {
      const elementTypeNode = enclosingNode.getElementTypeNode()
      const resolvedElementType = resolveTypeExpression(
        elementTypeNode.getType(),
        elementTypeNode,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )

      if (!resolvedElementType) {
        if (!keepReferences) {
          rootReferences.delete(type)
        }
        return
      }

      resolvedType = {
        kind: 'Array',
        text: typeText,
        element: resolvedElementType,
      } satisfies Kind.Array
    } else if (tsMorph.Node.isConditionalTypeNode(enclosingNode)) {
      const checkNode = enclosingNode.getCheckType()
      const checkNodeType = checkNode.getType()
      const checkType = resolveTypeExpression(
        checkNodeType,
        checkNode,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )
      const extendsNode = enclosingNode.getExtendsType()
      const extendsType = resolveTypeExpression(
        extendsNode.getType(),
        extendsNode,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )
      const trueNode = enclosingNode.getTrueType()
      const trueType = resolveTypeExpression(
        trueNode.getType(),
        trueNode,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )
      const falseNode = enclosingNode.getFalseType()
      const falseType = resolveTypeExpression(
        falseNode.getType(),
        falseNode,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )

      if (checkType && extendsType && trueType && falseType) {
        resolvedType = {
          kind: 'ConditionalType',
          text: typeText,
          checkType,
          extendsType,
          trueType,
          falseType,
          isDistributive: checkNodeType.isTypeParameter(),
        } satisfies Kind.ConditionalType
      } else {
        if (!keepReferences) {
          rootReferences.delete(type)
        }
        return
      }
    } else if (type.isUnion()) {
      // Mixed intersection inside union (`A & B | C`)
      if (tsMorph.Node.isIntersectionTypeNode(enclosingNode)) {
        const resolvedIntersectionTypes = enclosingNode
          .getTypeNodes()
          .map((typeNode) =>
            resolveTypeExpression(
              typeNode.getType(),
              typeNode,
              filter,
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

        // Consolidate "string & {}" to just "string"
        if (resolvedIntersectionTypes.length === 1) {
          const intersectionType = resolvedIntersectionTypes[0]

          if (intersectionType.kind === 'String') {
            return intersectionType
          }
        }

        resolvedType = {
          kind: 'IntersectionType',
          text: typeText,
          types: resolvedIntersectionTypes,
        } satisfies Kind.IntersectionType
      } else {
        const unionMembers: Kind.TypeExpression[] = []
        const unionTypeNodes = tsMorph.Node.isUnionTypeNode(enclosingNode)
          ? enclosingNode
              .getTypeNodes()
              .map((node) => ({ node, type: node.getType() }))
          : type.getUnionTypes().map((type) => ({
              node: hasTypeNode(enclosingNode)
                ? enclosingNode.getTypeNode()
                : enclosingNode,
              type,
            }))

        for (const { node: memberNode, type: memberType } of unionTypeNodes) {
          const resolvedMemberType = resolveTypeExpression(
            memberType,
            memberNode,
            filter,
            defaultValues,
            keepReferences,
            dependencies
          )

          if (resolvedMemberType) {
            const previous = unionMembers.at(-1)
            // Collapse `true | false` to just `boolean`
            if (
              resolvedMemberType.kind === 'Boolean' &&
              previous?.kind === 'Boolean'
            ) {
              unionMembers.pop()
              resolvedMemberType.text = 'boolean'
            }
            unionMembers.push(resolvedMemberType)
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
          text: uniqueUnionTypes.map((type) => type.text).join(' | '),
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
          return resolveTypeExpression(
            intersectionType,
            intersectionNodes[index] ?? symbolDeclaration,
            filter,
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

        // Consolidate "string & {}" to just "string"
        if (resolvedIntersectionTypes.length === 1) {
          const intersectionType = resolvedIntersectionTypes[0]

          if (intersectionType.kind === 'String') {
            return intersectionType
          }
        }

        resolvedType = {
          kind: 'IntersectionType',
          text: typeText,
          types: resolvedIntersectionTypes,
        } satisfies Kind.IntersectionType
      }
    } else if (type.isVoid()) {
      resolvedType = {
        kind: 'Void',
        text: 'void',
      } satisfies Kind.Void
    } else if (type.isNull()) {
      resolvedType = {
        kind: 'Null',
        text: 'null',
      } satisfies Kind.Null
    } else if (type.isUndefined()) {
      resolvedType = {
        kind: 'Undefined',
        text: 'undefined',
      } satisfies Kind.Undefined
    } else if (type.isUnknown()) {
      resolvedType = {
        kind: 'Unknown',
        text: typeText,
      } satisfies Kind.Unknown
    } else if (type.isNever()) {
      resolvedType = {
        kind: 'Never',
        text: 'never',
      } satisfies Kind.Never
    } else if (type.isAny()) {
      resolvedType = {
        kind: 'Any',
        text: typeText,
      } satisfies Kind.Any
    } else {
      const callSignatures = type.getCallSignatures()

      if (callSignatures.length) {
        // If there are multiple call signatures, we need bail out since we can't
        // determine which one to use. This most likely only happens in our initial
        // `resolveType` call where we want it to continue resolving the type.
        if (callSignatures.length > 1) {
          return
        }

        const [signature] = callSignatures
        const signatureParameters = signature.getParameters()
        const resolvedParameters = resolveParameters(
          signatureParameters,
          filter,
          dependencies
        )
        const resolvedTypeParameters = signature
          .getTypeParameters()
          .map((typeParameter) =>
            resolveType(
              typeParameter,
              getPrimaryDeclaration(typeParameter.getSymbol()) ?? enclosingNode,
              filter,
              undefined,
              false,
              dependencies
            )
          )
          .filter(Boolean) as Kind.TypeParameter[]
        const signatureDeclaration = signature.getDeclaration()
        const returnTypeNode = signatureDeclaration.getReturnTypeNode()
        let returnType: Kind.TypeExpression | undefined

        if (returnTypeNode) {
          returnType = resolveTypeExpression(
            returnTypeNode.getType(),
            returnTypeNode,
            filter,
            undefined,
            false,
            dependencies
          )
        } else {
          returnType = resolveTypeExpression(
            signature.getReturnType(),
            signatureDeclaration,
            filter,
            undefined,
            false,
            dependencies
          )
        }

        resolvedType = {
          kind: 'FunctionType',
          text: typeText,
          parameters: resolvedParameters,
          ...(resolvedTypeParameters.length
            ? { typeParameters: resolvedTypeParameters }
            : {}),
          ...(returnType ? { returnType } : {}),
          isAsync: returnType ? isPromiseLike(returnType) : false,
        } satisfies Kind.FunctionType
      } else if (type.isObject()) {
        const isMapped = Boolean(
          type.compilerType.objectFlags & tsMorph.ObjectFlags.Mapped
        )

        if (isMapped) {
          let mappedNode: tsMorph.MappedTypeNode | undefined

          if (enclosingNode) {
            if (tsMorph.Node.isMappedTypeNode(enclosingNode)) {
              mappedNode = enclosingNode
            }
          } else if (symbolDeclaration) {
            if (tsMorph.Node.isMappedTypeNode(symbolDeclaration)) {
              mappedNode = symbolDeclaration
            }
          }

          if (mappedNode) {
            const typeParameter = mappedNode.getTypeParameter()
            const constraintNode = typeParameter.getConstraintOrThrow()
            let constraintType: Kind.TypeExpression | undefined

            if (tsMorph.Node.isTypeReference(constraintNode)) {
              const definitionNode = getPrimaryDeclaration(
                constraintNode.getType().getAliasSymbol()
              )
              if (definitionNode && isDeclarationExported(definitionNode)) {
                constraintType = {
                  kind: 'TypeReference',
                  text: constraintNode.getText(),
                  ...getDeclarationLocation(constraintNode),
                } satisfies Kind.TypeReference
              } else {
                constraintType = resolveTypeExpression(
                  constraintNode.getType(),
                  constraintNode,
                  filter,
                  defaultValues,
                  keepReferences,
                  dependencies
                )
              }
            }

            const valueNode = mappedNode.getTypeNode()
            const valueType = valueNode
              ? resolveTypeExpression(
                  valueNode.getType(),
                  valueNode,
                  filter,
                  defaultValues,
                  keepReferences,
                  dependencies
                )
              : undefined

            if (constraintType && valueType) {
              resolvedType = {
                kind: 'MappedType',
                text: typeText,
                parameter: {
                  kind: 'TypeParameter',
                  name: typeParameter.getName(),
                  text: `${typeParameter.getName()} in ${constraintType.text}`,
                  constraint: constraintType,
                },
                type: valueType,
                isReadonly: Boolean(mappedNode.getReadonlyToken()),
                isOptional: Boolean(mappedNode.getQuestionToken()),
              } satisfies Kind.MappedType

              return resolvedType
            }
          }
        }

        // TODO: use resolveMemberSignatures here instead
        const propertySignatures = resolvePropertySignatures(
          type,
          symbolDeclaration ?? enclosingNode,
          filter,
          defaultValues,
          keepReferences,
          dependencies
        )
        const indexSignatures = resolveIndexSignatures(
          symbolDeclaration,
          filter
        )

        // If the literal is truly empty we treat it like `{}` and bail
        if (propertySignatures.length === 0 && indexSignatures.length === 0) {
          if (!keepReferences) {
            rootReferences.delete(type)
          }
          return
        }

        resolvedType = {
          kind: 'TypeLiteral',
          text: typeText,
          members: [...propertySignatures, ...indexSignatures],
        } satisfies Kind.TypeLiteral
      } else {
        throw new UnresolvedTypeExpressionError(
          type.getText(),
          primaryDeclaration ?? enclosingNode
        )
      }
    }

    return resolvedType
  } finally {
    if (!keepReferences) {
      rootReferences.delete(type)
    }
  }
}

export class UnresolvedTypeExpressionError extends Error {
  readonly typeText: string
  readonly node?: Node

  constructor(typeText: string, node?: Node) {
    super(
      `[renoun:UnresolvedTypeExpression] Could not resolve "${typeText}"${node ? ` of kind "${node.getKindName()}" in "${node.getText()}".` : '.'}`
    )
    this.name = 'UnresolvedTypeExpressionError'
    this.typeText = typeText
    this.node = node

    Error.captureStackTrace?.(this, UnresolvedTypeExpressionError)
  }
}

/** Resolve all member signatures of a type. */
function resolveMemberSignatures(
  members: tsMorph.TypeElement[],
  filter: SymbolFilter,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.MemberUnion[] {
  return members
    .map((member) =>
      resolveMemberSignature(
        member,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )
    )
    .filter(Boolean) as Kind.MemberUnion[]
}

/** Resolve a member signature of a type element. */
function resolveMemberSignature(
  member: tsMorph.TypeElement,
  filter: SymbolFilter,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.MemberUnion | undefined {
  const resolvedMemberType = resolveTypeExpression(
    member.getType(),
    member,
    filter,
    defaultValues,
    keepReferences,
    dependencies
  )

  if (!resolvedMemberType) {
    return
  }

  const text = member
    .getType()
    .getText(
      undefined,
      tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
    )

  // TODO: determine when we need resolvePropertySignatures
  if (tsMorph.Node.isPropertySignature(member)) {
    return {
      kind: 'PropertySignature',
      name: member.getName(),
      type: resolvedMemberType,
      text,
      isOptional: member.hasQuestionToken(),
      isReadonly: member.isReadonly(),
      ...getJsDocMetadata(member),
      ...getDeclarationLocation(member),
    }
  }

  if (tsMorph.Node.isMethodSignature(member)) {
    const callSignature = member.getType().getCallSignatures()[0]
    const parameters = resolveParameters(
      callSignature.getParameters(),
      filter,
      dependencies
    )
    return {
      kind: 'MethodSignature',
      name: member.getName(),
      text,
      parameters: parameters,
      returnType: resolveTypeExpression(
        callSignature.getReturnType(),
        member,
        filter,
        undefined,
        false,
        dependencies
      ),
      ...getJsDocMetadata(member),
      ...getDeclarationLocation(member),
    }
  }

  if (tsMorph.Node.isIndexSignatureDeclaration(member)) {
    return {
      ...resolveIndexSignature(member, filter),
      ...getJsDocMetadata(member),
      ...getDeclarationLocation(member),
    }
  }

  throw new Error(
    `[renoun:resolveMemberSignature]: Unhandled member signature of kind "${member.getKindName()}". Please file an issue if you encounter this error.`
  )
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

      const constraintNode = parameterDeclaration.getConstraint()
      const constraintType = parameter.getConstraint()
      const defaultNode = parameterDeclaration.getDefault()
      const defaultType = parameter.getDefault()
      const resolvedConstraint =
        constraintType && constraintNode
          ? resolveTypeExpression(
              constraintType,
              constraintNode,
              filter,
              undefined,
              true,
              dependencies
            )
          : undefined
      const resolvedDefaultType =
        defaultType && defaultNode
          ? resolveTypeExpression(
              defaultType,
              defaultNode,
              filter,
              undefined,
              true,
              dependencies
            )
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

  const returnTypeNode = signatureDeclaration.getReturnTypeNode()
  let returnType: Kind.TypeExpression | undefined

  if (returnTypeNode) {
    returnType = resolveTypeExpression(
      returnTypeNode.getType(),
      returnTypeNode,
      filter,
      undefined,
      false,
      dependencies
    )
  } else {
    returnType = resolveTypeExpression(
      signature.getReturnType(),
      signatureDeclaration,
      filter,
      undefined,
      false,
      dependencies
    )
  }

  if (!returnType) {
    throw new Error(
      `[renoun:resolveCallSignature]: No return type found for "${signatureDeclaration.getText()}". Please file an issue if you encounter this error.`
    )
  }

  const resolvedParameters = resolveParameters(
    signatureParameters,
    filter,
    dependencies
  )
  const parametersText = resolvedParameters
    .map((parameter) => parameter.text)
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

function resolveParameters(
  parameters: Symbol[],
  filter: SymbolFilter = defaultFilter,
  dependencies?: Set<string>
): Kind.Parameter[] {
  return parameters
    .map((parameter) => {
      const parameterDeclaration = getPrimaryDeclaration(parameter) as
        | ParameterDeclaration
        | undefined

      if (!parameterDeclaration) {
        throw new Error(
          `[renoun:resolveCallSignatureParameters]: No parameter declaration found for "${parameter.getName()}". If you are seeing this error, please file an issue.`
        )
      }

      const initializer = getInitializerValue(parameterDeclaration)
      const typeNode = parameterDeclaration.getTypeNodeOrThrow()
      const resolvedParameterType = resolveTypeExpression(
        typeNode.getType(),
        typeNode,
        filter,
        initializer,
        false,
        dependencies
      )

      if (resolvedParameterType) {
        const isOptional = parameterDeclaration.hasQuestionToken()
        const resolvedType =
          (isOptional ?? Boolean(initializer))
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
          initializer,
          isOptional: isOptional ?? Boolean(initializer),
          description: getSymbolDescription(parameter),
          text: parameterDeclaration.getText(),
          ...getJsDocMetadata(parameterDeclaration),
          ...getDeclarationLocation(parameterDeclaration),
        } satisfies Kind.Parameter
      }
    })
    .filter(Boolean) as Kind.Parameter[]
}

/** Process index signatures of an interface or type alias. */
function resolveIndexSignatures(
  node?: Node,
  filter: SymbolFilter = defaultFilter
) {
  return getIndexSignatures(node).map((indexSignature) => {
    return resolveIndexSignature(indexSignature, filter)
  }) as Kind.IndexSignature[]
}

/** Process an index signature. */
function resolveIndexSignature(
  indexSignature: IndexSignatureDeclaration,
  filter: SymbolFilter = defaultFilter
) {
  const text = indexSignature.getText()
  const valueType = resolveTypeExpression(
    indexSignature.getReturnType(),
    indexSignature,
    filter
  )

  if (!valueType) {
    throw new Error(
      `[renoun]: No value type found for "${text}". Please file an issue if you encounter this error.`
    )
  }

  const keyName = indexSignature.getKeyName()
  const keyType = resolveTypeExpression(
    indexSignature.getKeyType(),
    indexSignature,
    filter
  ) as Kind.String | Kind.Number | Kind.Symbol | undefined

  if (!keyType) {
    throw new Error(
      `[renoun]: No key type found for "${text}". Please file an issue if you encounter this error.`
    )
  }

  const parameter: Kind.IndexSignatureParameter = {
    kind: 'IndexSignatureParameter',
    name: keyName,
    type: keyType,
    text: `${keyName}: ${keyType.text}`,
  }

  return {
    kind: 'IndexSignature',
    parameter,
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
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.PropertySignature[] {
  const isReadonly = isReadonlyType(type, enclosingNode)

  return type
    .getApparentProperties()
    .map((property) => {
      const symbolMetadata = getSymbolMetadata(property, enclosingNode)
      const propertyDeclaration = getPrimaryDeclaration(property) as
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
                getInitializerValueKey(propertyDeclaration)
              ]
            : undefined
        let resolvedPropertyType: Kind.TypeExpression | undefined
        let typeText: string | undefined

        if (tsMorph.Node.isPropertySignature(propertyDeclaration)) {
          const typeNode = propertyDeclaration.getTypeNodeOrThrow()

          resolvedPropertyType = resolveTypeExpression(
            typeNode.getType(),
            typeNode,
            filter,
            defaultValue,
            keepReferences,
            dependencies
          )
          typeText = propertyDeclaration.getText()
        } else {
          const propertyType = getTypeAtLocation(
            property,
            enclosingNode ?? propertyDeclaration ?? declaration,
            propertyDeclaration
          )

          resolvedPropertyType = resolveTypeExpression(
            propertyType,
            declaration,
            filter,
            defaultValue,
            keepReferences,
            dependencies
          )
          typeText = propertyType.getText(
            undefined,
            tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
          )
        }

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
            text: typeText,
            ...getJsDocMetadata(declaration),
            ...getDeclarationLocation(declaration),
          } satisfies Kind.PropertySignature
        }
      } else {
        throw new Error(
          `[renoun:resolvePropertySignatures]: No property declaration found for "${property.getName()}". You must pass the enclosing node as the second argument to "resolvePropertySignatures".`
        )
      }
    })
    .filter(Boolean) as Kind.PropertySignature[]
}

/** Process all elements of a tuple type. */
function resolveTypeTupleElements(
  type: Type,
  enclosingNode?: Node,
  filter?: SymbolFilter
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
      const resolvedType = resolveTypeExpression(
        tupleElementType,
        enclosingNode,
        filter
      )

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
    type.isBigInt() ||
    type.isBigIntLiteral() ||
    type.isString() ||
    type.isStringLiteral() ||
    type.isTemplateLiteral() ||
    type.isUndefined() ||
    type.isNull() ||
    type.isVoid() ||
    type.isAny() ||
    type.isUnknown() ||
    type.isNever() ||
    isSymbol(type)
  )
}

/** Check if a type is a symbol. */
function isSymbol(type: Type) {
  const symbol = type.getSymbol()
  return symbol?.getName() === 'Symbol'
}

/** Check if a declaration is exported. */
function isDeclarationExported(declaration: Node, enclosingNode?: Node) {
  /** Check if the declaration is exported if it is not the enclosing node. */
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

  return isExported
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
  const isExported = isDeclarationExported(declaration, enclosingNode)

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
function filterUndefinedFromUnion(type: Kind.All): Kind.All {
  if (type.kind !== ('UnionType' as Kind.UnionType['kind'])) {
    return type
  }

  const filteredMembers = type.types.filter(
    (member) => member.kind !== 'Undefined'
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
    const resolvedBaseClass = resolveTypeExpression(
      baseClass.getType(),
      classDeclaration,
      filter,
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
        resolveTypeExpression(
          implementClause.getExpression().getType(),
          classDeclaration,
          filter,
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

  const returnType = resolveTypeExpression(
    accessor.getReturnType(),
    accessor.getReturnTypeNode() ?? accessor,
    filter,
    undefined,
    false,
    dependencies
  )

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

  const resolvedType = resolveTypeExpression(
    property.getType(),
    property,
    filter,
    undefined,
    false,
    dependencies
  ) as Kind.TypeExpression | undefined

  if (resolvedType) {
    const initializer = getInitializerValue(property)

    return {
      ...getJsDocMetadata(property),
      kind: 'ClassProperty',
      name: property.getName(),
      type: resolvedType,
      initializer,
      scope: getScope(property),
      visibility: getVisibility(property),
      isOptional: property.hasQuestionToken() || initializer !== undefined,
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
function isReadonlyType(type: Type, enclosingNode: Node | undefined) {
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

/** Determines if a type is a reference type. */
function isTypeReference(type: Type): boolean {
  return (type.getObjectFlags() & tsMorph.ObjectFlags.Reference) !== 0
}

/** Determines if a type is a conditional type. */
function isConditionalType(type: Type): boolean {
  return (type.getFlags() & tsMorph.TypeFlags.Conditional) !== 0
}

/** Determines if a type is an indexed access type. */
function isIndexedAccessType(type: Type): boolean {
  return (type.getFlags() & tsMorph.TypeFlags.IndexedAccess) !== 0
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
      parameter.type.kind === 'BigInt' ||
      parameter.type.kind === 'Null' ||
      parameter.type.kind === 'Undefined' ||
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
          member.kind === 'BigInt' ||
          member.kind === 'Null' ||
          member.kind === 'Undefined' ||
          member.kind === 'Any'
        ) {
          return false
        }
      }
    }

    return true
  })
}

/** Checks if a resolved type is a promise-like. */
function isPromiseLike(type: Kind.TypeExpression): boolean {
  switch (type.kind) {
    case 'TypeReference':
      if (type.text === 'Promise' || type.text.startsWith('Promise<')) {
        return true
      }
      if (type.path?.includes('lib.es') && type.path?.includes('promise')) {
        return true
      }
      return false
    case 'UnionType':
    case 'IntersectionType':
      return type.types.some(isPromiseLike)
    default:
      return false
  }
}

/** Checks if a node has a type node. */
export function hasTypeNode(
  node?: Node
): node is
  | ParameterDeclaration
  | PropertyDeclaration
  | PropertySignature
  | VariableDeclaration
  | TypeAliasDeclaration {
  return (
    tsMorph.Node.isParameterDeclaration(node) ||
    tsMorph.Node.isPropertyDeclaration(node) ||
    tsMorph.Node.isPropertySignature(node) ||
    tsMorph.Node.isVariableDeclaration(node) ||
    tsMorph.Node.isTypeAliasDeclaration(node)
  )
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

/** Attempt to get the module specifier for a type reference if it is imported from another module. */
function getModuleSpecifierFromTypeReference(node: tsMorph.TypeReferenceNode) {
  const typeName = node.getTypeName()

  // Handle qualified names (e.g. React.Component) by taking the right-most identifier
  let symbol: tsMorph.Symbol | undefined

  if (tsMorph.Node.isQualifiedName(typeName)) {
    symbol = typeName.getRight().getSymbol()
  } else if (tsMorph.Node.isIdentifier(typeName)) {
    symbol = typeName.getSymbol()
  }

  if (!symbol) {
    return undefined
  }

  for (const declaration of symbol.getDeclarations()) {
    // `import { Something } from "react"`
    if (tsMorph.Node.isImportSpecifier(declaration)) {
      const importDecl = declaration.getFirstAncestorByKind(
        tsMorph.SyntaxKind.ImportDeclaration
      )

      if (importDecl) {
        return importDecl.getModuleSpecifierValue()
      }
    }

    // `import * as React from "react"` or `import React from "react"`
    if (
      tsMorph.Node.isImportClause(declaration) ||
      tsMorph.Node.isNamespaceImport(declaration)
    ) {
      const importDecl = declaration.getFirstAncestorByKind(
        tsMorph.SyntaxKind.ImportDeclaration
      )

      if (importDecl) {
        return importDecl.getModuleSpecifierValue()
      }
    }

    // `import fs = require("fs")`
    if (tsMorph.Node.isImportEqualsDeclaration(declaration)) {
      const moduleRef = declaration.getModuleReference()
      if (tsMorph.Node.isExternalModuleReference(moduleRef)) {
        const expr = moduleRef.getExpression()
        if (expr && tsMorph.Node.isStringLiteral(expr)) {
          return expr.getLiteralText()
        }
      }
    }
  }

  return undefined
}
