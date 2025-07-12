import type {
  Project,
  Node,
  ClassDeclaration,
  MethodDeclaration,
  ParameterDeclaration,
  GetAccessorDeclaration,
  SetAccessorDeclaration,
  PropertyDeclaration,
  PropertySignature,
  IndexSignatureDeclaration,
  VariableDeclaration,
  TypeAliasDeclaration,
  InterfaceDeclaration,
  EnumDeclaration,
  ConstructorDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  ArrowFunction,
  Signature,
  Symbol,
  Type,
  TypeElement,
  TypeNode,
  TypeParameterDeclaration,
  TypeReferenceNode,
} from 'ts-morph'
import tsMorph from 'ts-morph'

import {
  getInitializerValueKey,
  getInitializerValue,
} from './get-initializer-value.js'
import { getJsDocMetadata } from './get-js-doc-metadata.js'
import { getSymbolDescription } from './get-symbol-description.js'
import { getRootDirectory } from './get-root-directory.js'

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

  export interface Object extends Shared {
    kind: 'Object'
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
    typeParameter: TypeParameter

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

  export interface InferType extends Shared {
    kind: 'InferType'
    typeParameter: TypeParameter
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
    signatures: CallSignature[]
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
    signatures: CallSignature[]
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

    /** The type of `this` for the call signature. */
    thisType?: TypeExpression

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

  export interface Function extends SharedDocumentable {
    kind: 'Function'
    signatures: CallSignature[]
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

    /** The type parameters that can be provided as arguments to the type alias. */
    typeParameters: TypeParameter[]
  }

  export interface TypeParameter extends SharedDocumentable {
    kind: 'TypeParameter'

    /** The constraint type of the type parameter. */
    constraintType?: TypeExpression

    /** The default type of the type parameter. */
    defaultType?: TypeExpression

    /** Whether the type parameter is an inferred type parameter. */
    isInferred?: boolean
  }

  /** Represents a type alias declaration e.g. `type Partial<Type> = { [Key in keyof Type]?: Type[Key] }`. */
  export interface TypeAlias<Type extends TypeExpression = TypeExpression>
    extends SharedDocumentable {
    kind: 'TypeAlias'

    /** The type expression. */
    type: Type

    /** The type parameters that can be provided as arguments to the type alias. */
    typeParameters: TypeParameter[]
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
    Type extends TypeExpression = TypeExpression,
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
    | BigInt
    | Object
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
    | InferType
    | Void
    | Null
    | Undefined
    | Any
    | Unknown
    | Never
}

export type Kind =
  | Kind.TypeExpression
  | Kind.Class
  | Kind.ClassProperty
  | Kind.ClassMethod
  | Kind.ClassAccessor
  | Kind.Function
  | Kind.Component
  | Kind.Variable
  | Kind.Interface
  | Kind.Enum
  | Kind.EnumMember
  | Kind.TypeAlias
  | Kind.TypeParameter
  | Kind.CallSignature
  | Kind.ConstructSignature
  | Kind.ComponentSignature
  | Kind.IndexSignature
  | Kind.MethodSignature
  | Kind.PropertySignature
  | Kind.Parameter

export type TypeByKind<Type, Key> = Type extends { kind: Key } ? Type : never

export type TypeOfKind<Key extends Kind['kind']> = TypeByKind<Kind, Key>

export type SymbolMetadata = ReturnType<typeof getSymbolMetadata>

export type SymbolFilter = (symbolMetadata: SymbolMetadata) => boolean

/** Tracks root type references to prevent infinite recursion. */
const rootReferences = new WeakSet<Type>()

/** Tracks inlining references to prevent infinite recursion. */
const resolvingReferences = new WeakSet<Type>()

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
): Kind | undefined {
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

  if (!symbolMetadata.isVirtual) {
    rootReferences.add(type)
  }

  let resolvedType: Kind = {
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
  } else if (
    callSignatures.length > 0 &&
    !tsMorph.Node.isTypeAliasDeclaration(enclosingNode)
  ) {
    const resolvedCallSignatures = resolveCallSignatures(
      callSignatures,
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
        signatures: resolvedCallSignatures,
      } satisfies Kind.Function
    }
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
    const resolvedTypeParameter = resolveTypeParameter(
      type,
      filter,
      dependencies
    )

    if (!resolvedTypeParameter) {
      if (!keepReferences) {
        rootReferences.delete(type)
      }
      return
    }

    resolvedType = resolvedTypeParameter
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
      typeParameters: resolvedTypeParameters,
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
      typeParameters: resolvedTypeParameters,
      type: resolvedTypeExpression,
    } satisfies Kind.TypeAlias
  } else if (tsMorph.Node.isInterfaceDeclaration(symbolDeclaration)) {
    const resolvedTypeParameters: Kind.TypeParameter[] = []

    for (const typeParameter of symbolDeclaration.getTypeParameters()) {
      const resolved = resolveType(
        typeParameter.getType(),
        typeParameter,
        filter,
        undefined,
        false,
        dependencies
      ) as Kind.TypeParameter | undefined
      if (resolved) {
        resolvedTypeParameters.push(resolved)
      }
    }

    resolvedType = {
      kind: 'Interface',
      name: symbolMetadata.name,
      text: typeText,
      typeParameters: resolvedTypeParameters,
      members: resolveMemberSignatures(
        symbolDeclaration.getMembers(),
        filter,
        defaultValues,
        keepReferences,
        dependencies
      ),
    } satisfies Kind.Interface
  } else {
    if (tsMorph.Node.isVariableDeclaration(enclosingNode)) {
      const resolvedTypeExpression = resolveTypeExpression(
        type,
        declaration,
        filter,
        defaultValues,
        keepReferences,
        dependencies
      )

      if (resolvedTypeExpression) {
        resolvedType = {
          kind: 'Variable',
          name: symbolMetadata.name,
          text: typeText,
          type: resolvedTypeExpression,
        } satisfies Kind.Variable
      } else {
        throw new UnresolvedTypeExpressionError(type, enclosingNode)
      }
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

/** Resolves a type expression. */
function resolveTypeExpression(
  type: Type,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences = false,
  dependencies?: Set<string>
): Kind.TypeExpression | undefined {
  const symbol = type.getAliasSymbol() ?? type.getSymbol()
  const symbolDeclaration = getPrimaryDeclaration(symbol)
  const typeText = type.getText(
    undefined,
    tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
  )

  rootReferences.add(type)

  try {
    let resolvedType: Kind.TypeExpression | undefined

    if (isTypeReference(type, enclosingNode)) {
      if (shouldResolveReference(type, enclosingNode)) {
        resolvingReferences.add(type)

        resolvedType = resolveTypeExpression(
          type.getApparentType(),
          symbolDeclaration ?? enclosingNode,
          filter,
          defaultValues,
          keepReferences,
          dependencies
        )

        resolvingReferences.delete(type)
      } else {
        const moduleSpecifier = tsMorph.Node.isTypeReference(enclosingNode)
          ? getModuleSpecifierFromTypeReference(enclosingNode)
          : undefined

        resolvedType = {
          kind: 'TypeReference',
          text: typeText,
          moduleSpecifier,
          ...(enclosingNode ? getDeclarationLocation(enclosingNode) : {}),
        } satisfies Kind.TypeReference
      }
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
        throw new UnresolvedTypeExpressionError(type, operandNode)
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
        throw new UnresolvedTypeExpressionError(type, enclosingNode)
      }

      resolvedType = {
        kind: 'IndexedAccessType',
        text: typeText,
        objectType: resolvedObjectType,
        indexType: resolvedIndexType,
      } satisfies Kind.IndexedAccessType
    } else if (
      type.isTypeParameter() &&
      tsMorph.Node.isTypeParameterDeclaration(symbolDeclaration) &&
      tsMorph.Node.isInferTypeNode(enclosingNode)
    ) {
      const resolvedTypeParameter = resolveTypeParameterDeclaration(
        symbolDeclaration,
        filter,
        dependencies
      )

      if (!resolvedTypeParameter) {
        throw new UnresolvedTypeExpressionError(type, enclosingNode)
      }

      resolvedType = {
        kind: 'InferType',
        text: typeText,
        typeParameter: resolvedTypeParameter,
      } satisfies Kind.InferType
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
    } else if (
      type.isString() ||
      type.isStringLiteral() ||
      type.isTemplateLiteral()
    ) {
      resolvedType = {
        kind: 'String',
        text: typeText,
        value: type.getLiteralValue() as string,
      } satisfies Kind.String
    } else if (isSymbolType(type)) {
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
        const intersectionTypeNodes = enclosingNode.getTypeNodes()
        const resolvedIntersectionTypes: Kind.TypeExpression[] = []

        for (
          let index = 0, length = intersectionTypeNodes.length;
          index < length;
          ++index
        ) {
          const typeNode = intersectionTypeNodes[index]
          const resolved = resolveTypeExpression(
            typeNode.getType(),
            typeNode,
            filter,
            defaultValues,
            keepReferences,
            dependencies
          )
          if (resolved) {
            resolvedIntersectionTypes.push(resolved)
          }
        }

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
          : type.getUnionTypes().map((unionType) => {
              const primaryDeclaration = getPrimaryDeclaration(
                unionType.getAliasSymbol() || unionType.getSymbol()
              )
              return {
                node: hasTypeNode(primaryDeclaration)
                  ? primaryDeclaration.getTypeNode()
                  : primaryDeclaration,
                type: unionType,
              }
            })

        for (const { node: typeNode, type: typeNodeType } of unionTypeNodes) {
          const resolvedMemberType = resolveTypeExpression(
            typeNodeType,
            typeNode ?? symbolDeclaration,
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
      } else if (tsMorph.Node.isTypeAliasDeclaration(enclosingNode)) {
        const typeNode = enclosingNode.getTypeNode()
        if (tsMorph.Node.isIntersectionTypeNode(typeNode)) {
          intersectionNode = typeNode
        }
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
      const resolvedIntersectionTypes: Kind.TypeExpression[] = []
      for (
        let index = 0, length = intersectionTypes.length;
        index < length;
        ++index
      ) {
        const intersectionType = intersectionTypes[index]
        const resolved = resolveTypeExpression(
          intersectionType,
          intersectionNodes[index] ?? symbolDeclaration,
          filter,
          defaultValues,
          keepReferences,
          dependencies
        )
        if (resolved) {
          resolvedIntersectionTypes.push(resolved)
        }
      }

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
        const resolvedParameters = resolveParameters(
          signature,
          filter,
          dependencies
        )
        const resolvedTypeParameters: Kind.TypeParameter[] = []
        for (const typeParameter of signature.getTypeParameters()) {
          const resolved = resolveTypeParameter(
            typeParameter,
            filter,
            dependencies
          )
          if (resolved) {
            resolvedTypeParameters.push(resolved)
          }
        }
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
          ...resolvedParameters,
          ...(resolvedTypeParameters.length
            ? { typeParameters: resolvedTypeParameters }
            : {}),
          ...(returnType ? { returnType } : {}),
          isAsync: returnType ? isPromiseLike(returnType) : false,
        } satisfies Kind.FunctionType
      } else if (type.isObject()) {
        if (isMappedType(type)) {
          let mappedNode: tsMorph.MappedTypeNode | undefined

          if (tsMorph.Node.isMappedTypeNode(enclosingNode)) {
            mappedNode = enclosingNode
          } else if (tsMorph.Node.isMappedTypeNode(symbolDeclaration)) {
            mappedNode = symbolDeclaration
          } else if (tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)) {
            const typeNode = symbolDeclaration.getTypeNode()
            if (tsMorph.Node.isMappedTypeNode(typeNode)) {
              mappedNode = typeNode
            }
          }

          if (mappedNode) {
            if (shouldResolveMappedType(type, mappedNode)) {
              const members = resolvePropertySignatures(
                type,
                mappedNode,
                filter,
                defaultValues,
                keepReferences,
                dependencies
              )

              if (members.length) {
                return {
                  kind: 'TypeLiteral',
                  text: typeText,
                  members,
                } satisfies Kind.TypeLiteral
              }
            }

            const resolvedTypeParameter = resolveTypeParameterDeclaration(
              mappedNode.getTypeParameter(),
              filter,
              dependencies
            )
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

            if (resolvedTypeParameter && valueType) {
              return {
                kind: 'MappedType',
                text: typeText,
                typeParameter: resolvedTypeParameter,
                type: valueType,
                isReadonly: Boolean(mappedNode.getReadonlyToken()),
                isOptional: Boolean(mappedNode.getQuestionToken()),
              } satisfies Kind.MappedType
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
      } else if (tsMorph.Node.isObjectKeyword(enclosingNode)) {
        resolvedType = {
          kind: 'Object',
          text: typeText,
        } satisfies Kind.Object
      } else {
        throw new UnresolvedTypeExpressionError(type, enclosingNode)
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
  readonly type: Type
  readonly enclosingNode?: Node

  constructor(type: Type, enclosingNode?: Node) {
    const symbol = type.getAliasSymbol() ?? type.getSymbol()
    const symbolDeclaration = getPrimaryDeclaration(symbol)
    let message = `[renoun:UnresolvedTypeExpression] Could not resolve "${type.getText()}"`

    if (symbolDeclaration) {
      message += `\n\nSymbol Declaration\n\n${printNode(symbolDeclaration)}`
    }

    if (enclosingNode) {
      message += `\n\nEnclosing Node\n\n${printNode(enclosingNode)}`
    }

    super(message)

    this.name = 'UnresolvedTypeExpressionError'
    this.type = type
    this.enclosingNode = enclosingNode

    Error.captureStackTrace?.(this, UnresolvedTypeExpressionError)
  }
}

/** Resolve all member signatures of a type. */
function resolveMemberSignatures(
  members: TypeElement[],
  filter: SymbolFilter,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.MemberUnion[] {
  const resolvedMembers: Kind.MemberUnion[] = []

  for (let index = 0, length = members.length; index < length; ++index) {
    const resolved = resolveMemberSignature(
      members[index],
      filter,
      defaultValues,
      keepReferences,
      dependencies
    )
    if (resolved) {
      resolvedMembers.push(resolved)
    }
  }

  return resolvedMembers
}

/** Resolve a member signature of a type element. */
function resolveMemberSignature(
  member: TypeElement,
  filter: SymbolFilter,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.MemberUnion | undefined {
  let resolvedMemberType: Kind.TypeExpression | undefined

  if (tsMorph.Node.isPropertySignature(member)) {
    const typeNode = member.getTypeNodeOrThrow()

    resolvedMemberType = resolveTypeExpression(
      typeNode.getType(),
      typeNode,
      filter,
      defaultValues,
      keepReferences,
      dependencies
    )
  } else {
    resolvedMemberType = resolveTypeExpression(
      member.getType(),
      member,
      filter,
      defaultValues,
      keepReferences,
      dependencies
    )
  }

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
    const resolvedParameters = resolveParameters(
      callSignature,
      filter,
      dependencies
    )
    return {
      kind: 'MethodSignature',
      name: member.getName(),
      text,
      ...resolvedParameters,
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

function resolveTypeParameter(
  type: Type,
  filter: SymbolFilter,
  dependencies?: Set<string>
): Kind.TypeParameter | undefined {
  const parameterSymbol = type.getSymbol()

  if (!parameterSymbol) {
    throw new Error(
      `[renoun:resolveTypeParameter]: No symbol found for type parameter "${type.getText()}". If you are seeing this error, please file an issue.`
    )
  }

  const parameterDeclaration = getPrimaryDeclaration(parameterSymbol)

  if (!tsMorph.Node.isTypeParameterDeclaration(parameterDeclaration)) {
    throw new Error(
      `[renoun:resolveTypeParameter]: Expected type parameter declaration, but got "${parameterDeclaration?.getKindName()}". If you are seeing this error, please file an issue.`
    )
  }

  return resolveTypeParameterDeclaration(
    parameterDeclaration,
    filter,
    dependencies
  )
}

function resolveTypeParameterDeclaration(
  parameterDeclaration: TypeParameterDeclaration,
  filter: SymbolFilter,
  dependencies?: Set<string>
): Kind.TypeParameter | undefined {
  const name = parameterDeclaration.getName()
  const constraintNode = parameterDeclaration.getConstraint()
  const resolvedConstraint = constraintNode
    ? resolveTypeExpression(
        constraintNode.getType(),
        constraintNode,
        filter,
        undefined,
        true,
        dependencies
      )
    : undefined
  const defaultNode = parameterDeclaration.getDefault()
  const resolvedDefaultType = defaultNode
    ? resolveTypeExpression(
        defaultNode.getType(),
        defaultNode,
        filter,
        undefined,
        true,
        dependencies
      )
    : undefined

  return {
    kind: 'TypeParameter',
    name,
    text: parameterDeclaration.getText(),
    constraintType: resolvedConstraint,
    defaultType: resolvedDefaultType,
  } satisfies Kind.TypeParameter
}

/**
 * Decides if a call signature is worth resolving when:
 * - Authored inside the project
 * - External and no longer generic
 */
function shouldResolveCallSignature(signature: tsMorph.Signature): boolean {
  // Always keep signatures authored in the project
  if (!signature.getDeclaration().getSourceFile().isInNodeModules()) {
    return true
  }

  // Drop external helpers that are still generic
  if (signature.getTypeParameters().length > 0) {
    return false
  }

  // Keep external non-generic overloads (instantiated at call site)
  return true
}

/** Process all function signatures of a given type including their parameters and return types. */
function resolveCallSignatures(
  signatures: Signature[],
  filter: SymbolFilter = defaultFilter,
  dependencies?: Set<string>
): Kind.CallSignature[] {
  const resolvedSignatures: Kind.CallSignature[] = []
  for (let index = 0, length = signatures.length; index < length; ++index) {
    const resolvedSignature = resolveCallSignature(
      signatures[index],
      filter,
      dependencies
    )
    if (resolvedSignature) {
      resolvedSignatures.push(resolvedSignature)
    }
  }
  return resolvedSignatures
}

/** Process a single function signature including its parameters and return type. */
function resolveCallSignature(
  signature: Signature,
  filter: SymbolFilter = defaultFilter,
  dependencies?: Set<string>
): Kind.CallSignature | undefined {
  if (!shouldResolveCallSignature(signature)) {
    return
  }

  const signatureDeclaration = signature.getDeclaration()
  const resolvedTypeParameters = signature
    .getTypeParameters()
    .map((parameter) => resolveTypeParameter(parameter, filter, dependencies))
    .filter((type): type is Kind.TypeParameter => Boolean(type))
  const typeParametersText = resolvedTypeParameters.length
    ? `<${resolvedTypeParameters
        .map((generic) => {
          const constraintText = generic.constraintType
            ? ` extends ${generic.constraintType.text}`
            : ''
          return generic.name + constraintText
        })
        .join(', ')}>`
    : ''
  const resolvedParameters = resolveParameters(signature, filter, dependencies)
  const parametersText = resolvedParameters.parameters
    .map((parameter) => parameter.text)
    .join(', ')
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

  let simplifiedTypeText: string

  if (tsMorph.Node.isFunctionDeclaration(signatureDeclaration)) {
    simplifiedTypeText = `function ${signatureDeclaration.getName()}${typeParametersText}(${parametersText}): ${returnType.text}`
  } else {
    simplifiedTypeText = `${typeParametersText}(${parametersText}) => ${returnType.text}`
  }

  const resolvedType: Kind.CallSignature = {
    kind: 'CallSignature',
    text: simplifiedTypeText,
    ...resolvedParameters,
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
  signature: Signature,
  filter: SymbolFilter = defaultFilter,
  dependencies?: Set<string>
): { parameters: Kind.Parameter[]; thisType?: Kind.TypeExpression } {
  const signatureDeclaration = signature.getDeclaration()
  const parameters: Kind.Parameter[] = []
  let thisType: Kind.TypeExpression | undefined

  if (tsMorph.Node.isSignaturedDeclaration(signatureDeclaration)) {
    const thisParameter = signatureDeclaration.getParameters().at(0)

    if (thisParameter?.getName() === 'this') {
      const resolvedThisParameter = resolveParameter(
        thisParameter,
        signatureDeclaration,
        filter,
        dependencies
      )

      if (resolvedThisParameter) {
        thisType = resolvedThisParameter.type
      }
    }

    const contextualParameters = signature.getParameters()

    for (const parameter of contextualParameters) {
      const resolved = resolveParameter(
        parameter,
        signatureDeclaration,
        filter,
        dependencies
      )

      if (!resolved) {
        continue
      }

      parameters.push(resolved)
    }
  } else {
    throw new Error(
      `[renoun:resolveParameters]: Expected signature declaration, but got "${signatureDeclaration.getKindName()}". If you are seeing this error, please file an issue.`
    )
  }

  return { parameters, thisType }
}

function resolveParameter(
  parameterDeclarationOrSymbol: ParameterDeclaration | Symbol,
  enclosingNode: Node | undefined,
  filter: SymbolFilter = defaultFilter,
  dependencies?: Set<string>
): Kind.Parameter | undefined {
  let parameterDeclaration: ParameterDeclaration | undefined
  let isContextualSymbol = false

  if (tsMorph.Node.isNode(parameterDeclarationOrSymbol)) {
    parameterDeclaration = parameterDeclarationOrSymbol
  } else {
    const symbolDeclaration = getPrimaryDeclaration(
      parameterDeclarationOrSymbol
    ) as ParameterDeclaration | undefined

    if (tsMorph.Node.isParameterDeclaration(symbolDeclaration)) {
      parameterDeclaration = symbolDeclaration
    }

    isContextualSymbol = true
  }

  if (!parameterDeclaration) {
    throw new Error(
      `[renoun:resolveParameter]: No parameter declaration found. If you are seeing this error, please file an issue.`
    )
  }

  // when dealing with a symbol, we need to get the fully-substituted type of the parameter at the call site
  let contextualType: Type | undefined

  if (isContextualSymbol) {
    if (enclosingNode) {
      contextualType = getTypeAtLocation(
        parameterDeclarationOrSymbol as tsMorph.Symbol,
        enclosingNode,
        parameterDeclaration
      )
    } else {
      throw new Error(
        `[renoun:resolveParameter]: No enclosing node found when resolving a contextual parameter symbol. If you are seeing this error, please file an issue.`
      )
    }
  }

  /**
   * When resolving a generic function's parameter type, we have two candidates:
   *   1. The annotated type node
   *   2. The contextual type at the call site
   *
   * We only want to further resolve the contextual type once all generics
   * have been substituted i.e. once there are no free type parameters.
   * - If the contextual type still has free type parameters, we're still
   *   in the generic's definition context, so stick with the annotation.
   * - Otherwise we're at an instantiated call site, so use the contextual type.
   */
  const parameterTypeNode = parameterDeclaration.getTypeNode()
  const parameterType = parameterDeclaration.getType()
  const initializer = getInitializerValue(parameterDeclaration)
  let resolvedParameterType: Kind.TypeExpression | undefined

  if (parameterTypeNode || contextualType) {
    const hasConcreteContext =
      contextualType && !containsFreeTypeParameter(contextualType)
    const typeToResolve = hasConcreteContext
      ? contextualType! // already instantiated with generics
      : parameterTypeNode
        ? parameterTypeNode.getType() // keep annotation if still generic
        : parameterType

    resolvedParameterType = resolveTypeExpression(
      typeToResolve,
      parameterTypeNode ?? enclosingNode,
      filter,
      initializer,
      false,
      dependencies
    )
  } else if (parameterType) {
    resolvedParameterType = resolveTypeExpression(
      parameterType,
      enclosingNode,
      filter,
      initializer,
      false,
      dependencies
    )
  }

  if (resolvedParameterType) {
    const isOptional = parameterDeclaration.hasQuestionToken()
    const resolvedType =
      (isOptional ?? Boolean(initializer))
        ? filterUndefinedFromUnion(resolvedParameterType)
        : resolvedParameterType
    let name: string | undefined = parameterDeclaration.getName()

    if (name.startsWith('__')) {
      name = undefined
    }

    return {
      kind: 'Parameter',
      name,
      type: resolvedType,
      initializer,
      isOptional: isOptional ?? Boolean(initializer),
      description: getSymbolDescription(
        parameterDeclaration.getSymbolOrThrow()
      ),
      text: parameterDeclaration.getText(),
      ...getJsDocMetadata(parameterDeclaration),
      ...getDeclarationLocation(parameterDeclaration),
    } satisfies Kind.Parameter
  }
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
  const returnTypeNode = indexSignature.getReturnTypeNodeOrThrow()
  const valueType = resolveTypeExpression(
    returnTypeNode.getType(),
    returnTypeNode,
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
function resolvePropertySignatures(
  type: Type,
  enclosingNode?: Node,
  filter: SymbolFilter = defaultFilter,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.PropertySignature[] {
  const isReadonly = isReadonlyType(type, enclosingNode)
  const apparentProperties = type.getApparentProperties()
  const signatures: Kind.PropertySignature[] = []

  for (const property of apparentProperties) {
    const resolvedProperty = resolvePropertySignature(
      property,
      enclosingNode,
      filter,
      defaultValues,
      keepReferences,
      dependencies
    )

    if (resolvedProperty) {
      if (isReadonly) {
        resolvedProperty.isReadonly = true
      }
      signatures.push(resolvedProperty)
    }
  }

  return signatures
}

/** Resolve a property signature. */
function resolvePropertySignature(
  property: Symbol,
  enclosingNode?: Node,
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
  keepReferences: boolean = false,
  dependencies?: Set<string>
): Kind.PropertySignature | undefined {
    const symbolMetadata = getSymbolMetadata(property, enclosingNode)
    const propertyDeclaration = getPrimaryDeclaration(property) as
      | PropertySignature
      | undefined
    const declaration = propertyDeclaration || enclosingNode
    const filterResult = filter(symbolMetadata)

    if (filterResult === false) {
    return
    }

  if (!declaration) {
    throw new Error(
      `[renoun:resolvePropertySignatures]: No property declaration found for "${property.getName()}". You must pass the enclosing node as the second argument to "resolvePropertySignatures".`
    )
  }

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
          enclosingNode ?? declaration,
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
    const isReadonly = propertyDeclaration
          ? 'isReadonly' in propertyDeclaration
            ? propertyDeclaration.isReadonly()
            : false
          : false
        const resolvedType =
          isOptional || Boolean(defaultValue)
            ? filterUndefinedFromUnion(resolvedPropertyType)
            : resolvedPropertyType

    return {
          kind: 'PropertySignature',
          name,
          type: resolvedType,
          text: typeText,
      isOptional,
      isReadonly,
          ...getJsDocMetadata(declaration),
          ...getDeclarationLocation(declaration),
    } satisfies Kind.PropertySignature
  }
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
  const tupleElements = type.getTupleElements()
  const resolvedElements: Kind.TupleElement[] = []

  for (let index = 0, length = tupleElements.length; index < length; ++index) {
    const tupleElementType = tupleElements[index]
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

      resolvedElements.push({
        kind: 'TupleElement',
        type: resolvedType,
        text: resolvedType.text,
        name,
      } as Kind.TupleElement)
    }
  }

  return resolvedElements
}

/** Check if a declaration is exported. */
function isDeclarationExported(
  declaration: Node,
  enclosingNode: Node | undefined
) {
  /** Check if the declaration is exported if it is not the enclosing node. */
  let isExported = false

  if (declaration !== enclosingNode) {
    if (tsMorph.Node.isExportable(declaration)) {
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
  let name: string | undefined

  const kind = enclosingNode?.getKind()
  if (
    kind === tsMorph.SyntaxKind.TypeAliasDeclaration ||
    kind === tsMorph.SyntaxKind.InterfaceDeclaration ||
    kind === tsMorph.SyntaxKind.ClassDeclaration ||
    kind === tsMorph.SyntaxKind.EnumDeclaration ||
    kind === tsMorph.SyntaxKind.FunctionDeclaration ||
    kind === tsMorph.SyntaxKind.VariableDeclaration
  ) {
    name = (
      enclosingNode as
        | TypeAliasDeclaration
        | InterfaceDeclaration
        | ClassDeclaration
        | EnumDeclaration
        | FunctionDeclaration
        | VariableDeclaration
    ).getName()
  }

  if (!symbol) {
    return {
      name,
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
      name,
      isExported: false,
      isExternal: false,
      isInNodeModules: false,
      isGlobal: false,
      isVirtual: false,
      isPrivate: false,
    }
  }

  const declaration = declarations[0]
  const declarationSourceFile = declaration?.getSourceFile()
  const enclosingNodeSourceFile = enclosingNode?.getSourceFile()

  /** Attempt to get the name of the symbol. */
  if (name === undefined) {
    name = symbol.getName()
  }

  /** Ignore private symbol names e.g. __type, __call, __0, etc. */
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
function filterUndefinedFromUnion(
  type: Kind.TypeExpression
): Kind.TypeExpression {
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
    const resolvedCallSignatures = resolveCallSignatures(
      constructorSignaturesToResolve,
      filter,
      dependencies
    )

    if (resolvedCallSignatures.length > 0) {
      const primaryConstructorDeclaration = constructorDeclarations[0]
      const constructor: Kind.ClassConstructor = {
        kind: 'ClassConstructor',
        signatures: resolvedCallSignatures,
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
    const resolvedImplementClauses: Kind.TypeReference[] = []
    for (const implementClause of implementClauses) {
      const resolved = resolveTypeExpression(
        implementClause.getExpression().getType(),
        classDeclaration,
        filter,
        undefined,
        true
      ) as Kind.TypeReference | undefined
      if (resolved) {
        resolvedImplementClauses.push(resolved)
      }
    }
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
    signatures: resolveCallSignatures(callSignatures, filter, dependencies),
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

/**
 * Attempts to find the primary declaration of a symbol based on the following criteria:
 *   - Type-like declarations (`type`, `interface`, `enum`, `class`)
 *   - First function-like declaration that has a body
 *   - Otherwise, the first declaration in the array
 */
function getPrimaryDeclaration(symbol?: Symbol): Node | undefined {
  if (!symbol) {
    return undefined
  }

  const declarations = symbol.getDeclarations()

  if (declarations.length === 0) {
    return undefined
  }

  let firstDeclaration: Node | undefined

  for (let index = 0; index < declarations.length; ++index) {
    const declaration = declarations[index]
    const kind = declaration.getKind()

    switch (kind) {
      case tsMorph.SyntaxKind.TypeAliasDeclaration:
      case tsMorph.SyntaxKind.InterfaceDeclaration:
      case tsMorph.SyntaxKind.EnumDeclaration:
      case tsMorph.SyntaxKind.ClassDeclaration:
        return declaration
    }

    switch (kind) {
      case tsMorph.SyntaxKind.FunctionDeclaration:
      case tsMorph.SyntaxKind.MethodDeclaration:
      case tsMorph.SyntaxKind.Constructor:
      case tsMorph.SyntaxKind.GetAccessor:
      case tsMorph.SyntaxKind.SetAccessor:
      case tsMorph.SyntaxKind.FunctionExpression:
      case tsMorph.SyntaxKind.ArrowFunction:
        if ((declaration as any).getBody?.()) {
          return declaration
        }
    }

    if (index === 0) {
      firstDeclaration = declaration
    }
  }

  return firstDeclaration
}

/**
 * Determines if a type is readonly based on the following criteria:
 * - If the type is a type alias for the `Readonly` utility type.
 * - If the type is a readonly array or tuple.
 * - If the type is an object type where all properties are readonly.
 */
function isReadonlyType(type: Type, enclosingNode: Node | undefined): boolean {
  if (enclosingNode) {
    const typeChecker = enclosingNode.getProject().getTypeChecker()
    const numberIndexInfo = typeChecker.compilerObject.getIndexInfoOfType(
      type.compilerType,
      tsMorph.ts.IndexKind.Number
    )
    if (numberIndexInfo?.isReadonly) {
      return true
    }
  }

  // Check if the type is an alias to the `Readonly` utility type.
  const aliasSymbol = type.getAliasSymbol()
  if (aliasSymbol?.getName() === 'Readonly') {
    return true
  }

  // Check if the type is an object type with all readonly properties.
  if (type.isObject() && !type.isTuple() && !type.isArray()) {
    const properties = type.getProperties()

    if (properties.length === 0) {
      return false
    }

    // Iterate through all properties and ensure each one is readonly.
    for (let index = 0, length = properties.length; index < length; ++index) {
      const property = properties[index]
      const declaration = property.getValueDeclaration()

      if (
        tsMorph.Node.isPropertyDeclaration(declaration) ||
        tsMorph.Node.isPropertySignature(declaration)
      ) {
        if (!declaration.isReadonly()) {
          return false
        }
      } else {
        return false
      }
    }

    return true
  }

  return false
}

/** Determines if a type or enclosing node is a type reference. */
function isTypeReference(type: Type, enclosingNode?: Node): boolean {
  return (
    isTypeReferenceType(type) || tsMorph.Node.isTypeReference(enclosingNode)
  )
}

/** Determines if a type is a reference type. */
function isTypeReferenceType(type: Type): boolean {
  return (type.getObjectFlags() & tsMorph.ObjectFlags.Reference) !== 0
}

/** Determines if a type is a mapped type. */
function isMappedType(type: Type): boolean {
  return (type.getObjectFlags() & tsMorph.ObjectFlags.Mapped) !== 0
}

/** Determines if a type is an indexed access type. */
function isIndexedAccessType(type: Type): boolean {
  return (type.getFlags() & tsMorph.TypeFlags.IndexedAccess) !== 0
}

/** Determines if a type is a symbol type. */
function isSymbolType(type: Type) {
  return type.getSymbol()?.getName() === 'Symbol'
}

/** Determines if a resolved type is a primitive type. */
function isPrimitiveTypeExpression(type: Kind.TypeExpression): boolean {
  return (
    type.kind === 'String' ||
    type.kind === 'Number' ||
    type.kind === 'Boolean' ||
    type.kind === 'Symbol' ||
    type.kind === 'BigInt' ||
    type.kind === 'Null' ||
    type.kind === 'Undefined' ||
    type.kind === 'Void' ||
    type.kind === 'Never' ||
    type.kind === 'Any'
  )
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
    if (isPrimitiveTypeExpression(parameter.type)) {
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
        if (isPrimitiveTypeExpression(member)) {
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

/** Determines if a node is a concrete function. */
function isConcreteFunction(
  node: Node
): node is
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunction
  | ConstructorDeclaration
  | MethodDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration {
  const kind = node.getKind()

  switch (kind) {
    case tsMorph.SyntaxKind.FunctionDeclaration:
    case tsMorph.SyntaxKind.FunctionExpression:
    case tsMorph.SyntaxKind.ArrowFunction:
    case tsMorph.SyntaxKind.Constructor:
    case tsMorph.SyntaxKind.GetAccessor:
    case tsMorph.SyntaxKind.SetAccessor: {
      return Boolean(
        (
          node as
            | FunctionDeclaration
            | FunctionExpression
            | ArrowFunction
            | ConstructorDeclaration
            | GetAccessorDeclaration
            | SetAccessorDeclaration
        ).getBody()
      )
    }

    case tsMorph.SyntaxKind.MethodDeclaration: {
      const method = node as MethodDeclaration
      return !method.isAbstract() && Boolean(method.getBody())
    }
  }

  return false
}

/** Determines if a type is a concrete function type. */
function isConcreteFunctionType(type: Type): boolean {
  if (type.isIntersection()) {
    for (const intersectionType of type.getIntersectionTypes()) {
      if (isConcreteFunctionType(intersectionType)) {
        return true
      }
    }
  }

  if (type.isUnion()) {
    for (const unionType of type.getUnionTypes()) {
      if (isConcreteFunctionType(unionType)) {
        return true
      }
    }
  }

  const symbol = type.getSymbol() ?? type.getAliasSymbol()

  if (!symbol) {
    return false
  }

  const declarations = symbol.getDeclarations()

  for (let index = 0, length = declarations.length; index < length; ++index) {
    const declaration = declarations[index]

    if (isConcreteFunction(declaration)) {
      return true
    }
  }

  return false
}

/** Returns true if the given type is callable (i.e., has one or more call signatures). */
function isCallableType(type: Type): boolean {
  return type.getCallSignatures().length > 0
}

/**
 * Returns true if the given type is a factory function type.
 * A factory function type is a callable type that is not a concrete function type.
 */
function isFactoryFunctionType(type: Type): boolean {
  return isCallableType(type) && !isConcreteFunctionType(type)
}

/** Checks if a node has a type node. */
function hasTypeNode(
  node?: Node
): node is
  | ParameterDeclaration
  | PropertyDeclaration
  | PropertySignature
  | VariableDeclaration
  | TypeAliasDeclaration {
  if (!node) {
    return false
  }

  switch (node.getKind()) {
    case tsMorph.SyntaxKind.Parameter:
    case tsMorph.SyntaxKind.PropertyDeclaration:
    case tsMorph.SyntaxKind.PropertySignature:
    case tsMorph.SyntaxKind.VariableDeclaration:
    case tsMorph.SyntaxKind.TypeAliasDeclaration:
      return true
  }

  return false
}

/**
 * Checks if a type contains free type parameters that are not bound to a specific type.
 * This will recursively inspect the given type and its type arguments (including
 * those from aliases, unions, and intersections) to determine if any unbound type
 * parameters are present. It uses a set to track types that have already been checked
 * to avoid infinite recursion.
 *
 * A free type parameter is a type variable (like `Type` in a generic function or class)
 * that has not been substituted with a concrete type. These are typically present
 * in generic declarations before they are instantiated and represent types that
 * are still "open" or unresolved.
 *
 * ```ts
 * function identity<Type>(value: Type): Type {
 *   return value;
 * }
 * ```
 *
 * `Type` is a free type parameter in the type of `identity` above. Once it is
 * called with a concrete type, `Type` is bound to that type, and is no longer free:
 *
 * ```ts
 * const result = identity(123) // `Type` is now bound to `number`
 * ```
 */
function containsFreeTypeParameter(
  type: Type | undefined,
  seen: Set<Type> = new Set()
): boolean {
  if (!type) {
    return false
  }

  if (type.isTypeParameter()) {
    return true
  }

  // avoid infinite recursion for self-referential types
  if (seen.has(type)) {
    return false
  }
  seen.add(type)

  const aliasArguments = type.getAliasTypeArguments()
  for (let index = 0, length = aliasArguments.length; index < length; ++index) {
    if (containsFreeTypeParameter(aliasArguments[index], seen)) {
      return true
    }
  }

  const typeArguments = type.getTypeArguments()
  for (let index = 0, length = typeArguments.length; index < length; ++index) {
    if (containsFreeTypeParameter(typeArguments[index], seen)) {
      return true
    }
  }

  if (type.isIntersection()) {
    for (const intersectionType of type.getIntersectionTypes()) {
      if (containsFreeTypeParameter(intersectionType, seen)) {
        return true
      }
    }
  }

  if (type.isUnion()) {
    for (const unionType of type.getUnionTypes()) {
      if (containsFreeTypeParameter(unionType, seen)) {
        return true
      }
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
function getTypeAtLocation<
  Symbol extends { getTypeAtLocation(node: Node): Type },
>(symbol: Symbol, location: Node, declaration?: Node): Type {
  return (
    getDeclaredAnnotationType(declaration) ?? symbol.getTypeAtLocation(location)
  )
}

/**
 * Decide whether a `TypeReference` should be fully resolved or kept as a reference.
 *
 * The guiding principle is to inline only when every part of the reference is
 * local to the project and concrete. The alias is kept when it is public,
 * external, or still generic.
 *
 * Concretely a type is resolved when all of the following criteria are met:
 * - The reference is not already being resolved (prevents infinite loops).
 * - The reference itself doesn't contain any free type parameters (i.e. it is already fully instantiated).
 * - At least one type-argument is *internal* and none of the arguments are:
 *    - imported into the current file
 *    - exported from their source file
 *    - declared in `node_modules`
 */
function shouldResolveReference(type: Type, enclosingNode?: Node): boolean {
  if (resolvingReferences.has(type)) {
    return false
  }

  if (containsFreeTypeParameter(type)) {
    return false
  }

  const typeArguments = [
    ...type.getAliasTypeArguments(),
    ...type.getTypeArguments(),
  ]
  const hasInternalTypeArgument = typeArguments.some((typeArgument) => {
    const symbol = typeArgument.getSymbol() ?? typeArgument.getAliasSymbol()

    if (!symbol) {
      return false
    }

    return symbol.getDeclarations().every((declaration) => {
      return (
        !declaration.getSourceFile().isInNodeModules() &&
        !isDeclarationExported(declaration, undefined)
      )
    })
  })

  // keep resolving only for internal type arguments
  if (hasInternalTypeArgument) {
    return true
  }

  // keep alias when:
  // - all type arguments are public or external
  // - the alias symbol itself is external / exported
  const symbol = type.getAliasSymbol() ?? type.getSymbol()

  if (
    symbol?.getDeclarations().some((declaration) => {
      return (
        declaration.getSourceFile().isInNodeModules() ||
        isDeclarationExported(declaration, enclosingNode)
      )
    })
  ) {
    return false
  }

  return true
}

/**
 * Decide whether a `MappedType` should be resolved or kept as a reference:
 * - If the mapped type itself has free type parameters
 * - If the constraint type is exported, external, or from node_modules
 */
function shouldResolveMappedType(
  mappedType: Type,
  mappedNode: tsMorph.MappedTypeNode
): boolean {
  if (containsFreeTypeParameter(mappedType)) {
    return false
  }

  const typeParameter = mappedNode.getTypeParameter()
  const constraintType = typeParameter.getConstraintOrThrow().getType()

  if (!constraintType) {
    return false
  }

  return shouldResolveReference(constraintType, mappedNode)
}

/**
 * Examine every declaration for the provided symbol and return the first
 * module specifier that comes from an import-style declaration.
 */
function getModuleFromSymbol(symbol: tsMorph.Symbol | undefined) {
  if (!symbol) {
    return undefined
  }

  for (const declaration of symbol.getDeclarations()) {
    //`import { Button } from 'ui/components'
    if (tsMorph.Node.isImportSpecifier(declaration)) {
      const importDeclaration = declaration.getFirstAncestorByKind(
        tsMorph.SyntaxKind.ImportDeclaration
      )
      if (importDeclaration) {
        return importDeclaration.getModuleSpecifierValue()
      }
    }

    // `import * as React from "react"` or `import React from "react"`
    if (
      tsMorph.Node.isNamespaceImport(declaration) ||
      tsMorph.Node.isImportClause(declaration)
    ) {
      const importDeclaration = declaration.getFirstAncestorByKind(
        tsMorph.SyntaxKind.ImportDeclaration
      )
      if (importDeclaration) {
        return importDeclaration.getModuleSpecifierValue()
      }
    }

    // `import fs = require('fs')`
    if (tsMorph.Node.isImportEqualsDeclaration(declaration)) {
      const moduleReference = declaration.getModuleReference()
      if (tsMorph.Node.isExternalModuleReference(moduleReference)) {
        const expression = moduleReference.getExpression()
        if (tsMorph.Node.isStringLiteral(expression)) {
          return expression.getLiteralText()
        }
      }
    }
  }
}

/** Return the module specifier (e.g. `react`) for a given `TypeReferenceNode`. */
function getModuleSpecifierFromTypeReference(
  typeReferenceNode: TypeReferenceNode
): string | undefined {
  const typeName = typeReferenceNode.getTypeName()

  if (tsMorph.Node.isQualifiedName(typeName)) {
    const rightMostIdentifierSymbol = typeName.getRight().getSymbol()
    const moduleFromRightIdentifier = getModuleFromSymbol(
      rightMostIdentifierSymbol
    )
    if (moduleFromRightIdentifier) {
      return moduleFromRightIdentifier
    }

    // Walk left until we reach the root identifier and try that.
    let leftSide: tsMorph.EntityName | tsMorph.Expression = typeName.getLeft()
    while (tsMorph.Node.isQualifiedName(leftSide)) {
      leftSide = leftSide.getLeft()
    }

    if (tsMorph.Node.isIdentifier(leftSide)) {
      const leftMostIdentifierSymbol = leftSide.getSymbol()
      const moduleFromLeftIdentifier = getModuleFromSymbol(
        leftMostIdentifierSymbol
      )
      if (moduleFromLeftIdentifier) {
        return moduleFromLeftIdentifier
      }
    }
  }

  // Simple identifier name
  if (tsMorph.Node.isIdentifier(typeName)) {
    const identifierSymbol = typeName.getSymbol()
    const moduleFromIdentifier = getModuleFromSymbol(identifierSymbol)
    if (moduleFromIdentifier) {
      return moduleFromIdentifier
    }
  }

  // Nothing matched, the reference is likely global (standard lib, DOM, etc.)
  return undefined
}

/** Prints helpful information about a node for debugging. */
function printNode(node: tsMorph.Node) {
  const kindName = node.getKindName()
  let output = `Kind: ${kindName}\n`

  if (tsMorph.Node.isFunctionDeclaration(node)) {
    output += `Name: ${node.getName()}\n`
    output += `Signature: ${node.getSignature().getDeclaration().getText()}\n`
  } else if (tsMorph.Node.isPropertyDeclaration(node)) {
    output += `Name: ${node.getName()}\n`
    output += `Type: ${node.getType().getText()}\n`
  }

  output += `Text: ${node.getText()}\n`

  const sourceFile = node.getSourceFile()

  output += `File: ${sourceFile.getFilePath().replace(getRootDirectory(), '').slice(1)}\n`

  const startPos = sourceFile.getLineAndColumnAtPos(node.getStart())
  const endPos = sourceFile.getLineAndColumnAtPos(node.getEnd())

  output += `Position: ${startPos.line}:${startPos.column} – ${endPos.line}:${endPos.column}\n`

  return output
}
