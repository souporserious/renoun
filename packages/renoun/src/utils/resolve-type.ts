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
  FunctionDeclaration,
  Signature,
  Symbol,
  Type,
  TypeElement,
  TypeParameterDeclaration,
  TypeReferenceNode,
  ModuleDeclaration,
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

  export type ComponentParameterTypeExpression =
    | TypeLiteral<MethodSignature | PropertySignature>
    | TypeReference

  export type ComponentParameter = Parameter<
    | ComponentParameterTypeExpression
    | IntersectionType<ComponentParameterTypeExpression>
    | UnionType<ComponentParameterTypeExpression>
  >

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

  export interface TypeQuery extends Kind.Shared {
    kind: 'TypeQuery'

    /** The name of the expression being queried, e.g. `getValue` in `typeof getValue<Type>`. */
    name: string

    /** The type arguments passed to the call site, e.g. `Type` in `typeof getValue<Type>`. */
    typeArguments: TypeExpression[]
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

    /** The name of the referenced type. */
    name?: string

    /** The type arguments passed passed to the call site, e.g. `Type` in `Partial<Type>`. */
    typeArguments?: TypeExpression[]

    /** The module specifier where the referenced type is exported from (e.g. "react"). */
    moduleSpecifier?: string
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
  export interface MethodSignature extends SharedDocumentable {
    kind: 'MethodSignature'
    signatures: CallSignature[]
  }

  export type TypeExpression =
    | String
    | Number
    | Boolean
    | Symbol
    | BigInt
    | Object
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
    | TypeQuery
    | TypeReference
    | InferType
    | Void
    | Null
    | Undefined
    | Any
    | Unknown
    | Never

  export interface Namespace extends SharedDocumentable {
    kind: 'Namespace'

    /** All declarations exported from the namespace. */
    types: Kind[]
  }
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
  | Kind.MethodSignature
  | Kind.PropertySignature
  | Kind.IndexSignature
  | Kind.Parameter
  | Kind.Namespace

export type TypeByKind<Type, Key> = Type extends { kind: Key } ? Type : never

export type TypeOfKind<Key extends Kind['kind']> = TypeByKind<Kind, Key>

export type SymbolMetadata = ReturnType<typeof getSymbolMetadata>

export type SymbolFilter = (symbolMetadata: SymbolMetadata) => boolean

/** Describes one "include" rule. */
export interface FilterDescriptor {
  /** Package name that exported the type, e.g. `react`. Omit to match any package. */
  moduleSpecifier?: string

  /** One or more type selections. */
  types: {
    /** Fully‑qualified name e.g. `React.ButtonHTMLAttributes`. */
    name: string

    /** Optional allowlist of property names for the matched type. */
    properties?: string[]
  }[]
}

export type TypeFilter = FilterDescriptor | FilterDescriptor[]

function shouldIncludeType(
  filter: TypeFilter | undefined,
  symbol: SymbolMetadata,
  importSpecifier?: string
) {
  // Local project symbols are always kept
  if (!symbol.isInNodeModules && !symbol.isExternal) {
    return true
  }

  if (!filter) {
    return true
  }

  const rules = Array.isArray(filter) ? filter : [filter]

  return rules.some((rule) => {
    // ignore if the rule targets a different module
    if (rule.moduleSpecifier && rule.moduleSpecifier !== importSpecifier) {
      return false
    }

    // wildcard for this module
    if (!rule.types?.length) {
      return true
    }

    return rule.types.some((type) => type.name === symbol.name)
  })
}

declare module 'ts-morph' {
  export namespace ts {
    interface Type {
      /** Internal compiler id. */
      id: number
    }
  }
}

/** Tracks types currently being resolved by compiler type id (stable across wrappers). */
const resolvingTypes = new Set<number>()

/** Tracks aliases currently being expanded to prevent recursive type references. */
const resolvingAliasSymbols = new Set<tsMorph.Symbol>()

/** Creates a shallow reference to a type. */
function toShallowReference(
  type: Type,
  enclosingNode?: Node
): Kind.TypeReference {
  const symbol = type.getAliasSymbol() || type.getSymbol()
  const name = symbol?.getName()
  const declaration = symbol ? getPrimaryDeclaration(symbol) : undefined

  return {
    kind: 'TypeReference',
    name,
    text: type.getText(enclosingNode, TYPE_FORMAT_FLAGS),
    ...(declaration ? getDeclarationLocation(declaration) : {}),
  } satisfies Kind.TypeReference
}

const TYPE_FORMAT_FLAGS =
  tsMorph.TypeFormatFlags.NoTruncation |
  tsMorph.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  tsMorph.TypeFormatFlags.WriteArrayAsGenericType

/** Process type metadata. */
export function resolveType(
  type: Type,
  enclosingNode?: Node,
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
  dependencies?: Set<string>
): Kind | undefined {
  resolvingTypes.add(type.compilerType.id)

  try {
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
          dependencies
        )
      } else {
        variableTypeResolved = resolveTypeExpression(
          type,
          enclosingNode,
          filter,
          defaultValues,
          dependencies
        )
      }

      if (!variableTypeResolved) {
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
        enclosingNode,
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
        dependencies
      )

      if (!resolvedTypeExpression) {
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
    } else if (
      tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration) &&
      !symbolDeclaration.getSourceFile().isInNodeModules()
    ) {
      const typeNode = symbolDeclaration.getTypeNodeOrThrow()
      const resolvedTypeExpression = resolveTypeExpression(
        typeNode.getType(),
        typeNode,
        filter,
        defaultValues,
        dependencies
      )

      if (!resolvedTypeExpression) {
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
    } else if (tsMorph.Node.isInterfaceDeclaration(enclosingNode)) {
      const resolvedTypeParameters: Kind.TypeParameter[] = []

      for (const typeParameter of enclosingNode.getTypeParameters()) {
        const resolved = resolveType(
          typeParameter.getType(),
          typeParameter,
          filter,
          undefined,
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
          enclosingNode.getMembers(),
          filter,
          defaultValues,
          dependencies
        ),
      } satisfies Kind.Interface
    } else if (
      tsMorph.Node.isInterfaceDeclaration(symbolDeclaration) &&
      !symbolDeclaration.getSourceFile().isInNodeModules()
    ) {
      const resolvedTypeParameters: Kind.TypeParameter[] = []

      for (const typeParameter of symbolDeclaration.getTypeParameters()) {
        const resolved = resolveType(
          typeParameter.getType(),
          typeParameter,
          filter,
          undefined,
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
          dependencies
        ),
      } satisfies Kind.Interface
    } else if (tsMorph.Node.isModuleDeclaration(enclosingNode)) {
      const types: Kind[] = []

      for (const declarations of enclosingNode
        .getExportedDeclarations()
        .values()) {
        for (const declaration of declarations) {
          const resolvedMemberType = resolveType(
            declaration.getType(),
            declaration,
            filter,
            defaultValues,
            dependencies
          )

          if (resolvedMemberType) {
            types.push(resolvedMemberType)
          }
        }
      }

      resolvedType = {
        kind: 'Namespace',
        name: symbolMetadata.name,
        text: typeText,
        types,
      } satisfies Kind.Namespace
    } else {
      if (tsMorph.Node.isVariableDeclaration(enclosingNode)) {
        const resolvedTypeExpression = resolveTypeExpression(
          type,
          declaration,
          filter,
          defaultValues,
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
      } else if (isPrimitiveType(type)) {
        const resolvedPrimitiveType = resolvePrimitiveType(type, enclosingNode)

        if (resolvedPrimitiveType) {
          resolvedType = resolvedPrimitiveType
        }
      }

      if (!resolvedType) {
        throw new Error(
          `[renoun:resolveType]: No type could be resolved for "${symbolMetadata.name}". Please file an issue if you encounter this error.`
        )
      }
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
  } finally {
    resolvingTypes.delete(type.compilerType.id)
  }
}

/** Resolves a type expression. */
function resolveTypeExpression(
  type: Type,
  enclosingNode?: Node,
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
  dependencies?: Set<string>
): Kind.TypeExpression | undefined {
  const symbol = type.getSymbol()
  const aliasSymbol = type.getAliasSymbol()
  const symbolDeclaration = getPrimaryDeclaration(aliasSymbol || symbol)
  const typeText = type.getText(undefined, TYPE_FORMAT_FLAGS)

  let resolvedType: Kind.TypeExpression | undefined
  let moduleSpecifier: string | undefined

  if (isTypeReference(type, enclosingNode)) {
    if (shouldResolveTypeReference(type, enclosingNode)) {
      // If the target node is an array type node, then we need to resolve the element type immediately since arrays are a special cased reference type
      const targetNode = tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)
        ? symbolDeclaration.getTypeNode()
        : undefined
      if (targetNode && tsMorph.Node.isArrayTypeNode(targetNode)) {
        const elementNode = targetNode.getElementTypeNode()
        const elementType = elementNode.getType()
        const resolvedArrayType = resolvingTypes.has(
          elementType.compilerType.id
        )
          ? toShallowReference(elementType, elementNode)
          : resolveTypeExpression(
              elementType,
              elementNode,
              filter,
              defaultValues,
              dependencies
            )

        if (!resolvedArrayType) {
          throw new UnresolvedTypeExpressionError(elementType, elementNode)
        }

        resolvedType = {
          kind: 'TypeReference',
          name: 'Array',
          text: `Array<${resolvedArrayType.text}>`,
          typeArguments: [resolvedArrayType],
          ...getDeclarationLocation(targetNode),
        } as Kind.TypeReference
      } else {
        resolvingTypes.add(type.compilerType.id)
        resolvedType = resolveTypeExpression(
          type.getApparentType(),
          symbolDeclaration ?? enclosingNode,
          filter,
          defaultValues,
          dependencies
        )
        resolvingTypes.delete(type.compilerType.id)
      }
    } else if (tsMorph.Node.isTypeReference(enclosingNode)) {
      const resolvedTypeArguments: Kind.TypeExpression[] = []

      for (const typeArgument of enclosingNode.getTypeArguments()) {
        const typeArgumentType = typeArgument.getType()
        if (resolvingTypes.has(typeArgumentType.compilerType.id)) {
          resolvedTypeArguments.push(
            toShallowReference(typeArgumentType, typeArgument)
          )
          continue
        }
        const resolvedTypeArgument = resolveTypeExpression(
          typeArgumentType,
          typeArgument,
          filter,
          defaultValues,
          dependencies
        )

        if (resolvedTypeArgument) {
          resolvedTypeArguments.push(resolvedTypeArgument)
        }
      }

      const typeName = enclosingNode.getTypeName()
      let referenceName = typeName.getText()
      let locationNode: Node = enclosingNode

      // If the type name resolves to a type parameter, grab the concrete symbol
      if (tsMorph.Node.isIdentifier(typeName)) {
        const typeNameSymbol = typeName.getSymbol()

        if (
          typeNameSymbol &&
          typeNameSymbol
            .getDeclarations()
            .every(tsMorph.Node.isTypeParameterDeclaration)
        ) {
          const typeNameVisibility = getSymbolVisibility(
            typeNameSymbol,
            enclosingNode
          )

          if (typeNameVisibility === 'node-modules') {
            // Get the substituted type's symbol after generic instantiation
            const apparent = type.getApparentType()
            const concreteSymbol =
              apparent.getAliasSymbol() || apparent.getSymbol()

            if (
              concreteSymbol &&
              !concreteSymbol
                .getDeclarations()
                .every(tsMorph.Node.isTypeParameterDeclaration)
            ) {
              const concreteVisibility = getSymbolVisibility(
                concreteSymbol,
                enclosingNode
              )

              if (concreteVisibility !== 'node-modules') {
                referenceName = concreteSymbol.getName()
                const concreteDeclaration =
                  getPrimaryDeclaration(concreteSymbol)
                if (concreteDeclaration) {
                  locationNode = concreteDeclaration
                }
              }
            }
          }
        }
      }

      moduleSpecifier = getModuleSpecifierFromTypeReference(enclosingNode)

      resolvedType = {
        kind: 'TypeReference',
        name: referenceName,
        text: typeText,
        typeArguments: resolvedTypeArguments,
        moduleSpecifier,
        ...getDeclarationLocation(locationNode),
      } satisfies Kind.TypeReference
    } else {
      const typeArguments = aliasSymbol
        ? type.getAliasTypeArguments()
        : type.getTypeArguments()
      const resolvedTypeArguments: Kind.TypeExpression[] = []

      for (const typeArgument of typeArguments) {
        if (resolvingTypes.has(typeArgument.compilerType.id)) {
          resolvedTypeArguments.push(
            toShallowReference(typeArgument, enclosingNode)
          )
          continue
        }
        const resolvedTypeArgument = resolveTypeExpression(
          typeArgument,
          enclosingNode,
          filter,
          defaultValues,
          dependencies
        )

        if (resolvedTypeArgument) {
          resolvedTypeArguments.push(resolvedTypeArgument)
        }
      }

      let name = symbol?.getName()
      let locationNode = enclosingNode

      // Prefer the alias name if defined in the project
      if (aliasSymbol) {
        if (
          name?.startsWith('__') ||
          getSymbolVisibility(aliasSymbol, enclosingNode) !== 'node-modules'
        ) {
          name = aliasSymbol.getName()
          locationNode = getPrimaryDeclaration(aliasSymbol)
        }
      }

      moduleSpecifier = getModuleSpecifierFromImports(
        enclosingNode,
        aliasSymbol || symbol
      )

      resolvedType = {
        kind: 'TypeReference',
        name,
        text: typeText,
        typeArguments: resolvedTypeArguments,
        moduleSpecifier,
        ...(locationNode ? getDeclarationLocation(locationNode) : {}),
      } satisfies Kind.TypeReference
    }

    // Determine if we need to further resolve based on a matching filter
    if (filter) {
      const normalizedFilter = Array.isArray(filter) ? filter : [filter]
      const moduleSpecifierFilter = normalizedFilter.find(
        (descriptor) => descriptor.moduleSpecifier === moduleSpecifier
      )

      if (moduleSpecifierFilter) {
        const typeFilterMatch = moduleSpecifierFilter.types.find((type) =>
          symbol ? type.name === symbol.getName() : null
        )

        // Attempt to resolve a `TypeLiteral` with the properties that match the filter
        if (typeFilterMatch?.properties) {
          const members: Kind.PropertySignature[] = []

          for (const propertyName of typeFilterMatch.properties) {
            const property = type.getApparentProperty(propertyName)

            if (!property) {
              continue
            }

            const resolved = resolvePropertySignature(
              property,
              enclosingNode,
              undefined,
              defaultValues,
              dependencies
            )

            if (resolved) {
              members.push(resolved)
            }
          }

          if (members.length) {
            const body = members
              .map((member) =>
                member.kind === 'PropertySignature'
                  ? `${member.name}${member.isOptional ? '?:' : ': '} ${member.type.text}`
                  : member.text.replace(/\s*;\s*$/, '')
              )
              .join('; ')
            resolvedType = {
              kind: 'TypeLiteral',
              text: `{ ${body} }`,
              members,
            } satisfies Kind.TypeLiteral
          }
        }
      }
    }
  } else {
    if (tsMorph.Node.isParenthesizedTypeNode(enclosingNode)) {
      const typeNode = enclosingNode.getTypeNode()

      return resolveTypeExpression(
        typeNode.getType(),
        typeNode,
        filter,
        defaultValues,
        dependencies
      )
    } else if (tsMorph.Node.isTypeOperatorTypeNode(enclosingNode)) {
      const operandNode = enclosingNode.getTypeNode()
      const operandType = resolveTypeExpression(
        operandNode.getType(),
        operandNode,
        filter,
        defaultValues,
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
    } else if (isTypeOperatorType(type)) {
      const compilerFactory = (type as any)._context.compilerFactory
      const operandType = compilerFactory.getType(type.compilerType.type)
      const resolvedOperand = resolveTypeExpression(
        operandType,
        enclosingNode,
        filter,
        defaultValues,
        dependencies
      )

      if (!resolvedOperand) {
        throw new UnresolvedTypeExpressionError(operandType, enclosingNode)
      }

      resolvedType = {
        kind: 'TypeOperator',
        text: typeText,
        operator: 'keyof',
        type: resolvedOperand,
      } satisfies Kind.TypeOperator
    } else if (tsMorph.Node.isTypeQuery(enclosingNode)) {
      let resolvedTypeArguments: Kind.TypeExpression[] = []

      for (const typeArgument of enclosingNode.getTypeArguments()) {
        const resolvedTypeArgument = resolveTypeExpression(
          typeArgument.getType(),
          typeArgument,
          filter,
          defaultValues,
          dependencies
        )

        if (resolvedTypeArgument) {
          resolvedTypeArguments.push(resolvedTypeArgument)
        }
      }

      resolvedType = {
        kind: 'TypeQuery',
        text: typeText,
        name: enclosingNode.getExprName().getText(),
        typeArguments: resolvedTypeArguments,
        ...getDeclarationLocation(enclosingNode),
      } satisfies Kind.TypeQuery
    } else if (tsMorph.Node.isIndexedAccessTypeNode(enclosingNode)) {
      const leftMostTypeReference = getLeftMostTypeReference(enclosingNode)

      // If the left-most type reference is not exported resolve the type without context to flatten
      if (leftMostTypeReference) {
        const referenceDeclaration = getPrimaryDeclaration(
          leftMostTypeReference.getTypeName().getSymbolOrThrow()
        )
        const isInNodeModules = referenceDeclaration
          ? referenceDeclaration.getSourceFile().isInNodeModules()
          : false

        // Only flatten for non-exported concrete declarations
        if (
          !isInNodeModules &&
          !tsMorph.Node.isTypeParameterDeclaration(referenceDeclaration) &&
          isTypeReferenceExported(leftMostTypeReference) === false
        ) {
          return resolveTypeExpression(
            type,
            undefined,
            filter,
            defaultValues,
            dependencies
          )
        }
      }

      const objectTypeNode = enclosingNode.getObjectTypeNode()
      const objectType = objectTypeNode.getType()
      const resolvedObjectType = resolveTypeExpression(
        objectType,
        objectTypeNode,
        filter,
        defaultValues,
        dependencies
      )

      if (!resolvedObjectType) {
        throw new UnresolvedTypeExpressionError(objectType, objectTypeNode)
      }

      const indexTypeNode = enclosingNode.getIndexTypeNode()
      const indexType = indexTypeNode.getType()
      const resolvedIndexType = resolveTypeExpression(
        indexType,
        indexTypeNode,
        filter,
        defaultValues,
        dependencies
      )

      if (!resolvedIndexType) {
        throw new UnresolvedTypeExpressionError(indexType, indexTypeNode)
      }

      resolvedType = {
        kind: 'IndexedAccessType',
        text: typeText,
        objectType: resolvedObjectType,
        indexType: resolvedIndexType,
      } satisfies Kind.IndexedAccessType
    } else if (isIndexedAccessType(type)) {
      const compilerFactory = (type as any)._context.compilerFactory
      const objectType = compilerFactory.getType(type.compilerType.objectType)
      const resolvedObjectType = resolveTypeExpression(
        objectType,
        enclosingNode,
        filter,
        defaultValues,
        dependencies
      )

      if (!resolvedObjectType) {
        throw new UnresolvedTypeExpressionError(objectType, enclosingNode)
      }

      const indexType = compilerFactory.getType(type.compilerType.indexType)
      const resolvedIndexType = resolveTypeExpression(
        indexType,
        enclosingNode,
        filter,
        defaultValues,
        dependencies
      )

      if (!resolvedIndexType) {
        throw new UnresolvedTypeExpressionError(indexType, enclosingNode)
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
    } else if (isPrimitiveType(type)) {
      resolvedType = resolvePrimitiveType(type, enclosingNode)
    } else if (type.isTuple()) {
      const elements = resolveTypeTupleElements(
        type,
        enclosingNode ?? symbolDeclaration,
        filter
      )

      if (elements.length === 0) {
        return
      }

      resolvedType = {
        kind: 'Tuple',
        text: typeText,
        elements,
      } satisfies Kind.Tuple
    } else if (tsMorph.Node.isConditionalTypeNode(enclosingNode)) {
      const checkNode = enclosingNode.getCheckType()
      const checkType = checkNode.getType()
      const resolvedCheckType = resolveTypeExpression(
        checkType,
        checkNode,
        filter,
        defaultValues,
        dependencies
      )
      const extendsNode = enclosingNode.getExtendsType()
      const extendsType = extendsNode.getType()
      const resolvedExtendsType = resolveTypeExpression(
        extendsType,
        extendsNode,
        filter,
        defaultValues,
        dependencies
      )
      const trueNode = enclosingNode.getTrueType()
      const trueType = trueNode.getType()
      const resolvedTrueType = resolveTypeExpression(
        trueType,
        trueNode,
        filter,
        defaultValues,
        dependencies
      )
      const falseNode = enclosingNode.getFalseType()
      const falseType = falseNode.getType()
      const resolvedFalseType = resolveTypeExpression(
        falseType,
        falseNode,
        filter,
        defaultValues,
        dependencies
      )

      if (
        !resolvedCheckType ||
        !resolvedExtendsType ||
        !resolvedTrueType ||
        !resolvedFalseType
      ) {
        throw new UnresolvedTypeExpressionError(type, enclosingNode)
      }

      resolvedType = {
        kind: 'ConditionalType',
        text: typeText,
        checkType: resolvedCheckType,
        extendsType: resolvedExtendsType,
        trueType: resolvedTrueType,
        falseType: resolvedFalseType,
        isDistributive: checkType.isTypeParameter(),
      } satisfies Kind.ConditionalType
    } else if (isConditionalType(type)) {
      const compilerFactory = (type as any)._context.compilerFactory
      const typeChecker = (type as any)._context.typeChecker
        .compilerObject as tsMorph.ts.TypeChecker
      const checkType = compilerFactory.getType(type.compilerType.checkType)
      const resolvedCheckType = resolveTypeExpression(
        checkType,
        enclosingNode,
        filter,
        defaultValues,
        dependencies
      )
      const extendsType = compilerFactory.getType(type.compilerType.extendsType)
      const resolvedExtendsType = resolveTypeExpression(
        extendsType,
        enclosingNode,
        filter,
        defaultValues,
        dependencies
      )
      const trueType = compilerFactory.getType(
        type.compilerType.resolvedTrueType ??
          typeChecker.getTypeFromTypeNode(type.compilerType.root.node.trueType)
      )
      const resolvedTrueType = resolveTypeExpression(
        trueType,
        enclosingNode,
        filter,
        defaultValues,
        dependencies
      )
      const falseType = compilerFactory.getType(
        type.compilerType.resolvedFalseType ??
          typeChecker.getTypeFromTypeNode(type.compilerType.root.node.falseType)
      )
      const resolvedFalseType = resolveTypeExpression(
        falseType,
        enclosingNode,
        filter,
        defaultValues,
        dependencies
      )

      if (
        !resolvedCheckType ||
        !resolvedExtendsType ||
        !resolvedTrueType ||
        !resolvedFalseType
      ) {
        throw new UnresolvedTypeExpressionError(type, enclosingNode)
      }

      resolvedType = {
        kind: 'ConditionalType',
        text: typeText,
        checkType: resolvedCheckType,
        extendsType: resolvedExtendsType,
        trueType: resolvedTrueType,
        falseType: resolvedFalseType,
        isDistributive: checkType.isTypeParameter(),
      } satisfies Kind.ConditionalType
    } else if (type.isUnion() || tsMorph.Node.isUnionTypeNode(enclosingNode)) {
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
            dependencies
          )
          if (resolved) {
            resolvedIntersectionTypes.push(resolved)
          }
        }

        if (resolvedIntersectionTypes.length === 0) {
          return
        }

        // Collapse `string & {}` or `string & Record<never, never>`
        if (isOnlyStringAndEmpty(resolvedIntersectionTypes)) {
          return resolvedIntersectionTypes.find(
            (type) => type.kind === 'String'
          )
        } else if (resolvedIntersectionTypes.length === 1) {
          const resolvedIntersectionType = resolvedIntersectionTypes[0]
          if (resolvedIntersectionType.kind === 'String') {
            return resolvedIntersectionType
          }
        }

        resolvedType = {
          kind: 'IntersectionType',
          text: typeText,
          types: resolvedIntersectionTypes,
        } satisfies Kind.IntersectionType
      } else {
        const aliasSymbol = type.getAliasSymbol()

        if (!tsMorph.Node.isUnionTypeNode(enclosingNode) && aliasSymbol) {
          if (resolvingAliasSymbols.has(aliasSymbol)) {
            const symbolDeclaration = getPrimaryDeclaration(aliasSymbol)
            return toShallowReference(type, symbolDeclaration ?? enclosingNode)
          }
          resolvingAliasSymbols.add(aliasSymbol)
        }

        try {
          const isUnionTypeNode = tsMorph.Node.isUnionTypeNode(enclosingNode)
          const unionElements = isUnionTypeNode
            ? enclosingNode.getTypeNodes()
            : getOriginUnionTypes(type)
          const unionTypes: Kind.TypeExpression[] = []

          for (const element of unionElements) {
            let currentNode: tsMorph.Node | undefined
            let currentType: tsMorph.Type

            if (isUnionTypeNode) {
              const typeNode = element as tsMorph.TypeNode
              currentNode = typeNode
              currentType = typeNode.getType()
            } else {
              const unionType = element as tsMorph.Type
              currentType = unionType
              const elementAliasSymbol = unionType.getAliasSymbol()
              const unionDeclaration = getPrimaryDeclaration(
                elementAliasSymbol || unionType.getSymbol()
              )
              currentNode = hasTypeNode(unionDeclaration)
                ? unionDeclaration.getTypeNode()!
                : unionDeclaration

              // Check if this union element is a type alias that should be preserved as a reference
              if (elementAliasSymbol) {
                const declaration = getPrimaryDeclaration(elementAliasSymbol)

                if (tsMorph.Node.isTypeAliasDeclaration(declaration)) {
                  const resolvedTypeArguments: Kind.TypeExpression[] = []

                  for (const typeArgument of unionType.getAliasTypeArguments()) {
                    const resolvedTypeArgument = resolveTypeExpression(
                      typeArgument,
                      currentNode ?? symbolDeclaration,
                      filter,
                      defaultValues,
                      dependencies
                    )
                    if (resolvedTypeArgument) {
                      resolvedTypeArguments.push(resolvedTypeArgument)
                    }
                  }

                  unionTypes.push({
                    kind: 'TypeReference',
                    name: elementAliasSymbol.getName(),
                    text: currentType.getText(undefined, TYPE_FORMAT_FLAGS),
                    typeArguments: resolvedTypeArguments,
                    ...getDeclarationLocation(declaration),
                  } satisfies Kind.TypeReference)

                  continue
                }
              }
            }

            const resolvedUnionType = resolveTypeExpression(
              currentType,
              currentNode,
              filter,
              defaultValues,
              dependencies
            )

            if (!resolvedUnionType) {
              continue
            }

            const previous = unionTypes[unionTypes.length - 1]
            // Collapse `true | false` → `boolean`
            if (
              resolvedUnionType.kind === 'Boolean' &&
              previous?.kind === 'Boolean'
            ) {
              unionTypes.pop()
              resolvedUnionType.text = 'boolean'
            }

            unionTypes.push(resolvedUnionType)
          }

          resolvedType = {
            kind: 'UnionType',
            text: unionTypes.map((type) => type.text).join(' | '),
            types: unionTypes,
          } satisfies Kind.UnionType
        } finally {
          resolvingAliasSymbols.delete(aliasSymbol!)
        }
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
          return
        }

        resolvedType = {
          kind: 'TypeLiteral',
          text: typeText,
          members: propertySignatures,
        } satisfies Kind.TypeLiteral
      } else {
        if (resolvedIntersectionTypes.length === 0) {
          return
        }

        // Collapse `string & {}` or `string & Record<never, never>`
        if (isOnlyStringAndEmpty(resolvedIntersectionTypes)) {
          return resolvedIntersectionTypes.find(
            (type) => type.kind === 'String'
          )
        } else if (resolvedIntersectionTypes.length === 1) {
          const resolvedIntersectionType = resolvedIntersectionTypes[0]
          if (resolvedIntersectionType.kind === 'String') {
            return resolvedIntersectionType
          }
        }

        resolvedType = {
          kind: 'IntersectionType',
          text: typeText,
          types: resolvedIntersectionTypes,
        } satisfies Kind.IntersectionType
      }
    } else if (tsMorph.Node.isFunctionTypeNode(enclosingNode)) {
      const signature = enclosingNode.getSignature()
      const resolvedSignature = resolveCallSignature(
        signature,
        enclosingNode,
        filter,
        dependencies
      )

      if (!resolvedSignature) {
        throw new UnresolvedTypeExpressionError(type, enclosingNode)
      }

      resolvedType = {
        kind: 'FunctionType',
        text: typeText,
        parameters: resolvedSignature.parameters,
        returnType: resolvedSignature.returnType,
        isAsync: resolvedSignature.returnType
          ? isPromiseLike(resolvedSignature.returnType)
          : false,
        ...getDeclarationLocation(enclosingNode),
        ...getJsDocMetadata(enclosingNode),
      } satisfies Kind.FunctionType
    } else {
      const callSignatures = type.getCallSignatures()

      if (callSignatures.length === 1) {
        const [callSignature] = callSignatures
        const resolvedParameters = resolveParameters(
          callSignature,
          enclosingNode,
          filter,
          dependencies
        )
        const resolvedTypeParameters: Kind.TypeParameter[] = []

        for (const typeParameter of callSignature.getTypeParameters()) {
          const resolved = resolveTypeParameter(
            typeParameter,
            filter,
            dependencies
          )
          if (resolved) {
            resolvedTypeParameters.push(resolved)
          }
        }

        const signatureDeclaration = callSignature.getDeclaration()
        const returnTypeNode = signatureDeclaration.getReturnTypeNode()
        let resolvedReturnType: Kind.TypeExpression | undefined

        if (returnTypeNode) {
          const returnType = returnTypeNode.getType()
          resolvedReturnType = resolveTypeExpression(
            returnType,
            returnTypeNode,
            filter,
            undefined,
            dependencies
          )
        } else {
          const returnType = callSignature.getReturnType()
          resolvedReturnType = resolveTypeExpression(
            returnType,
            signatureDeclaration,
            filter,
            undefined,
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
          ...(resolvedReturnType ? { returnType: resolvedReturnType } : {}),
          isAsync: resolvedReturnType
            ? isPromiseLike(resolvedReturnType)
            : false,
        } satisfies Kind.FunctionType
      } else if (isMappedType(type)) {
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
          if (shouldResolveMappedType(mappedNode, type)) {
            const resolvedMappedType = resolveMappedType(
              type,
              mappedNode,
              filter,
              defaultValues,
              dependencies
            )

            if (resolvedMappedType) {
              return resolvedMappedType
            }
          }

          const keyNode = mappedNode.getTypeParameter()
          const resolvedKeyType = resolveTypeParameterDeclaration(
            keyNode,
            filter,
            dependencies
          )
          const valueNode = mappedNode.getTypeNode()
          const resolvedValueType = valueNode
            ? resolveTypeExpression(
                valueNode.getType(),
                valueNode,
                filter,
                defaultValues,
                dependencies
              )
            : undefined

          if (resolvedKeyType && resolvedValueType) {
            return {
              kind: 'MappedType',
              text: typeText,
              typeParameter: resolvedKeyType,
              type: resolvedValueType,
              isReadonly: Boolean(mappedNode.getReadonlyToken()),
              isOptional: Boolean(mappedNode.getQuestionToken()),
            } satisfies Kind.MappedType
          }
        }
      } else if (type.isObject()) {
        let resolvedMembers: Kind.MemberUnion[] = []
        let objectNode: tsMorph.TypeLiteralNode | undefined

        if (tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)) {
          const typeNode = symbolDeclaration.getTypeNode()
          if (tsMorph.Node.isTypeLiteral(typeNode)) {
            objectNode = typeNode
          }
        } else if (tsMorph.Node.isTypeLiteral(symbolDeclaration)) {
          objectNode = symbolDeclaration
        } else if (tsMorph.Node.isTypeLiteral(enclosingNode)) {
          objectNode = enclosingNode
        }

        if (objectNode) {
          resolvedMembers = resolveMemberSignatures(
            objectNode.getMembers(),
            filter,
            defaultValues,
            dependencies
          )
        } else if (
          type.isAnonymous() ||
          tsMorph.Node.isInterfaceDeclaration(symbolDeclaration) ||
          tsMorph.Node.isObjectLiteralExpression(symbolDeclaration)
        ) {
          const propertySignatures = resolvePropertySignatures(
            type,
            enclosingNode,
            filter,
            defaultValues,
            dependencies
          )
          const indexSignatures = resolveIndexSignatures(
            symbolDeclaration,
            filter
          )
          resolvedMembers = [...propertySignatures, ...indexSignatures]

          // If the literal is truly empty we treat it like `{}` and bail
          if (propertySignatures.length === 0 && indexSignatures.length === 0) {
            return
          }
        } else {
          throw new UnresolvedTypeExpressionError(type, enclosingNode)
        }

        resolvedType = {
          kind: 'TypeLiteral',
          text: typeText,
          members: resolvedMembers,
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
  }

  return resolvedType
}

export class UnresolvedTypeExpressionError extends Error {
  readonly type: Type
  readonly enclosingNode?: Node

  constructor(type: Type, enclosingNode?: Node) {
    let message = `[renoun:UnresolvedTypeExpression] Could not resolve type expression:`

    message += `\n\nType\n\nText: ${type.getText()}`

    const typeFlags = getFlagNames(type.getFlags(), tsMorph.ts.TypeFlags)
    if (typeFlags) {
      message += `\nType Flags: ${typeFlags}`
    }

    const objectFlags = getFlagNames(
      type.getObjectFlags(),
      tsMorph.ts.ObjectFlags
    )
    if (objectFlags) {
      message += `\nObject Flags: ${objectFlags}`
    }

    const symbolDeclaration = getPrimaryDeclaration(type.getSymbol())
    if (symbolDeclaration) {
      message += `\n\nSymbol Declaration\n\n${printNode(symbolDeclaration)}`
    }

    const aliasSymbolDeclaration = getPrimaryDeclaration(type.getAliasSymbol())
    if (aliasSymbolDeclaration) {
      message += `\n\nAlias Symbol Declaration\n\n${printNode(aliasSymbolDeclaration)}`
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

/** Resolves a mapped type. */
function resolveMappedType(
  type: Type,
  enclosingNode: Node | undefined,
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
  dependencies?: Set<string>
): Kind.TypeLiteral | undefined {
  const members: Kind.MemberUnion[] = []
  const stringIndex = type.getStringIndexType()

  if (stringIndex) {
    const value = resolveTypeExpression(
      stringIndex,
      enclosingNode,
      filter,
      defaultValues,
      dependencies
    )
    if (value) {
      const parameter: Kind.IndexSignatureParameter = {
        kind: 'IndexSignatureParameter',
        name: 'key',
        type: { kind: 'String', text: 'string' } satisfies Kind.String,
        text: 'key: string',
      }
      members.push({
        kind: 'IndexSignature',
        parameter,
        type: value,
        text: `[key: string]: ${value.text}`,
        isReadonly: isReadonlyType(type, enclosingNode),
        ...getDeclarationLocation(
          enclosingNode ?? type.getSymbol()?.getDeclarations()?.[0]!
        ),
      } satisfies Kind.IndexSignature)
    }
  }

  const numberIndex = type.getNumberIndexType()

  if (numberIndex) {
    const value = resolveTypeExpression(
      numberIndex,
      enclosingNode,
      filter,
      defaultValues,
      dependencies
    )
    if (value) {
      const parameter: Kind.IndexSignatureParameter = {
        kind: 'IndexSignatureParameter',
        name: 'index',
        type: { kind: 'Number', text: 'number' } satisfies Kind.Number,
        text: 'index: number',
      }
      members.push({
        kind: 'IndexSignature',
        parameter,
        type: value,
        text: `[key: number]: ${value.text}`,
        isReadonly: isReadonlyType(type, enclosingNode),
        ...getDeclarationLocation(
          enclosingNode ?? type.getSymbol()?.getDeclarations()?.[0]!
        ),
      } satisfies Kind.IndexSignature)
    }
  }

  // concrete properties when the key is a finite union
  members.push(
    ...resolvePropertySignatures(
      type,
      enclosingNode,
      filter,
      defaultValues,
      dependencies
    )
  )

  if (!members.length) {
    return
  }

  return {
    kind: 'TypeLiteral',
    text: type.getText(undefined, TYPE_FORMAT_FLAGS),
    members,
  } satisfies Kind.TypeLiteral
}

/** Resolve all member signatures of a type. */
function resolveMemberSignatures(
  members: TypeElement[],
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
  dependencies?: Set<string>
): Kind.MemberUnion[] {
  const resolvedMembers: Kind.MemberUnion[] = []

  for (let index = 0, length = members.length; index < length; ++index) {
    const resolved = resolveMemberSignature(
      members[index],
      filter,
      defaultValues,
      dependencies
    )

    if (!resolved) {
      continue
    }

    if (resolved.kind === 'MethodSignature' && resolvedMembers.length > 0) {
      const previousResolvedMember = resolvedMembers[resolvedMembers.length - 1]

      if (
        previousResolvedMember.kind === 'MethodSignature' &&
        previousResolvedMember.name === resolved.name
      ) {
        // Same method as the previous entry: append its overload(s)
        previousResolvedMember.signatures.push(...resolved.signatures)
        previousResolvedMember.text += `\n${resolved.text}`
        continue
      }
    }

    resolvedMembers.push(resolved)
  }

  return resolvedMembers
}

/** Resolve a member signature of a type element. */
function resolveMemberSignature(
  member: TypeElement,
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
  dependencies?: Set<string>
): Kind.MemberUnion | undefined {
  if (tsMorph.Node.isPropertySignature(member)) {
    const symbol = member.getSymbol()

    if (!symbol) {
      throw new Error(
        '[renoun:resolveMemberSignature] PropertySignature has no symbol.'
      )
    }

    return resolvePropertySignature(
      symbol,
      member,
      filter,
      defaultValues,
      dependencies
    )
  }

  if (tsMorph.Node.isMethodSignature(member)) {
    const signature = member.getSignature()
    const resolvedSignature = resolveCallSignature(
      signature,
      member,
      filter,
      dependencies
    )

    if (!resolvedSignature) {
      throw new UnresolvedTypeExpressionError(member.getType(), member)
    }

    return {
      kind: 'MethodSignature',
      name: member.getName(),
      signatures: [resolvedSignature],
      text: member.getText(),
      ...getJsDocMetadata(member),
      ...getDeclarationLocation(member),
    } satisfies Kind.MethodSignature
  }

  if (tsMorph.Node.isCallSignatureDeclaration(member)) {
    const signature = member.getSignature()
    const resolvedParameters = resolveParameters(
      signature,
      member,
      filter,
      dependencies
    )
    const returnType = resolveTypeExpression(
      signature.getReturnType(),
      signature.getDeclaration(),
      filter,
      undefined,
      dependencies
    )

    return {
      kind: 'CallSignature',
      text: member.getText(),
      ...resolvedParameters,
      returnType,
      ...getJsDocMetadata(member),
      ...getDeclarationLocation(member),
    } satisfies Kind.CallSignature
  }

  if (tsMorph.Node.isIndexSignatureDeclaration(member)) {
    return {
      ...resolveIndexSignature(member, filter),
      ...getJsDocMetadata(member),
      ...getDeclarationLocation(member),
    }
  }

  throw new Error(
    `[renoun:resolveMemberSignature]: Unhandled member signature "${member.getText()}" of kind "${member.getKindName()}". Please file an issue if you encounter this error.`
  )
}

function resolveTypeParameter(
  type: Type,
  filter?: TypeFilter,
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
  filter?: TypeFilter,
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
  enclosingNode: Node | undefined,
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.CallSignature[] {
  const resolvedSignatures: Kind.CallSignature[] = []
  for (let index = 0, length = signatures.length; index < length; ++index) {
    const resolvedSignature = resolveCallSignature(
      signatures[index],
      enclosingNode,
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
  callSignature: Signature,
  enclosingNode: Node | undefined,
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.CallSignature | undefined {
  if (!shouldResolveCallSignature(callSignature)) {
    return
  }

  const signatureDeclaration = callSignature.getDeclaration()
  const resolvedTypeParameters = callSignature
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
  const resolvedParameters = resolveParameters(
    callSignature,
    enclosingNode,
    filter,
    dependencies
  )
  const parametersText = resolvedParameters.parameters
    .map((parameter) => parameter.text)
    .join(', ')
  const returnTypeNode = signatureDeclaration.getReturnTypeNode()
  let resolvedReturnType: Kind.TypeExpression | undefined

  if (returnTypeNode) {
    const returnType = returnTypeNode.getType()
    resolvedReturnType = resolveTypeExpression(
      returnType,
      returnTypeNode,
      filter,
      undefined,
      dependencies
    )
  } else {
    const returnType = callSignature.getReturnType()
    resolvedReturnType = resolveTypeExpression(
      returnType,
      signatureDeclaration,
      filter,
      undefined,
      dependencies
    )
  }

  if (!resolvedReturnType) {
    throw new Error(
      `[renoun:resolveCallSignature]: No return type found for "${signatureDeclaration.getText()}". Please file an issue if you encounter this error.`
    )
  }

  let typeText: string

  if (tsMorph.Node.isFunctionDeclaration(signatureDeclaration)) {
    typeText = `function ${signatureDeclaration.getName()}${typeParametersText}(${parametersText}): ${resolvedReturnType.text}`
  } else {
    typeText = `${typeParametersText}(${parametersText}) => ${resolvedReturnType.text}`
  }

  const resolvedType: Kind.CallSignature = {
    kind: 'CallSignature',
    text: typeText,
    ...resolvedParameters,
    returnType: resolvedReturnType,
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

  if (isPromiseLike(resolvedReturnType)) {
    resolvedType.isAsync = true
  }

  if (resolvedTypeParameters.length) {
    resolvedType.typeParameters = resolvedTypeParameters
  }

  return resolvedType
}

function resolveParameters(
  signature: Signature,
  enclosingNode: Node | undefined,
  filter?: TypeFilter,
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
        enclosingNode || signatureDeclaration,
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
        enclosingNode || signatureDeclaration,
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
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.Parameter | undefined {
  let parameterDeclaration: ParameterDeclaration | undefined
  let parameterType: Type | undefined

  if (tsMorph.Node.isNode(parameterDeclarationOrSymbol)) {
    parameterDeclaration = parameterDeclarationOrSymbol
    parameterType = parameterDeclaration.getType()
  } else {
    const symbolDeclaration = getPrimaryDeclaration(
      parameterDeclarationOrSymbol
    ) as ParameterDeclaration | undefined

    if (tsMorph.Node.isParameterDeclaration(symbolDeclaration)) {
      parameterDeclaration = symbolDeclaration
    }

    if (enclosingNode) {
      parameterType = (
        parameterDeclarationOrSymbol as tsMorph.Symbol
      ).getTypeAtLocation(enclosingNode)
    } else {
      throw new Error(
        `[renoun:resolveParameter]: No enclosing node found when resolving a contextual parameter symbol. If you are seeing this error, please file an issue.`
      )
    }
  }

  if (!parameterDeclaration) {
    throw new Error(
      `[renoun:resolveParameter]: No parameter declaration found. If you are seeing this error, please file an issue.`
    )
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
  const initializer = getInitializerValue(parameterDeclaration)
  const isLocal = parameterDeclaration === enclosingNode
  const isExternal = parameterDeclaration
    ? parameterDeclaration.getSourceFile().isInNodeModules()
    : false
  let resolvedParameterType: Kind.TypeExpression | undefined

  if (parameterTypeNode && (isLocal || !isExternal)) {
    resolvedParameterType = resolveTypeExpression(
      containsFreeTypeParameter(parameterType)
        ? parameterTypeNode.getType() // keep annotation if still generic
        : parameterType,
      parameterTypeNode,
      filter,
      initializer,
      dependencies
    )
  } else {
    resolvedParameterType = resolveTypeExpression(
      parameterType,
      enclosingNode,
      filter,
      initializer,
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
      isRest: parameterDeclaration.isRestParameter(),
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
function resolveIndexSignatures(node?: Node, filter?: TypeFilter) {
  const resolvedSignatures: Kind.IndexSignature[] = []

  // Explicit index signatures declared on the node (e.g. `{ [key: string]: Type }`)
  for (const indexSignature of getIndexSignatures(node)) {
    resolvedSignatures.push(resolveIndexSignature(indexSignature, filter))
  }

  // Implicit string / number index signatures that are represented on the type
  // but have no explicit declaration (e.g. mapped types, utility types, etc.)
  if (node) {
    const type = node.getType()
    const stringIndex = type.getStringIndexType()

    if (stringIndex) {
      const value = resolveTypeExpression(stringIndex, node, filter)

      if (value) {
        const parameter: Kind.IndexSignatureParameter = {
          kind: 'IndexSignatureParameter',
          name: 'key',
          type: { kind: 'String', text: 'string' } as Kind.String,
          text: 'key: string',
        }
        let hasStringIndex = false

        for (const signature of resolvedSignatures) {
          if (signature.parameter.type.kind === 'String') {
            hasStringIndex = true
            break
          }
        }

        if (!hasStringIndex) {
          resolvedSignatures.push({
            kind: 'IndexSignature',
            parameter,
            type: value,
            text: `[key: string]: ${value.text}`,
            isReadonly: isReadonlyType(type, node),
            ...getDeclarationLocation(
              node ?? type.getSymbol()?.getDeclarations()?.[0]!
            ),
          })
        }
      }
    }

    const numberIndex = type.getNumberIndexType()

    if (numberIndex) {
      const value = resolveTypeExpression(numberIndex, node, filter)

      if (value) {
        const parameter: Kind.IndexSignatureParameter = {
          kind: 'IndexSignatureParameter',
          name: 'index',
          type: { kind: 'Number', text: 'number' } as Kind.Number,
          text: 'index: number',
        }
        let hasNumberIndex = false

        for (const signature of resolvedSignatures) {
          if (signature.parameter.type.kind === 'Number') {
            hasNumberIndex = true
            break
          }
        }

        if (!hasNumberIndex) {
          resolvedSignatures.push({
            kind: 'IndexSignature',
            parameter,
            type: value,
            text: `[key: number]: ${value.text}`,
            isReadonly: isReadonlyType(type, node),
            ...getDeclarationLocation(
              node ?? type.getSymbol()?.getDeclarations()?.[0]!
            ),
          })
        }
      }
    }
  }

  return resolvedSignatures
}

/** Process an index signature. */
function resolveIndexSignature(
  indexSignature: IndexSignatureDeclaration,
  filter?: TypeFilter
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
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
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
  dependencies?: Set<string>
): Kind.PropertySignature | undefined {
  const symbolMetadata = getSymbolMetadata(property, enclosingNode)
  const propertyDeclaration = getPrimaryDeclaration(property) as
    | PropertySignature
    | undefined
  const declaration = propertyDeclaration || enclosingNode
  const filterResult = shouldIncludeType(filter, symbolMetadata)

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
  const isLocal = propertyDeclaration === enclosingNode
  const isExternal = propertyDeclaration
    ? propertyDeclaration.getSourceFile().isInNodeModules()
    : false
  let resolvedPropertyType: Kind.TypeExpression | undefined
  let typeText: string | undefined

  if (
    tsMorph.Node.isPropertySignature(propertyDeclaration) &&
    (isLocal || !isExternal)
  ) {
    const typeNode = propertyDeclaration.getTypeNodeOrThrow()
    const typeNodeType = typeNode.getType()

    resolvedPropertyType = resolveTypeExpression(
      typeNodeType,
      typeNode,
      filter,
      defaultValue,
      dependencies
    )
    typeText = propertyDeclaration.getText()
  } else {
    const propertyType = property.getTypeAtLocation(declaration)

    resolvedPropertyType = resolveTypeExpression(
      propertyType,
      declaration,
      filter,
      defaultValue,
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

/** Unwrap Rest and Optional type nodes. */
function unwrapRestAndOptional(node: tsMorph.TypeNode) {
  let currentNode: tsMorph.TypeNode = node
  let isRest = false
  let isOptional = false

  if (currentNode.getKind() === tsMorph.SyntaxKind.RestType) {
    isRest = true
    // ts-morph wrapper exposes getTypeNode() on RestType nodes; duck-type it
    const innerTypeNode = (currentNode as any).getTypeNode?.()
    if (innerTypeNode) {
      currentNode = innerTypeNode
    }
  }

  if (currentNode.getKind() === tsMorph.SyntaxKind.OptionalType) {
    isOptional = true
  }

  return { node: currentNode, isRest, isOptional }
}

/** Process all elements of a tuple type. */
function resolveTypeTupleElements(
  type: Type,
  enclosingNode?: Node,
  filter?: TypeFilter
): Kind.TupleElement[] {
  type TupleElementMetadata = {
    name?: string
    isOptional?: boolean
    isRest?: boolean
    isReadonly?: boolean
    node?: tsMorph.TypeNode
  }

  const elementMetadataList: TupleElementMetadata[] = []

  // Prefer a nearby TupleTypeNode so we can read labels & tokens
  let tupleNode: tsMorph.TupleTypeNode | undefined
  if (tsMorph.Node.isTupleTypeNode(enclosingNode)) {
    tupleNode = enclosingNode
  } else if (tsMorph.Node.isTypeAliasDeclaration(enclosingNode)) {
    const typeNode = enclosingNode.getTypeNode()
    if (typeNode) {
      if (tsMorph.Node.isTupleTypeNode(typeNode)) {
        tupleNode = typeNode
      }
    }
  } else if (hasTypeNode(enclosingNode)) {
    const typeNode = (enclosingNode as any).getTypeNode?.()
    if (typeNode) {
      if (tsMorph.Node.isTupleTypeNode(typeNode)) {
        tupleNode = typeNode
      }
    }
  }

  if (tupleNode) {
    for (const tupleElementNode of tupleNode.getElements()) {
      const elementMetadata: TupleElementMetadata = {}
      let elementTypeNode: tsMorph.TypeNode

      if (tsMorph.Node.isNamedTupleMember(tupleElementNode)) {
        elementMetadata.name = tupleElementNode.getNameNode().getText()
        // tokens on the member itself (e.g. `x?:`, `...x`, `readonly x`)
        const questionTokenNode = (
          tupleElementNode as any
        ).getQuestionTokenNode?.()
        elementMetadata.isOptional = Boolean(questionTokenNode)
        const dotDotDotTokenNode = (
          tupleElementNode as any
        ).getDotDotDotTokenNode?.()
        elementMetadata.isRest = Boolean(dotDotDotTokenNode)

        let hasReadonlyModifier = false
        const hasModifier = (tupleElementNode as any).hasModifier
        if (typeof hasModifier === 'function') {
          hasReadonlyModifier = hasModifier(tsMorph.SyntaxKind.ReadonlyKeyword)
        }
        elementMetadata.isReadonly = hasReadonlyModifier

        elementTypeNode = tupleElementNode.getTypeNode()
        // optional/rest can also wrap the type node: `[x: string?]`, `[...x: T[]]`
        const unwrappedInfo = unwrapRestAndOptional(elementTypeNode)
        if (unwrappedInfo.isOptional) {
          elementMetadata.isOptional = true
        }
        if (unwrappedInfo.isRest) {
          elementMetadata.isRest = true
        }
        elementTypeNode = unwrappedInfo.node
      } else {
        // Plain element: could be RestTypeNode or OptionalType by kind
        elementTypeNode = tupleElementNode as tsMorph.TypeNode
        const unwrappedInfo = unwrapRestAndOptional(elementTypeNode)
        elementMetadata.isOptional = unwrappedInfo.isOptional
        elementMetadata.isRest = unwrappedInfo.isRest
        elementTypeNode = unwrappedInfo.node
      }

      elementMetadata.node = elementTypeNode
      elementMetadataList.push(elementMetadata)
    }
  }

  const tupleElements = type.getTupleElements()
  const resultElements: Kind.TupleElement[] = []

  for (let index = 0; index < tupleElements.length; index++) {
    const elementType = tupleElements[index]
    const elementMetadata = elementMetadataList[index] || {}

    let elementNode: Node | undefined = enclosingNode
    if (elementMetadata.node) {
      elementNode = elementMetadata.node as Node | undefined
    }

    let resolvedType: Kind.TypeExpression | undefined
    if (resolvingTypes.has(elementType.compilerType.id)) {
      resolvedType = toShallowReference(elementType, elementNode)
    } else {
      resolvingTypes.add(elementType.compilerType.id)
      resolvedType = resolveTypeExpression(elementType, elementNode, filter)
      resolvingTypes.delete(elementType.compilerType.id)
    }
    if (!resolvedType) {
      continue
    }

    const element: Kind.TupleElement = {
      kind: 'TupleElement',
      text: resolvedType.text, // label lives in `name`
      type: resolvedType,
    }
    if (elementMetadata.name) element.name = elementMetadata.name
    if (elementMetadata.isOptional) element.isOptional = true
    if (elementMetadata.isRest) element.isRest = true
    if (elementMetadata.isReadonly) element.isReadonly = true

    resultElements.push(element)
  }

  return resultElements
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
    kind === tsMorph.SyntaxKind.ModuleDeclaration ||
    kind === tsMorph.SyntaxKind.TypeAliasDeclaration ||
    kind === tsMorph.SyntaxKind.InterfaceDeclaration ||
    kind === tsMorph.SyntaxKind.ClassDeclaration ||
    kind === tsMorph.SyntaxKind.EnumDeclaration ||
    kind === tsMorph.SyntaxKind.FunctionDeclaration ||
    kind === tsMorph.SyntaxKind.VariableDeclaration
  ) {
    name = (
      enclosingNode as
        | ModuleDeclaration
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
  filter?: TypeFilter,
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
      classDeclaration,
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
      const accessorIsPrivateIdentifier =
        member.getNameNode()?.getKind() === tsMorph.SyntaxKind.PrivateIdentifier

      if (
        !member.hasModifier(tsMorph.SyntaxKind.PrivateKeyword) &&
        !accessorIsPrivateIdentifier
      ) {
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
      const methodIsPrivateIdentifier =
        member.getNameNode()?.getKind() === tsMorph.SyntaxKind.PrivateIdentifier

      if (
        !member.hasModifier(tsMorph.SyntaxKind.PrivateKeyword) &&
        !methodIsPrivateIdentifier
      ) {
        if (!classMetadata.methods) {
          classMetadata.methods = []
        }
        const resolvedMethod = resolveClassMethod(member, filter, dependencies)
        if (resolvedMethod) {
          classMetadata.methods.push(resolvedMethod)
        }
      }
    } else if (tsMorph.Node.isPropertyDeclaration(member)) {
      // Skip properties that are marked private via the `private` keyword or
      // that use JavaScript private identifiers (e.g. `#private`).
      const isPrivateIdentifier =
        member.getNameNode()?.getKind() ===
          tsMorph.SyntaxKind.PrivateIdentifier ||
        member.getName().startsWith('#')

      if (
        !member.hasModifier(tsMorph.SyntaxKind.PrivateKeyword) &&
        !isPrivateIdentifier
      ) {
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
      dependencies
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
        dependencies
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
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.ClassAccessor | undefined {
  const symbolMetadata = getSymbolMetadata(accessor.getSymbol(), accessor)
  const filterResult = shouldIncludeType(filter, symbolMetadata)

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
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.ClassMethod | undefined {
  const callSignatures = method.getType().getCallSignatures()
  const symbolMetadata = getSymbolMetadata(method.getSymbol(), method)
  const filterResult = shouldIncludeType(filter, symbolMetadata)

  if (filterResult === false) {
    return
  }

  const resolvedCallSignatures = resolveCallSignatures(
    callSignatures,
    method,
    filter,
    dependencies
  )

  return {
    kind: 'ClassMethod',
    name: method.getName(),
    scope: getScope(method),
    visibility: getVisibility(method),
    signatures: resolvedCallSignatures,
    text: method.getType().getText(method, TYPE_FORMAT_FLAGS),
    ...getJsDocMetadata(method),
  } satisfies Kind.ClassMethod
}

/** Processes a class property declaration into a metadata object. */
function resolveClassProperty(
  property: PropertyDeclaration,
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.ClassProperty | undefined {
  const symbolMetadata = getSymbolMetadata(property.getSymbol(), property)
  const filterResult = shouldIncludeType(filter, symbolMetadata)

  if (filterResult === false) {
    return
  }

  const resolvedType = resolveTypeExpression(
    property.getType(),
    property,
    filter,
    undefined,
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

/** Resolves a primitive type. */
function resolvePrimitiveType(
  type: Type,
  enclosingNode: Node | undefined
): Kind.TypeExpression | undefined {
  const typeText = type.getText(enclosingNode, TYPE_FORMAT_FLAGS)
  let resolvedType: Kind.TypeExpression

  if (type.isString() || type.isStringLiteral() || type.isTemplateLiteral()) {
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
  } else if (type.isBoolean() || type.isBooleanLiteral()) {
    resolvedType = {
      kind: 'Boolean',
      text: typeText,
    } satisfies Kind.Boolean
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
  } else if (type.isVoid()) {
    resolvedType = {
      kind: 'Void',
      text: 'void',
    } satisfies Kind.Void
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
    return undefined
  }

  return {
    ...resolvedType,
    ...(enclosingNode ? getDeclarationLocation(enclosingNode) : {}),
  }
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

/** Determines if a type is a primitive type. */
function isPrimitiveType(type: Type): boolean {
  return (
    type.isString() ||
    type.isStringLiteral() ||
    type.isTemplateLiteral() ||
    isSymbolType(type) ||
    type.isNumber() ||
    type.isNumberLiteral() ||
    type.isBigInt() ||
    type.isBigIntLiteral() ||
    type.isBoolean() ||
    type.isBooleanLiteral() ||
    type.isNull() ||
    type.isUndefined() ||
    type.isVoid() ||
    type.isUnknown() ||
    type.isNever() ||
    type.isAny()
  )
}

/** Determines if a type is a mapped type. */
function isMappedType(type: Type): boolean {
  return (type.getObjectFlags() & tsMorph.ObjectFlags.Mapped) !== 0
}

/** Determines if a type is a reference type. */
function isReferenceType(type: Type): boolean {
  return (type.getObjectFlags() & tsMorph.ObjectFlags.Reference) !== 0
}

/** Returns true if the given Type is a conditional type (e.g. `A extends B ? X : Y`). */
function isConditionalType(
  type: Type
): type is Type & { compilerType: tsMorph.ts.ConditionalType } {
  return (type.compilerType.flags & tsMorph.ts.TypeFlags.Conditional) !== 0
}

/** Returns true if the given type is an indexed access type (e.g. `Type[Key]`). */
function isIndexedAccessType(
  type: Type
): type is Type & { compilerType: tsMorph.ts.IndexedAccessType } {
  return (type.compilerType.flags & tsMorph.ts.TypeFlags.IndexedAccess) !== 0
}

/** Returns true if the given type is a type operator type (e.g. `keyof Type`). */
function isTypeOperatorType(
  type: Type
): type is Type & { compilerType: tsMorph.ts.IndexType } {
  return (type.compilerType.flags & tsMorph.ts.TypeFlags.Index) !== 0
}

/** Returns true if the given type is a Substitution type (e.g. generic placeholder `Type<Foo>`). */
function isSubstitutionType(type: Type): boolean {
  return (type.getFlags() & tsMorph.ts.TypeFlags.Substitution) !== 0
}

/** Determines if a type is a symbol type. */
function isSymbolType(type: Type) {
  return type.getSymbol()?.getName() === 'Symbol'
}

/** True when the alias unwraps to exactly one function-shaped property. */
function isCallableAlias(type: Type): boolean {
  const apparentType = type.getApparentType()
  return (
    apparentType.getCallSignatures().length === 1 &&
    apparentType.getProperties().length === 0 &&
    !apparentType.isUnion() &&
    !apparentType.isIntersection()
  )
}

/** Determines if a type or enclosing node is a type reference. */
function isTypeReference(type: Type, enclosingNode?: Node): boolean {
  // Primitive and array types can carry a reference flag, so we need to continue checking.
  if (isPrimitiveType(type) || type.isTuple()) {
    return false
  }

  // If the enclosing node is a type reference or the type is a reference type, then treat it as a type reference.
  if (tsMorph.Node.isTypeReference(enclosingNode) || isReferenceType(type)) {
    return true
  }

  // If the type is a callable alias, then we want to expand it to get the function type.
  if (isCallableAlias(type)) {
    return false
  }

  // If the type is a type parameter and the enclosing node is not an infer type node, then treat it as a type reference.
  if (
    (type.isTypeParameter() || isSubstitutionType(type)) &&
    !tsMorph.Node.isInferTypeNode(enclosingNode)
  ) {
    return true
  }

  // Mapped utility types (Partial, Required, Pick, etc.)
  if (isMappedType(type)) {
    return false
  }

  // Finally, check if the symbol is in node_modules.
  const symbol = type.getSymbol()
  if (
    symbol
      ?.getDeclarations()
      .some((declaration) => declaration.getSourceFile().isInNodeModules())
  ) {
    return true
  }

  return false
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
      if (type.name === 'Promise') {
        return true
      }
      if (type.path && /lib\.es.*promise|promise.*lib\.es/.test(type.path)) {
        return true
      }
      return false
    case 'UnionType':
    case 'IntersectionType':
      return type.types.some(isPromiseLike)
  }
  return false
}

/**
 * Returns true only when `types` contains exactly:
 *   - One primitive string
 *   - One empty‑object‑like shape (e.g. `{}`, `Object`, or `Record<never, never>`)
 */
function isOnlyStringAndEmpty(types: Kind.TypeExpression[]): boolean {
  if (types.length !== 2) {
    return false
  }

  let sawString = false
  let sawEmpty = false

  for (const type of types) {
    switch (type.kind) {
      case 'String':
        if (sawString) {
          return false
        }
        sawString = true
        break

      case 'TypeLiteral':
        if (type.members.length !== 0 || sawEmpty) {
          return false
        }
        sawEmpty = true
        break

      case 'TypeReference':
        if (
          type.name === 'Record' &&
          type.typeArguments?.length === 2 &&
          type.typeArguments[0].kind === 'Never' &&
          type.typeArguments[1].kind === 'Never' &&
          !sawEmpty
        ) {
          sawEmpty = true
          break
        }
        return false

      default:
        return false
    }
  }

  return sawString && sawEmpty
}

/** Checks if a type reference's primary declaration is exported. */
function isTypeReferenceExported(
  typeReference: tsMorph.TypeReferenceNode
): boolean {
  const declaration = getPrimaryDeclaration(
    typeReference.getTypeName().getSymbolOrThrow()
  )
  return tsMorph.Node.isExportable(declaration)
    ? declaration.isExported()
    : false
}

/** Gets the left most type reference of an indexed access type node. */
function getLeftMostTypeReference(
  node: tsMorph.IndexedAccessTypeNode
): tsMorph.TypeReferenceNode | undefined {
  let current: tsMorph.TypeNode = node.getObjectTypeNode()
  while (tsMorph.Node.isIndexedAccessTypeNode(current)) {
    current = current.getObjectTypeNode()
  }
  return tsMorph.Node.isTypeReference(current) ? current : undefined
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

/** Gets the visibility of a symbol. */
function getSymbolVisibility(
  symbol: tsMorph.Symbol | undefined,
  enclosingNode: Node | undefined
) {
  if (!symbol) {
    return 'synthetic'
  }

  const declarations = symbol.getDeclarations()

  if (!declarations.length) {
    return 'synthetic'
  }

  const isInNodeModules = declarations.every((declaration) =>
    declaration.getSourceFile().isInNodeModules()
  )

  if (isInNodeModules) {
    return 'node-modules'
  }

  const isExported = declarations.some((declaration) =>
    isDeclarationExported(declaration, enclosingNode)
  )

  return isExported ? 'local-exported' : 'local-internal'
}

/** Determines if a type is trivial (i.e. an empty object). */
function isTrivialType(type: Type): boolean {
  return (
    type.isObject() &&
    !type.isTuple() &&
    !type.isArray() &&
    type.getProperties().length === 0
  )
}

/**
 * Decide whether a `TypeReference` should be fully resolved or kept as a reference.
 *
 * A type is resolved when all of the following criteria are met:
 * - The reference is not already being resolved (prevents infinite loops)
 * - The reference itself doesn't contain any free type parameters (i.e. it is already fully instantiated)
 * - The reference is either:
 *   - declared in the local project
 *   - an alias from node-modules and at least one of its type-arguments comes from the local project (exported or internal) and that argument is non-trivial
 */
function shouldResolveTypeReference(type: Type, enclosingNode?: Node): boolean {
  if (
    resolvingTypes.has(type.compilerType.id) ||
    containsFreeTypeParameter(type)
  ) {
    return false
  }

  // In conditional types, prefer keeping the extends operand as a reference to avoid flattening which can lose intent
  // TODO: this can create references that won't ever be resolved if they are not exported
  if (
    tsMorph.Node.isTypeReference(enclosingNode) &&
    tsMorph.Node.isConditionalTypeNode(enclosingNode.getParent())
  ) {
    return false
  }

  const symbol = type.getAliasSymbol() || type.getSymbol()

  if (!symbol) {
    return false
  }

  const visibility = getSymbolVisibility(symbol, enclosingNode)

  if (visibility === 'local-internal') {
    return true
  }

  if (type.isArray()) {
    const aliasDeclaration = getPrimaryDeclaration(symbol)
    if (tsMorph.Node.isTypeAliasDeclaration(aliasDeclaration)) {
      const targetNode = aliasDeclaration.getTypeNode()
      return tsMorph.Node.isArrayTypeNode(targetNode)
    }
    return false
  }

  if (visibility === 'local-exported') {
    return false
  }

  if (visibility === 'node-modules') {
    const typeArguments = [
      ...type.getAliasTypeArguments(),
      ...type.getTypeArguments(),
    ]

    if (typeArguments.length === 0) {
      return false
    }

    let hasLocalInternalArgument = false
    let hasTrivialArgument = true

    for (const typeArgument of typeArguments) {
      const typeArgumentVisibility = getSymbolVisibility(
        typeArgument.getAliasSymbol() || typeArgument.getSymbol(),
        enclosingNode
      )

      if (typeArgumentVisibility === 'local-internal') {
        hasLocalInternalArgument = true
      }

      if (!isTrivialType(typeArgument)) {
        hasTrivialArgument = false
      }
    }

    if (hasTrivialArgument) {
      return false
    }

    return hasLocalInternalArgument
  }

  return false
}

/** Determine whether a `MappedType` should be fully resolved or kept as a reference. */
function shouldResolveMappedType(
  mappedNode: tsMorph.MappedTypeNode,
  type: tsMorph.Type
): boolean {
  for (const typeArgument of [
    ...type.getAliasTypeArguments(),
    ...type.getTypeArguments(),
  ]) {
    const visibility = getSymbolVisibility(
      typeArgument.getAliasSymbol() ?? typeArgument.getSymbol(),
      mappedNode
    )
    if (visibility === 'local-internal' || visibility === 'local-exported') {
      return true
    }
  }

  const constraint = mappedNode.getTypeParameter().getConstraint()

  if (!constraint) {
    return false
  }

  const operandNode = tsMorph.Node.isTypeOperatorTypeNode(constraint)
    ? constraint.getTypeNode() // `keyof X` -> X
    : constraint //  plain X
  const operandType = operandNode.getType()
  const operandSymbol = operandType.getAliasSymbol() ?? operandType.getSymbol()

  if (!operandSymbol) {
    return false
  }

  const operandIsExternal = operandSymbol
    .getDeclarations()
    .some(
      (declaration) =>
        declaration.getSourceFile().isInNodeModules() ||
        isDeclarationExported(declaration, mappedNode)
    )

  return !operandIsExternal
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

/** Check imports within a single source file to resolve the module specifier. */
function matchImportInSourceFile(
  sourceFile: tsMorph.SourceFile,
  symbol: tsMorph.Symbol,
  declarationFilePaths: Set<string>
): string | undefined {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
    const namespaceImport = importDeclaration.getNamespaceImport()
    if (namespaceImport) {
      const namespaceTypeSymbol = namespaceImport.getType().getSymbol()
      const namespaceExports = namespaceTypeSymbol?.getExports() ?? []

      if (
        namespaceExports.some(
          (exportedSymbol) => exportedSymbol.getName() === symbol.getName()
        )
      ) {
        return moduleSpecifier
      }
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      const importedSymbol = namedImport.getNameNode().getSymbol()
      if (importedSymbol && importedSymbol === symbol) {
        return moduleSpecifier
      }
    }

    const moduleSourceFile = importDeclaration.getModuleSpecifierSourceFile()
    if (
      moduleSourceFile &&
      declarationFilePaths.has(moduleSourceFile.getFilePath())
    ) {
      return moduleSpecifier
    }
  }

  return undefined
}

/** Resolve module specifier by matching the symbol against the current file's imports. */
function getModuleSpecifierFromImports(
  enclosingNode: Node | undefined,
  symbol?: tsMorph.Symbol
) {
  if (!enclosingNode || !symbol) {
    return undefined
  }

  const sourceFile = enclosingNode.getSourceFile()
  const declarationSourceFiles = new Set(
    symbol.getDeclarations().map((declaration) => declaration.getSourceFile())
  )
  const declarationFilePaths = new Set(
    Array.from(declarationSourceFiles).map((sourceFile) =>
      sourceFile.getFilePath()
    )
  )

  const localMatch = matchImportInSourceFile(
    sourceFile,
    symbol,
    declarationFilePaths
  )
  if (localMatch) {
    return localMatch
  }

  const seenFilePaths = new Set<string>()
  for (const declarationSourceFile of declarationSourceFiles) {
    for (const referencingSourceFile of declarationSourceFile.getReferencingSourceFiles()) {
      const filePath = referencingSourceFile.getFilePath()
      if (
        referencingSourceFile.isInNodeModules() ||
        seenFilePaths.has(filePath)
      ) {
        continue
      }
      seenFilePaths.add(filePath)

      const match = matchImportInSourceFile(
        referencingSourceFile,
        symbol,
        declarationFilePaths
      )
      if (match) {
        return match
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
      const moduleFromLeftIdentifier = getModuleFromSymbol(leftSide.getSymbol())
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

/** Returns the origin union types of a type. */
function getOriginUnionTypes(type: Type): Type[] {
  const compilerType = type.compilerType as any
  const origin = compilerType.origin

  if (!origin || (origin.flags & tsMorph.ts.TypeFlags.Intersection) !== 0) {
    return type.getUnionTypes()
  }

  if ((origin.flags & tsMorph.ts.TypeFlags.Union) === 0) {
    throw new Error(
      '[getOriginUnionTypes] Origin type is not a union: ' + type.getText()
    )
  }

  const compilerFactory = (type as any)._context.compilerFactory

  return origin.types.map((unionType: tsMorph.ts.Type) =>
    compilerFactory.getType(unionType)
  )
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

/** Returns a list of the flag names that are set on the given value. */
function getFlagNames<Flags extends number>(flags: Flags, allFlags: any) {
  const names: string[] = []
  for (const [key, value] of Object.entries(allFlags)) {
    if (typeof value === 'number' && (flags & value) !== 0) {
      names.push(key)
    }
  }
  return names.join(', ')
}
