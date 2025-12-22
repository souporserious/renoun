import { getTsMorph } from './ts-morph.ts'
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
  TypeNode,
  TypeLiteralNode,
  MappedTypeNode,
  IntersectionTypeNode,
  TupleTypeNode,
  EntityName,
  Expression,
  ExpressionWithTypeArguments,
  SourceFile,
  JSDocTypedefTag,
  JSDocCallbackTag,
  JSDocPropertyTag,
  JSDocEnumTag,
  JSDocParameterTag,
  JSDocReturnTag,
  JSDocThisTag,
  JSDocTemplateTag,
  JSDoc,
  ts,
  IndexedAccessTypeNode,
} from './ts-morph.ts'
import {
  getInitializerValueKey,
  getInitializerValue,
} from './get-initializer-value.ts'
import { getJsDocMetadata } from './get-js-doc-metadata.ts'
import { getSymbolDescription } from './get-symbol-description.ts'
import { getRootDirectory } from './get-root-directory.ts'

const tsMorph = getTsMorph()

/**
 * Internal ts-morph context interface for accessing compiler internals.
 * These are not part of the public API but are needed for low-level operations.
 */
interface TypeWithContext extends Type {
  _context: {
    compilerFactory: {
      getType(compilerType: ts.Type): Type
    }
    typeChecker: ts.TypeChecker
  }
}

export namespace Kind {
  /** Metadata present in all types. */
  export interface Shared {
    /** A stringified representation of the type. */
    text: string

    /** The path to the file where the symbol declaration is located. */
    filePath?: string

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

  export interface TupleElement<
    Type extends TypeExpression = TypeExpression,
  > extends Shared {
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

  export interface TypeLiteral<
    Member extends MemberUnion = MemberUnion,
  > extends Shared {
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

  export interface UnionType<
    Type extends TypeExpression = TypeExpression,
  > extends Shared {
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

  export interface IndexSignature<
    Type extends TypeExpression = TypeExpression,
  > extends Shared {
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
    extends?: TypeReference | Any | Unknown
    implements?: TypeReference[]
  }

  export interface ClassConstructor extends Shared {
    kind: 'ClassConstructor'
    signatures: CallSignature[]
  }

  export interface SharedClassMember extends Shared {
    /** The name of the class member. */
    name?: string

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
    extends SharedDocumentable, SharedCallable {
    kind: 'ConstructSignature'
    parameters: Parameter[]
  }

  export interface CallSignature extends SharedDocumentable, SharedCallable {
    kind: 'CallSignature'
    parameters: Parameter[]
  }

  export interface GetAccessorSignature
    extends SharedDocumentable, SharedCallable {
    kind: 'GetAccessorSignature'

    /** The return type of the getter. */
    returnType: TypeExpression
  }

  export interface SetAccessorSignature
    extends SharedDocumentable, SharedCallable {
    kind: 'SetAccessorSignature'

    /** The parameter type of the setter. */
    parameter: Parameter
  }

  export interface Function extends Shared {
    kind: 'Function'
    /** The name of the function. */
    name?: string
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
    extends SharedDocumentable, SharedCallable {
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

  export interface Interface<
    Member extends MemberUnion = MemberUnion,
  > extends SharedDocumentable {
    kind: 'Interface'

    /** The member types of the interface. */
    members: Member[]

    /** The type parameters that can be provided as arguments to the type alias. */
    typeParameters: TypeParameter[]

    /** Base interfaces that this interface extends. */
    extends?: TypeReference[]
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
  export interface TypeAlias<
    Type extends TypeExpression = TypeExpression,
  > extends SharedDocumentable {
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
  >
    extends Kind.Shared {
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
  | Kind.TupleElement
  | Kind.Class
  | Kind.ClassConstructor
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
  | Kind.GetAccessorSignature
  | Kind.SetAccessorSignature
  | Kind.ComponentSignature
  | Kind.MethodSignature
  | Kind.PropertySignature
  | Kind.IndexSignature
  | Kind.IndexSignatureParameter
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

/** Normalizes a module specifier to a standard format e.g. `@types/react` -> `react`. */
function normalizeModuleSpecifier(moduleSpecifier?: string) {
  if (!moduleSpecifier) {
    return undefined
  }

  const normalized = moduleSpecifier.replace(/\\/g, '/')

  if (!normalized.startsWith('@types/')) {
    return normalized
  }

  const withoutTypes = normalized.slice('@types/'.length)

  // `@types/react` -> `react`
  // `@types/mui__material` -> `@mui/material`
  if (withoutTypes.includes('__')) {
    const [scope, pkg] = withoutTypes.split('__')
    return `@${scope}/${pkg}`
  }

  const [first, ...rest] = withoutTypes.split('/')
  return [first, ...rest].filter(Boolean).join('/')
}

/** Returns the module specifier for a given file path e.g. `packages/renoun/src/utils/resolve-type.ts` -> `renoun`. */
function getModuleSpecifierFromFilePath(filePath?: string) {
  if (!filePath) {
    return undefined
  }

  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/node_modules/')

  if (parts.length < 2) {
    return undefined
  }

  const afterNodeModules = parts.pop()!
  const [first, second] = afterNodeModules.split('/')

  if (!first) {
    return undefined
  }

  if (first.startsWith('@')) {
    return normalizeModuleSpecifier(`${first}/${second ?? ''}`)
  }

  return normalizeModuleSpecifier(first)
}

function shouldIncludeType(
  filter: TypeFilter | undefined,
  symbol: SymbolMetadata,
  importSpecifier?: string,
  ownerName?: string
) {
  const moduleSpecifier =
    normalizeModuleSpecifier(importSpecifier) ||
    normalizeModuleSpecifier(getModuleSpecifierFromFilePath(symbol.filePath))

  // Local project symbols are always kept
  if (!symbol.isInNodeModules) {
    return true
  }

  if (!filter) {
    return true
  }

  const rules = Array.isArray(filter) ? filter : [filter]

  return rules.some((rule) => {
    const ruleModule = normalizeModuleSpecifier(rule.moduleSpecifier)

    // ignore if the rule targets a different module
    if (ruleModule && ruleModule !== moduleSpecifier) {
      return false
    }

    // wildcard for this module
    if (!rule.types?.length) {
      return true
    }

    return rule.types.some((type) => {
      const typeName = type.name
      const typeNameParts = typeName.split('.')
      const baseTypeName = typeNameParts[typeNameParts.length - 1]
      const matchesType =
        typeName === symbol.name ||
        typeName === ownerName ||
        baseTypeName === symbol.name ||
        baseTypeName === ownerName

      if (!matchesType) {
        return false
      }

      if (!type.properties?.length) {
        return true
      }

      return symbol.name ? type.properties.includes(symbol.name) : false
    })
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

/** Tracks object/interface members currently being expanded (prevents infinite recursion). */
const resolvingObjectMembers = new Set<number>()

/** Tracks JSDoc type owners to prevent infinite recursion when resolving type references. */
const jsDocTypeOwners = new WeakMap<Node, Node>()

/** Tracks aliases currently being expanded to prevent recursive type references. */
const resolvingAliasSymbols = new Set<Symbol>()

/**
 * Converts a Function type to a FunctionType for use in type expressions.
 * This is needed because Kind.Function is not part of Kind.TypeExpression.
 */
function functionToFunctionType(
  func: Kind.Function
): Kind.FunctionType | undefined {
  const signature = func.signatures[0]
  if (!signature) return undefined

  return {
    kind: 'FunctionType',
    text: func.text,
    parameters: signature.parameters,
    typeParameters: signature.typeParameters,
    thisType: signature.thisType,
    returnType: signature.returnType,
    isAsync: signature.isAsync,
    isGenerator: signature.isGenerator,
    filePath: func.filePath,
    position: func.position,
  } satisfies Kind.FunctionType
}

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

function toTypeReference(
  type: Type,
  enclosingNode: TypeReferenceNode,
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
  dependencies?: Set<string>,
  options: { allowLocalInternal?: boolean } = {}
): Kind.TypeReference | undefined {
  const allowLocalInternal = options.allowLocalInternal ?? true
  const symbol = type.getAliasSymbol() || type.getSymbol()
  const visibility = getSymbolVisibility(symbol, enclosingNode)

  if (!allowLocalInternal && visibility === 'local-internal') {
    return undefined
  }

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
  const typeNameSymbol = typeName.getSymbol()
  const referenceDefaults: string[] = []
  const referenceTextFromNode = enclosingNode
    .getText()
    .replace(/'([^']*)'/g, '"$1"')

  if (typeNameSymbol) {
    const typeNameDeclaration = getPrimaryDeclaration(typeNameSymbol)
    const typeParameters = (
      typeNameDeclaration as
        | TypeAliasDeclaration
        | InterfaceDeclaration
        | undefined
    )?.getTypeParameters?.()

    if (
      typeParameters &&
      typeParameters.length > enclosingNode.getTypeArguments().length
    ) {
      for (
        let index = enclosingNode.getTypeArguments().length;
        index < typeParameters.length;
        ++index
      ) {
        const defaultNode = typeParameters[index].getDefault()
        if (defaultNode) {
          referenceDefaults.push(defaultNode.getText())
        }
      }
    }
  }

  const shouldUseReferenceTextFromNode =
    tsMorph.Node.isTypeReference(enclosingNode) &&
    (type.isAny() ||
      type.isUnknown() ||
      isJsDocTypeReferenceNode(enclosingNode))
  const symbolDeclaration =
    enclosingNode ?? getPrimaryDeclaration(type.getSymbol())

  if (
    referenceDefaults.length &&
    (shouldUseReferenceTextFromNode || !symbolDeclaration)
  ) {
    referenceName = referenceTextFromNode
  }

  if (symbolDeclaration) {
    locationNode = symbolDeclaration
  }

  let moduleSpecifier = getModuleSpecifierFromImports(enclosingNode, symbol)

  if (!moduleSpecifier && symbol) {
    moduleSpecifier = getModuleFromSymbol(symbol)
  }

  let name = symbol?.getName()
  // Prefer the alias name if defined in the project
  if (symbol?.isAlias()) {
    if (
      name?.startsWith('__') ||
      getSymbolVisibility(symbol, enclosingNode) !== 'node-modules'
    ) {
      name = symbol.getName()
      locationNode = getPrimaryDeclaration(symbol) ?? locationNode
    }
  }

  const textWithReferenceDefaults =
    referenceDefaults.length && symbolDeclaration && (name ?? referenceName)
      ? `${(name ?? referenceName)!}<${referenceDefaults.join(', ')}>`
      : referenceTextFromNode

  return {
    kind: 'TypeReference',
    name: referenceName ?? name,
    text: textWithReferenceDefaults,
    // Use resolvedTypeArguments.length to check if we have resolved type arguments from the node
    // This ensures we capture type arguments even when the Type itself doesn't have them
    typeArguments: resolvedTypeArguments.length
      ? resolvedTypeArguments
      : undefined,
    moduleSpecifier,
    ...(locationNode ? getDeclarationLocation(locationNode) : {}),
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
    const symbolDeclaration = enclosingNode ?? getPrimaryDeclaration(symbol)
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

    let resolvedType: Kind | undefined
    const callSignatures = type.getCallSignatures()

    if (tsMorph.Node.isVariableDeclaration(enclosingNode)) {
      let resolvedFunctionSignatures: Kind.CallSignature[] | undefined

      // Try standard TypeScript resolution
      // This handles granular patching via resolveCallSignatures -> resolveParameter -> getJsDocParameterTag
      if (callSignatures.length > 0) {
        resolvedFunctionSignatures = resolveCallSignatures(
          callSignatures,
          enclosingNode,
          filter,
          dependencies
        )
      }

      // JSDoc fallback: only prefer it when the inferred signatures look low-confidence.
      // This covers proxy/factory patterns where TS infers a generic `() => void`,
      // but the variable has richer JSDoc `@param` / `@returns` describing the types.
      if (
        !resolvedFunctionSignatures?.length ||
        resolvedFunctionSignatures.every((signature) => {
          const kind = signature.returnType?.kind
          return kind === 'Any' || kind === 'Unknown' || kind === 'Void'
        })
      ) {
        const jsDocSignatures = resolveJsDocFunctionSignatures(
          enclosingNode,
          filter,
          defaultValues,
          dependencies
        )

        if (jsDocSignatures && jsDocSignatures.length > 0) {
          if (
            !resolvedFunctionSignatures ||
            resolvedFunctionSignatures.length === 0
          ) {
            resolvedFunctionSignatures = jsDocSignatures
          } else if (
            shouldPreferJsDoc(resolvedFunctionSignatures, jsDocSignatures)
          ) {
            resolvedFunctionSignatures = jsDocSignatures
          }
        }
      }

      // 3. If we found signatures from either source, create a Function/Component
      if (resolvedFunctionSignatures && resolvedFunctionSignatures.length > 0) {
        if (isComponent(symbolMetadata.name, resolvedFunctionSignatures)) {
          resolvedType = {
            kind: 'Component',
            name: symbolMetadata.name,
            text: typeText,
            signatures: resolvedFunctionSignatures.map(
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
            signatures: resolvedFunctionSignatures,
          } satisfies Kind.Function
        }
      }
      const typeNode = enclosingNode.getTypeNode()
      const jsDocTypeNode =
        !typeNode && tsMorph.Node.isVariableDeclaration(enclosingNode)
          ? getJsDocTypeNode(enclosingNode)
          : undefined

      const variableTypeContext = typeNode ?? jsDocTypeNode ?? enclosingNode
      const variableTypeSource = typeNode
        ? typeNode.getType()
        : jsDocTypeNode && (type.isAny() || type.isUnknown())
          ? jsDocTypeNode.getType()
          : type

      const variableTypeResolved = resolveTypeExpression(
        variableTypeSource,
        variableTypeContext,
        filter,
        defaultValues,
        dependencies
      )

      if (!variableTypeResolved) {
        return
      }

      const jsDocEnumTag = getJsDocEnumTag(enclosingNode)
      const initializer = enclosingNode.getInitializer()

      if (jsDocEnumTag && tsMorph.Node.isObjectLiteralExpression(initializer)) {
        const members = initializer.getProperties().flatMap((property) => {
          if (!tsMorph.Node.isPropertyAssignment(property)) {
            return []
          }

          const valueInitializer = property.getInitializer()
          const memberValue = (() => {
            if (!valueInitializer) {
              return undefined
            }

            if (
              tsMorph.Node.isNumericLiteral(valueInitializer) ||
              tsMorph.Node.isStringLiteral(valueInitializer)
            ) {
              return valueInitializer.getLiteralValue()
            }

            if (
              tsMorph.Node.isPrefixUnaryExpression(valueInitializer) &&
              valueInitializer.getOperatorToken() ===
                tsMorph.SyntaxKind.MinusToken
            ) {
              const operand = valueInitializer.getOperand()
              if (tsMorph.Node.isNumericLiteral(operand)) {
                return -operand.getLiteralValue()
              }
            }

            return undefined
          })()

          return [
            {
              kind: 'EnumMember' as const,
              name: property.getName(),
              text: property.getText(),
              value: memberValue,
              ...getDeclarationLocation(property),
            },
          ]
        })

        resolvedType ??= {
          kind: 'Enum',
          name: symbolMetadata.name,
          text: typeText,
          members,
        } satisfies Kind.Enum
      }

      resolvedType ??= {
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
    } else if (tsMorph.Node.isJSDocFunctionType(enclosingNode)) {
      const signature = enclosingNode.getSignature()
      const resolvedSignature = resolveCallSignature(
        signature,
        enclosingNode,
        filter,
        dependencies
      )

      if (resolvedSignature) {
        resolvedType = {
          kind: 'FunctionType',
          text: typeText,
          parameters: resolvedSignature.parameters,
          typeParameters: resolvedSignature.typeParameters,
          returnType: resolvedSignature.returnType,
          thisType: resolvedSignature.thisType,
          isAsync: resolvedSignature.isAsync,
          isGenerator: resolvedSignature.isGenerator,
          ...getDeclarationLocation(enclosingNode),
        } satisfies Kind.FunctionType
      } else {
        // Fallback: manually resolve from the node if signature resolution fails
        const resolvedParameters: Kind.Parameter[] = []
        for (const param of enclosingNode.getParameters()) {
          const resolved = resolveParameter(
            param,
            enclosingNode,
            filter,
            dependencies
          )
          if (resolved) resolvedParameters.push(resolved)
        }

        const returnTypeNode = enclosingNode.getReturnTypeNode()
        const resolvedReturnType = returnTypeNode
          ? resolveTypeExpression(
              returnTypeNode.getType(),
              returnTypeNode,
              filter,
              defaultValues,
              dependencies
            )
          : undefined

        resolvedType = {
          kind: 'FunctionType',
          text: typeText,
          parameters: resolvedParameters,
          returnType: resolvedReturnType,
          ...getDeclarationLocation(enclosingNode),
        } satisfies Kind.FunctionType
      }
    } else if (tsMorph.Node.isJSDocTypedefTag(symbolDeclaration)) {
      resolvedType = resolveJSDocTypedef(
        symbolDeclaration as JSDocTypedefTag,
        enclosingNode,
        filter,
        dependencies
      )
    } else if (tsMorph.Node.isJSDocCallbackTag(symbolDeclaration)) {
      resolvedType = resolveJSDocCallback(
        symbolDeclaration as JSDocCallbackTag,
        enclosingNode,
        filter,
        dependencies
      )
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
        text:
          symbolMetadata.name +
          (resolvedTypeParameters.length
            ? `<${resolvedTypeParameters.map((parameter) => parameter.name).join(', ')}>`
            : ''),
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
        text:
          symbolMetadata.name +
          (resolvedTypeParameters.length
            ? `<${resolvedTypeParameters.map((parameter) => parameter.name).join(', ')}>`
            : ''),
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

      const extendsClauses = enclosingNode.getExtends()
      const hasExtends = extendsClauses.length > 0

      // Start with explicitly declared members on this interface
      const members: Kind.MemberUnion[] = resolveMemberSignatures(
        enclosingNode.getMembers(),
        filter,
        defaultValues,
        dependencies
      )

      // Only merge inherited members when the interface explicitly extends something
      if (hasExtends && type.isObject()) {
        const existingPropertyNames = new Set(
          members
            .filter(
              (member): member is Kind.PropertySignature =>
                member.kind ===
                ('PropertySignature' as Kind.PropertySignature['kind'])
            )
            .map((member) => member.name)
            .filter((name): name is string => Boolean(name))
        )

        const inheritedProperties = resolvePropertySignatures(
          type,
          enclosingNode,
          filter,
          defaultValues,
          dependencies
        )

        for (const property of inheritedProperties) {
          const name = property.name
          if (!name || existingPropertyNames.has(name)) {
            continue
          }
          existingPropertyNames.add(name)
          members.push(property)
        }

        // Merge in index signatures, including those from base interfaces
        const existingIndexTexts = new Set(
          members
            .filter((member) => member.kind === 'IndexSignature')
            .map((member) => member.text)
        )

        const indexSignatures = resolveIndexSignatures(enclosingNode, filter)

        for (const indexSignature of indexSignatures) {
          if (existingIndexTexts.has(indexSignature.text)) {
            continue
          }
          existingIndexTexts.add(indexSignature.text)
          members.push(indexSignature)
        }
      }

      // Resolve extended interfaces into TypeReference metadata when possible,
      // but only when the base is a visible (exported or external) symbol.
      const resolvedExtends: Kind.TypeReference[] = []

      if (extendsClauses.length) {
        for (const extendsClause of extendsClauses) {
          const baseType = extendsClause.getType()
          const baseSymbol = baseType.getAliasSymbol() || baseType.getSymbol()
          const visibility = getSymbolVisibility(baseSymbol, enclosingNode)

          // Skip local-internal bases, since their members are already merged
          // and they are not directly referenceable from the public API surface.
          if (visibility === 'local-internal') {
            continue
          }

          const reference = toShallowReference(
            baseType,
            extendsClause
          ) as Kind.TypeReference
          resolvedExtends.push(reference)
        }
      }

      resolvedType = {
        kind: 'Interface',
        name: symbolMetadata.name,
        text: typeText,
        typeParameters: resolvedTypeParameters,
        members,
        ...(resolvedExtends.length ? { extends: resolvedExtends } : {}),
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

      const extendsClauses = symbolDeclaration.getExtends()
      const hasExtends = extendsClauses.length > 0

      // Start with explicitly declared members on this interface
      const members: Kind.MemberUnion[] = resolveMemberSignatures(
        symbolDeclaration.getMembers(),
        filter,
        defaultValues,
        dependencies
      )

      // Only merge inherited members when the interface explicitly extends something
      if (hasExtends && type.isObject()) {
        const existingPropertyNames = new Set(
          members
            .filter((member) => member.kind === 'PropertySignature')
            .map((member) => member.name)
            .filter((name) => Boolean(name))
        )

        const inheritedProperties = resolvePropertySignatures(
          type,
          symbolDeclaration,
          filter,
          defaultValues,
          dependencies
        )

        for (const property of inheritedProperties) {
          const name = property.name
          if (!name || existingPropertyNames.has(name)) {
            continue
          }
          existingPropertyNames.add(name)
          members.push(property)
        }

        // Merge in index signatures, including those from base interfaces
        const existingIndexTexts = new Set(
          members
            .filter((member) => member.kind === 'IndexSignature')
            .map((member) => member.text)
        )

        const indexSignatures = resolveIndexSignatures(
          symbolDeclaration,
          filter
        )

        for (const indexSignature of indexSignatures) {
          if (existingIndexTexts.has(indexSignature.text)) {
            continue
          }
          existingIndexTexts.add(indexSignature.text)
          members.push(indexSignature)
        }
      }

      // Resolve extended interfaces into TypeReference metadata when possible,
      // but only when the base is a visible (exported or external) symbol.
      const resolvedExtends: Kind.TypeReference[] = []

      if (extendsClauses.length) {
        for (const extendsClause of extendsClauses) {
          const baseType = extendsClause.getType()
          const baseSymbol = baseType.getAliasSymbol() || baseType.getSymbol()
          const visibility = getSymbolVisibility(baseSymbol, symbolDeclaration)

          // Skip local-internal bases, since their members are already merged
          // and they are not directly referenceable from the public API surface.
          if (visibility === 'local-internal') {
            continue
          }

          const reference = toShallowReference(
            baseType,
            extendsClause
          ) as Kind.TypeReference
          resolvedExtends.push(reference)
        }
      }

      resolvedType = {
        kind: 'Interface',
        name: symbolMetadata.name,
        text: typeText,
        typeParameters: resolvedTypeParameters,
        members,
        ...(resolvedExtends.length ? { extends: resolvedExtends } : {}),
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

    // Skip metadata spreading for Function, ClassMethod, and ClassConstructor
    // as metadata should only be on their signatures to avoid duplication
    const shouldSkipMetadata =
      resolvedType?.kind === 'Function' ||
      resolvedType?.kind === 'ClassMethod' ||
      resolvedType?.kind === 'ClassConstructor'

    if (!resolvedType) {
      return undefined
    }

    return {
      ...(metadataDeclaration && !shouldSkipMetadata
        ? getJsDocMetadata(metadataDeclaration)
        : {}),
      ...resolvedType,
      ...(shouldSkipMetadata ? {} : declarationLocation),
    }
  } finally {
    resolvingTypes.delete(type.compilerType.id)
  }
}

/**
 * Returns true if the JSDoc signature provides a richer return type than the TS signature.
 * Heuristic: Concrete Type > Void > Any/Unknown
 */
function shouldPreferJsDoc(
  tsSignatures: Kind.CallSignature[],
  jsDocSignatures: Kind.CallSignature[]
): boolean {
  // If TypeScript has any concrete signature, trust TypeScript.
  // We assume if the user wrote a complex overload with a real return type,
  // they want that to be the documentation.
  const hasGoodTsSignature = tsSignatures.some((signature) => {
    const kind = signature.returnType?.kind
    return (
      kind !== 'Void' &&
      kind !== 'Any' &&
      kind !== 'Unknown' &&
      kind !== 'Undefined'
    )
  })

  if (hasGoodTsSignature) {
    return false
  }

  // If all TypeScript signatures are weak, check if JSDoc offers anything better.
  // If JSDoc has even one concrete return type, we assume it is superior to the "all void" TS set.
  const hasGoodJsDocSignature = jsDocSignatures.some((signature) => {
    const kind = signature.returnType?.kind
    return (
      kind !== 'Void' &&
      kind !== 'Any' &&
      kind !== 'Unknown' &&
      kind !== 'Undefined'
    )
  })

  return hasGoodJsDocSignature
}

/** Returns the first JSDoc @type node for a variable declaration, if present. */
function getJsDocTypeNode(
  declaration: VariableDeclaration
): TypeNode | undefined {
  const candidates: Node[] = []

  const declarationList = declaration.getParent()
  if (tsMorph.Node.isVariableDeclarationList(declarationList)) {
    const statement = declarationList.getParent()
    if (tsMorph.Node.isVariableStatement(statement)) {
      candidates.push(statement)
    }
  }

  candidates.push(declaration)

  for (const candidate of candidates) {
    if (!tsMorph.Node.isJSDocable(candidate)) {
      continue
    }

    for (const jsDoc of candidate.getJsDocs()) {
      for (const tag of jsDoc.getTags()) {
        const isTypeLikeTag =
          tsMorph.Node.isJSDocTypeTag(tag) ||
          tsMorph.Node.isJSDocEnumTag(tag) ||
          tag.getTagName?.() === 'const'

        if (!isTypeLikeTag || !('getTypeExpression' in tag)) {
          continue
        }

        const typeExpression = tag.getTypeExpression?.()
        const typeNode = typeExpression?.getTypeNode()
        if (typeNode) {
          jsDocTypeOwners.set(typeNode, declaration)
          return typeNode
        }
      }
    }
  }
}

function getJsDocEnumTag(
  declaration: VariableDeclaration
): JSDocEnumTag | undefined {
  const declarationList = declaration.getParent()

  if (tsMorph.Node.isVariableDeclarationList(declarationList)) {
    const statement = declarationList.getParent()

    if (tsMorph.Node.isVariableStatement(statement)) {
      for (const jsDoc of statement.getJsDocs()) {
        for (const tag of jsDoc.getTags()) {
          if (tsMorph.Node.isJSDocEnumTag(tag)) {
            return tag
          }
        }
      }
    }
  }

  return undefined
}

function getJsDocOwner(node?: Node): Node | undefined {
  let current: Node | undefined = node

  while (current) {
    const owner = jsDocTypeOwners.get(current)
    if (owner) {
      return owner
    }

    current = current.getParent()
  }

  return undefined
}

function resolveJsDocFunctionSignatures(
  declaration: VariableDeclaration,
  filter?: TypeFilter,
  defaultValues?: Record<string, unknown> | unknown,
  dependencies?: Set<string>
): Kind.CallSignature[] | undefined {
  const candidates: Node[] = []

  const declarationList = declaration.getParent()
  if (tsMorph.Node.isVariableDeclarationList(declarationList)) {
    const statement = declarationList.getParent()
    if (tsMorph.Node.isVariableStatement(statement)) {
      candidates.push(statement)
    }
  }

  candidates.push(declaration)

  let parameterTags: JSDocParameterTag[] = []
  let returnTag: JSDocReturnTag | undefined
  let thisTag: JSDocThisTag | undefined
  let templateTags: JSDocTemplateTag[] = []

  for (const candidate of candidates) {
    if (!tsMorph.Node.isJSDocable(candidate)) {
      continue
    }

    for (const jsDoc of candidate.getJsDocs()) {
      for (const tag of jsDoc.getTags()) {
        if (tsMorph.Node.isJSDocParameterTag(tag)) {
          parameterTags.push(tag)
        }

        if (!returnTag && tsMorph.Node.isJSDocReturnTag(tag)) {
          returnTag = tag
        }

        if (!thisTag && tsMorph.Node.isJSDocThisTag(tag)) {
          thisTag = tag
        }

        if (tsMorph.Node.isJSDocTemplateTag(tag)) {
          templateTags.push(tag)
        }
      }
    }
  }

  if (parameterTags.length === 0 && !returnTag) {
    return undefined
  }

  parameterTags = parameterTags.filter(
    (tag, index) => tag.getName() && parameterTags.indexOf(tag) === index
  )

  const resolvedParameters: Kind.Parameter[] = []

  for (const parameterTag of parameterTags) {
    const typeExpression = parameterTag.getTypeExpression()
    const rawTypeNode = typeExpression?.getTypeNode()
    const unwrappedRestInfo =
      rawTypeNode && tsMorph.Node.isTypeNode(rawTypeNode)
        ? unwrapRestAndOptional(rawTypeNode)
        : undefined
    const typeNode = unwrapJsDocNonNullableType(
      unwrapJsDocNullableType(unwrappedRestInfo?.node ?? rawTypeNode)
    )
    const type = typeNode?.getType()

    if (!type || !typeNode) {
      continue
    }

    const resolvedType = resolveTypeExpression(
      type,
      typeNode,
      filter,
      defaultValues,
      dependencies
    )

    const fallbackType =
      resolvedType?.kind === 'Any'
        ? resolveTypeNodeFallback(typeNode, filter, dependencies)
        : undefined
    const finalResolvedType = resolvedType ?? fallbackType

    if (!finalResolvedType) {
      continue
    }

    const name = parameterTag.getName()
    const isOptional =
      parameterTag.isBracketed() || Boolean(unwrappedRestInfo?.isOptional)
    const isRest = Boolean(unwrappedRestInfo?.isRest)
    const rawDescription = parameterTag.getCommentText()?.trim()
    const description = rawDescription?.replace(/^[-]\s*/, '')
    const text = `${isRest ? '...' : ''}${name}${isOptional ? '?' : ''}: ${finalResolvedType.text}`

    resolvedParameters.push({
      kind: 'Parameter',
      name,
      type: finalResolvedType,
      initializer: undefined,
      isOptional,
      isRest,
      description,
      text,
    } satisfies Kind.Parameter)
  }

  let resolvedReturnType: Kind.TypeExpression | undefined

  if (returnTag) {
    const typeExpression = returnTag.getTypeExpression()
    const typeNode = unwrapJsDocNonNullableType(
      unwrapJsDocNullableType(typeExpression?.getTypeNode())
    )
    const type = typeNode?.getType()

    if (type && typeNode) {
      resolvedReturnType = resolveTypeExpression(
        type,
        typeNode,
        filter,
        defaultValues,
        dependencies
      )

      if (!resolvedReturnType || resolvedReturnType.kind === 'Any') {
        resolvedReturnType =
          resolveTypeNodeFallback(typeNode, filter, dependencies) ??
          resolvedReturnType
      }
    }
  }

  let resolvedThisType: Kind.TypeExpression | undefined

  if (thisTag) {
    const typeExpression = thisTag.getTypeExpression()
    const typeNode = typeExpression?.getTypeNode()
    const type = typeNode?.getType()

    if (type && typeNode) {
      resolvedThisType = resolveTypeExpression(
        type,
        typeNode,
        filter,
        defaultValues,
        dependencies
      )

      if (!resolvedThisType || resolvedThisType.kind === 'Any') {
        resolvedThisType =
          resolveTypeNodeFallback(typeNode, filter, dependencies) ??
          resolvedThisType
      }
    }
  }

  if (!resolvedReturnType) {
    return undefined
  }

  const parametersText = resolvedParameters
    .map((parameter) => parameter.text)
    .join(', ')

  const resolvedTypeParameters =
    templateTags.length === 0
      ? []
      : templateTags.flatMap((tag) =>
          tag.getTypeParameters().map((typeParameter) => {
            const name = typeParameter.getName()
            const comment = tag.getCommentText()
            return {
              kind: 'TypeParameter',
              name,
              text: name,
              description: comment,
              tags: [
                {
                  name: 'template',
                  text: comment?.replace(/^[-\s]+/, ''),
                },
              ],
            } satisfies Kind.TypeParameter
          })
        )

  const signature: Kind.CallSignature = {
    kind: 'CallSignature',
    text: `(${parametersText}) => ${resolvedReturnType.text}`,
    parameters: resolvedParameters,
    thisType: resolvedThisType,
    returnType: resolvedReturnType,
  }

  if (resolvedTypeParameters.length > 0) {
    signature.typeParameters = resolvedTypeParameters
  }

  return [signature]
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
  const typeText = type.getText(enclosingNode, TYPE_FORMAT_FLAGS)

  let resolvedType: Kind.TypeExpression | undefined
  let moduleSpecifier: string | undefined

  if (isTypeReference(type, enclosingNode)) {
    const isJsDocTypeReference = isJsDocTypeReferenceNode(enclosingNode)

    const hasTypeArguments =
      tsMorph.Node.isTypeReference(enclosingNode) &&
      enclosingNode.getTypeArguments().length > 0
    const shouldBypassResolution =
      isJsDocTypeReference &&
      (type.isAny() || type.isUnknown() || hasTypeArguments)
    let resolutionNode =
      getJsDocOwner(enclosingNode) ?? enclosingNode ?? symbolDeclaration
    if (!resolutionNode) {
      resolutionNode = symbolDeclaration ?? enclosingNode
    }
    // JSDoc typedef/callbacks should be fully expanded instead of kept as opaque references,
    // but only when they don't have type arguments. Generic types with arguments should be
    // kept as TypeReferences to preserve their structure.
    if (!hasTypeArguments) {
      if (tsMorph.Node.isJSDocTypedefTag(symbolDeclaration)) {
        resolvedType = resolveJSDocTypedef(
          symbolDeclaration as JSDocTypedefTag,
          resolutionNode,
          filter,
          dependencies
        )
      } else if (tsMorph.Node.isJSDocCallbackTag?.(symbolDeclaration)) {
        const callbackResult = resolveJSDocCallback(
          symbolDeclaration as JSDocCallbackTag,
          resolutionNode,
          filter,
          dependencies
        )
        if (callbackResult) {
          resolvedType = functionToFunctionType(callbackResult)
        }
      }

      if (resolvedType) {
        return resolvedType
      }

      // Fallback: resolve JSDoc typedef/callback by name when symbol lookup fails.
      // Only do this when we're in a JSDoc context to avoid expensive lookups for
      // TypeScript-native types that will never have JSDoc typedefs/callbacks.
      if (!resolvedType && isJsDocTypeReference) {
        // Use a local reference to avoid TypeScript's overly aggressive narrowing
        const nodeForLookup = enclosingNode as Node | undefined
        const typeNameText = (() => {
          if (tsMorph.Node.isTypeReference(nodeForLookup)) {
            return nodeForLookup.getTypeName().getText()
          }
          if (tsMorph.Node.isExpressionWithTypeArguments(nodeForLookup)) {
            return nodeForLookup.getExpression().getText()
          }
          return symbol?.getName?.() ?? type.getSymbol()?.getName?.()
        })()

        const sourceFile = resolutionNode?.getSourceFile?.()
        const fallbackSourceFile =
          sourceFile ||
          symbolDeclaration?.getSourceFile?.() ||
          enclosingNode?.getSourceFile?.()
        const jsDocTagByName =
          typeNameText && fallbackSourceFile
            ? findJsDocTypedefOrCallbackByName(typeNameText, fallbackSourceFile)
            : undefined

        if (jsDocTagByName?.kind === 'typedef') {
          resolvedType = resolveJSDocTypedef(
            jsDocTagByName.tag,
            resolutionNode,
            filter,
            dependencies
          )
        } else if (jsDocTagByName?.kind === 'callback') {
          const callbackResult = resolveJSDocCallback(
            jsDocTagByName.tag,
            resolutionNode,
            filter,
            dependencies
          )
          if (callbackResult) {
            resolvedType = functionToFunctionType(callbackResult)
          }
        }

        if (resolvedType) {
          return resolvedType
        }
      }
    }

    // Preserve type arguments for heritage clauses (ExpressionWithTypeArguments).
    if (
      !resolvedType &&
      tsMorph.Node.isExpressionWithTypeArguments(enclosingNode)
    ) {
      const resolvedTypeArguments: Kind.TypeExpression[] = []
      for (const argNode of enclosingNode.getTypeArguments()) {
        const argType = argNode.getType()
        let resolvedArg = resolveTypeExpression(
          argType,
          argNode,
          filter,
          defaultValues,
          dependencies
        )

        if (!resolvedArg) {
          resolvedArg = toShallowReference(argType, argNode)
        }

        resolvedTypeArguments.push(resolvedArg)
      }

      resolvedType = {
        kind: 'TypeReference',
        name: enclosingNode.getExpression().getText(),
        text: enclosingNode.getText(),
        moduleSpecifier: undefined,
        typeArguments: resolvedTypeArguments,
        ...getDeclarationLocation(enclosingNode),
      } satisfies Kind.TypeReference

      return resolvedType
    }

    let shouldResolveReference = shouldResolveTypeReference(
      type,
      resolutionNode
    )

    // If a filter explicitly targets this external type, inline only the
    // allowed properties without fully resolving the external reference to
    // avoid deep/recursive expansion (e.g. React attribute interfaces).
    const typeSymbolMetadata = getSymbolMetadata(
      aliasSymbol || symbol,
      enclosingNode
    )
    const moduleSpecifierFromReference = tsMorph.Node.isTypeReference(
      enclosingNode
    )
      ? getModuleSpecifierFromTypeReference(enclosingNode)
      : undefined

    let filterTargetsType = false

    if (filter) {
      const moduleSpecifier =
        normalizeModuleSpecifier(moduleSpecifierFromReference) ||
        normalizeModuleSpecifier(
          getModuleSpecifierFromFilePath(typeSymbolMetadata.filePath)
        )
      const rules = Array.isArray(filter) ? filter : [filter]
      filterTargetsType = rules.some((rule) => {
        const ruleModule = normalizeModuleSpecifier(rule.moduleSpecifier)
        if (ruleModule && ruleModule !== moduleSpecifier) {
          return false
        }

        return rule.types?.some((typeRule) => {
          const typeNameParts = typeRule.name.split('.')
          const baseTypeName = typeNameParts[typeNameParts.length - 1]

          return (
            typeRule.name === typeSymbolMetadata.name ||
            baseTypeName === typeSymbolMetadata.name
          )
        })
      })
    }

    if (filterTargetsType && typeSymbolMetadata.isInNodeModules) {
      const rules = (Array.isArray(filter) ? filter : [filter]).filter(
        (rule): rule is FilterDescriptor => Boolean(rule)
      )
      const matchedRules = rules.filter((rule) => {
        const ruleModule = normalizeModuleSpecifier(rule.moduleSpecifier)
        const moduleSpecifier =
          normalizeModuleSpecifier(moduleSpecifierFromReference) ||
          normalizeModuleSpecifier(
            getModuleSpecifierFromFilePath(typeSymbolMetadata.filePath)
          )
        if (ruleModule && ruleModule !== moduleSpecifier) {
          return false
        }
        return rule.types?.some((typeRule) => {
          const typeNameParts = typeRule.name.split('.')
          const baseTypeName = typeNameParts[typeNameParts.length - 1]
          return (
            typeRule.name === typeSymbolMetadata.name ||
            baseTypeName === typeSymbolMetadata.name
          )
        })
      })

      // Union of allowed properties across matched rules (undefined = allow all)
      const props = new Set<string>()
      let hasExplicitProps = false
      for (const rule of matchedRules) {
        for (const typeRule of rule.types ?? []) {
          if (typeRule.properties?.length) {
            hasExplicitProps = true
            typeRule.properties.forEach((prop) => props.add(prop))
          }
        }
      }
      const allowedProperties = hasExplicitProps ? props : undefined

      const members: Kind.PropertySignature[] = []

      for (const property of type.getApparentProperties()) {
        const name = property.getName()
        if (allowedProperties && !allowedProperties.has(name)) {
          continue
        }
        // Don't pass the filter here - we've already applied it at the type level
        // and need to include inherited properties (e.g. onClick from DOMAttributes)
        const resolvedProperty = resolvePropertySignature(
          property,
          symbolDeclaration ?? enclosingNode,
          undefined,
          defaultValues,
          dependencies
        )
        if (resolvedProperty) {
          members.push(resolvedProperty)
        }
      }

      const indexSignatures = resolveIndexSignatures(
        symbolDeclaration,
        undefined
      )

      return {
        kind: 'TypeLiteral',
        text: typeText,
        members: [...members, ...indexSignatures],
      } satisfies Kind.TypeLiteral
    }

    // For local or already-visible references, allow explicit filter to force
    // resolution.
    if (filterTargetsType) {
      shouldResolveReference = true
    }

    // If this is a local internal mapped type alias reference,
    // force resolution so we expand the alias while preserving inner property references.
    if (
      !shouldResolveReference &&
      symbolDeclaration &&
      tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)
    ) {
      const aliasTypeNode = symbolDeclaration.getTypeNode()
      if (aliasTypeNode && tsMorph.Node.isMappedTypeNode(aliasTypeNode)) {
        const visibility = getSymbolVisibility(
          type.getAliasSymbol() || type.getSymbol(),
          enclosingNode
        )
        if (visibility === 'local-internal') {
          shouldResolveReference = true
        }
      }
    }

    let aliasHasPropertyTags = false
    let aliasHasParameterTags = false
    if (tsMorph.Node.isJSDocTypedefTag(symbolDeclaration)) {
      // For typedefs, check if there are @property tags in the same JSDoc block
      const jsDoc = symbolDeclaration.getParent()
      if (tsMorph.Node.isJSDoc(jsDoc)) {
        for (const tag of jsDoc.getTags()) {
          if (tsMorph.Node.isJSDocPropertyTag(tag)) {
            aliasHasPropertyTags = true
            break
          }

          if (tsMorph.Node.isJSDocParameterTag(tag)) {
            aliasHasParameterTags = true
          }
        }
      }

      // Also check children for nested structures
      for (const child of symbolDeclaration.getChildren()) {
        if (
          tsMorph.Node.isJSDocTypeLiteral(child) &&
          child
            .getChildren()
            .some((literalChild) =>
              tsMorph.Node.isJSDocPropertyTag(literalChild)
            )
        ) {
          aliasHasPropertyTags = true
          break
        }
      }
    } else if (tsMorph.Node.isJSDocCallbackTag?.(symbolDeclaration)) {
      // For callbacks, check if there are @param tags in the same JSDoc block
      const jsDoc = symbolDeclaration.getParent()
      if (tsMorph.Node.isJSDoc(jsDoc)) {
        for (const tag of jsDoc.getTags()) {
          if (tsMorph.Node.isJSDocParameterTag(tag)) {
            aliasHasParameterTags = true
            break
          }
        }
      }
    }

    if (
      !shouldResolveReference &&
      isJsDocTypeReference &&
      (aliasHasPropertyTags || aliasHasParameterTags) &&
      !hasTypeArguments
    ) {
      shouldResolveReference = true
    }

    if (!shouldBypassResolution && shouldResolveReference) {
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
        // For transparent utility types (like Simplify), resolve without alias context
        // to get the flattened TypeLiteral instead of keeping the wrapper
        let isTransparent = isTransparentUtilityType(type)

        // Also check via enclosingNode if it's a type reference
        if (!isTransparent && tsMorph.Node.isTypeReference(enclosingNode)) {
          const typeNameSymbol = enclosingNode.getTypeName().getSymbol()
          if (typeNameSymbol) {
            // Need to resolve through import aliases to get the actual type declaration
            let targetSymbol = typeNameSymbol
            if (typeNameSymbol.isAlias()) {
              const aliasedSymbol = typeNameSymbol.getAliasedSymbol()
              if (aliasedSymbol) {
                targetSymbol = aliasedSymbol
              }
            }

            const declaration = getPrimaryDeclaration(targetSymbol)
            // Check for transparent utility types (works for both local and node_modules)
            if (tsMorph.Node.isTypeAliasDeclaration(declaration)) {
              const typeParams = declaration.getTypeParameters()
              if (typeParams.length === 1) {
                const typeNode = declaration.getTypeNode()
                if (
                  typeNode &&
                  hasIdentityMappedTypeNode(typeNode, typeParams)
                ) {
                  isTransparent = true
                }
              }
            }
          }
        }

        if (isTransparent) {
          // For transparent utility types, directly create a TypeLiteral from the
          // apparent type's properties instead of going through normal resolution
          // (which would find the MappedType node from the declaration)
          const apparentType = type.getApparentType()

          // Resolve properties, but keep node_modules types as shallow references
          const apparentProperties = apparentType.getApparentProperties()
          const propertySignatures: Kind.PropertySignature[] = []

          for (const property of apparentProperties) {
            const propertyDeclaration = getPrimaryDeclaration(property)

            // Check if the property declaration itself is from node_modules
            const isPropertyFromNodeModules = propertyDeclaration
              ?.getSourceFile()
              .isInNodeModules()

            if (isPropertyFromNodeModules && propertyDeclaration) {
              // For properties defined in node_modules, create a shallow property signature
              // that doesn't deeply expand the type
              const propertyType =
                property.getTypeAtLocation(propertyDeclaration)
              const isOptional = property.isOptional()
              const typeText = propertyType.getText(
                propertyDeclaration,
                TYPE_FORMAT_FLAGS
              )

              // Get the module specifier for the type if available
              const moduleSpecifier = getModuleSpecifierFromImports(
                enclosingNode,
                propertyType.getAliasSymbol() || propertyType.getSymbol()
              )

              // Create a simple TypeReference for the property type instead of expanding
              const cleanTypeName = typeText.replace(/\s*\|\s*undefined$/, '') // Remove "| undefined" suffix
              const simpleType: Kind.TypeExpression = {
                kind: 'TypeReference',
                name: cleanTypeName,
                text: cleanTypeName,
                typeArguments: [],
                moduleSpecifier,
                ...getDeclarationLocation(propertyDeclaration),
              } as Kind.TypeReference

              propertySignatures.push({
                kind: 'PropertySignature',
                name: property.getName(),
                text: cleanTypeName,
                isOptional,
                isReadonly: false,
                type: simpleType,
                ...getDeclarationLocation(propertyDeclaration),
              } satisfies Kind.PropertySignature)
            } else {
              // Resolve normally for local types
              const resolvedProperty = resolvePropertySignature(
                property,
                enclosingNode,
                filter,
                defaultValues,
                dependencies
              )

              if (resolvedProperty) {
                propertySignatures.push(resolvedProperty)
              }
            }
          }

          resolvedType = {
            kind: 'TypeLiteral',
            text: apparentType.getText(enclosingNode, TYPE_FORMAT_FLAGS),
            members: propertySignatures,
          } satisfies Kind.TypeLiteral
        } else {
          resolvedType = resolveTypeExpression(
            type.getApparentType(),
            symbolDeclaration ?? enclosingNode,
            filter,
            defaultValues,
            dependencies
          )
        }
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
      const typeNameSymbol = typeName.getSymbol()
      const referenceDefaults: string[] = []
      const referenceTextFromNode = enclosingNode
        .getText()
        .replace(/'([^']*)'/g, '"$1"')

      if (typeNameSymbol) {
        const typeNameDeclaration = getPrimaryDeclaration(typeNameSymbol)
        const typeParameters = (
          typeNameDeclaration as
            | TypeAliasDeclaration
            | InterfaceDeclaration
            | undefined
        )?.getTypeParameters?.()

        if (
          typeParameters &&
          typeParameters.length > enclosingNode.getTypeArguments().length
        ) {
          for (
            let index = enclosingNode.getTypeArguments().length;
            index < typeParameters.length;
            ++index
          ) {
            const defaultNode = typeParameters[index].getDefault()
            if (defaultNode) {
              referenceDefaults.push(defaultNode.getText())
            }
          }
        }
      }

      const shouldUseReferenceTextFromNode =
        tsMorph.Node.isTypeReference(enclosingNode) &&
        (type.isAny() || type.isUnknown() || isJsDocTypeReference)

      let referenceText = shouldUseReferenceTextFromNode
        ? referenceTextFromNode
        : typeText

      if (
        shouldUseReferenceTextFromNode &&
        (type.isAny() || type.isUnknown()) &&
        referenceDefaults.length
      ) {
        if (referenceText.includes('<')) {
          const insertIndex = referenceText.lastIndexOf('>')
          const before = referenceText.slice(0, insertIndex)
          const after = referenceText.slice(insertIndex)
          const hasExplicitArgs = enclosingNode.getTypeArguments().length > 0
          referenceText = `${before}${hasExplicitArgs ? ', ' : ''}${referenceDefaults.join(', ')}${after}`
        } else {
          referenceText = `${referenceText}<${referenceDefaults.join(', ')}>`
        }
      }

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
        text: referenceText,
        typeArguments: resolvedTypeArguments,
        moduleSpecifier,
        ...getDeclarationLocation(locationNode),
      } satisfies Kind.TypeReference

      // If we still have a TypeReference in JSDoc context, try to expand JSDoc typedefs/callbacks
      if (isJsDocTypeReference && resolvedType.kind === 'TypeReference') {
        const fallbackSourceFile =
          resolutionNode?.getSourceFile?.() ||
          symbolDeclaration?.getSourceFile?.() ||
          enclosingNode?.getSourceFile?.()
        const jsDocTagByName = referenceName
          ? findJsDocTypedefOrCallbackByName(referenceName, fallbackSourceFile)
          : undefined

        if (jsDocTagByName?.kind === 'typedef') {
          const expandedType = resolveJSDocTypedef(
            jsDocTagByName.tag,
            resolutionNode,
            filter,
            dependencies
          )
          if (expandedType) {
            resolvedType = expandedType
          }
        } else if (jsDocTagByName?.kind === 'callback') {
          const expandedType = resolveJSDocCallback(
            jsDocTagByName.tag,
            resolutionNode,
            filter,
            dependencies
          )
          if (expandedType) {
            resolvedType = functionToFunctionType(expandedType)
          }
        }
      }
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
        text: type.getText(enclosingNode, TYPE_FORMAT_FLAGS),
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
      const compilerFactory = (type as unknown as TypeWithContext)._context
        .compilerFactory
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
      const compilerFactory = (type as unknown as TypeWithContext)._context
        .compilerFactory
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
      let resolvedExtendsType: Kind.TypeExpression | undefined

      if (tsMorph.Node.isTypeReference(extendsNode)) {
        resolvedExtendsType =
          toTypeReference(
            extendsType,
            extendsNode,
            filter,
            defaultValues,
            dependencies,
            { allowLocalInternal: false }
          ) ??
          resolveTypeExpression(
            extendsType,
            extendsNode,
            filter,
            defaultValues,
            dependencies
          )

        if (!resolvedExtendsType) {
          const fallbackReference = toTypeReference(
            extendsType,
            extendsNode,
            filter,
            defaultValues,
            dependencies
          )

          if (fallbackReference) {
            resolvedExtendsType = {
              ...fallbackReference,
              moduleSpecifier:
                fallbackReference.moduleSpecifier ??
                getModuleSpecifierFromTypeReference(extendsNode),
              typeArguments: fallbackReference.typeArguments ?? [],
              ...getDeclarationLocation(extendsNode),
            }
          }
        }
      } else {
        resolvedExtendsType = resolveTypeExpression(
          extendsType,
          extendsNode,
          filter,
          defaultValues,
          dependencies
        )
      }
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
      const typeWithContext = type as unknown as TypeWithContext
      const compilerFactory = typeWithContext._context.compilerFactory
      const typeChecker = typeWithContext._context.typeChecker
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
            let currentNode: Node | undefined
            let currentType: Type

            if (isUnionTypeNode) {
              const typeNode = element as TypeNode
              currentNode = typeNode
              currentType = typeNode.getType()
            } else {
              const unionType = element as Type
              currentType = unionType
              const elementAliasSymbol = unionType.getAliasSymbol()
              const elementSymbol = elementAliasSymbol || unionType.getSymbol()
              const unionDeclaration = getPrimaryDeclaration(elementSymbol)
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
                      enclosingNode ?? currentNode ?? symbolDeclaration,
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
                    text: currentType.getText(
                      enclosingNode ?? currentNode ?? symbolDeclaration,
                      TYPE_FORMAT_FLAGS
                    ),
                    typeArguments: resolvedTypeArguments,
                    ...getDeclarationLocation(declaration),
                  } satisfies Kind.TypeReference)

                  continue
                }
              }
            }

            const resolvedUnionType = resolveTypeExpression(
              currentType,
              isUnionTypeNode ? currentNode : (enclosingNode ?? currentNode),
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
          if (aliasSymbol) {
            resolvingAliasSymbols.delete(aliasSymbol)
          }
        }
      }
    } else if (type.isIntersection()) {
      let intersectionNode: IntersectionTypeNode | undefined

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
    } else if (
      tsMorph.Node.isFunctionTypeNode(enclosingNode) ||
      tsMorph.Node.isJSDocFunctionType(enclosingNode)
    ) {
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
        const returnTypeNode = tsMorph.Node.isSignaturedDeclaration(
          signatureDeclaration
        )
          ? signatureDeclaration.getReturnTypeNode()
          : undefined
        let resolvedReturnType: Kind.TypeExpression | undefined
        let returnType: Type | undefined

        if (returnTypeNode) {
          returnType = returnTypeNode.getType()
          resolvedReturnType = resolveTypeExpression(
            returnType,
            returnTypeNode,
            filter,
            undefined,
            dependencies
          )
        } else {
          returnType = callSignature.getReturnType()
          resolvedReturnType = resolveTypeExpression(
            returnType,
            signatureDeclaration,
            filter,
            undefined,
            dependencies
          )
        }

        if (
          (!resolvedReturnType ||
            resolvedReturnType.kind === 'Any' ||
            resolvedReturnType.kind === 'Unknown') &&
          returnType &&
          (returnType.isAny() || returnType.isUnknown()) &&
          signatureDeclaration &&
          tsMorph.Node.isJSDocable(signatureDeclaration)
        ) {
          const jsDocReturnTag = getJsDocReturnTag(signatureDeclaration)
          const jsDocReturnTypeNode = jsDocReturnTag
            ?.getTypeExpression()
            ?.getTypeNode()

          if (jsDocReturnTypeNode) {
            const resolvedFromJsDoc = resolveTypeExpression(
              jsDocReturnTypeNode.getType(),
              jsDocReturnTypeNode,
              filter,
              undefined,
              dependencies
            )

            if (resolvedFromJsDoc) {
              resolvedReturnType = resolvedFromJsDoc
            }
          }
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
        // If we have an alias symbol and the enclosing node or its type node is a TypeReference,
        // try to resolve as a type reference first to preserve the alias name
        if (aliasSymbol) {
          let typeReferenceNode: TypeReferenceNode | undefined

          if (tsMorph.Node.isTypeReference(enclosingNode)) {
            typeReferenceNode = enclosingNode
          } else if (tsMorph.Node.isPropertySignature(enclosingNode)) {
            const typeNode = enclosingNode.getTypeNode()
            if (tsMorph.Node.isTypeReference(typeNode)) {
              typeReferenceNode = typeNode
            }
          }

          if (typeReferenceNode) {
            const resolvedAsReference = toTypeReference(
              type,
              typeReferenceNode,
              filter,
              defaultValues,
              dependencies
            )
            if (resolvedAsReference) {
              return resolvedAsReference
            }
          }
        }

        let mappedNode: MappedTypeNode | undefined

        if (tsMorph.Node.isMappedTypeNode(enclosingNode)) {
          mappedNode = enclosingNode
        } else if (tsMorph.Node.isMappedTypeNode(symbolDeclaration)) {
          mappedNode = symbolDeclaration
        } else {
          // Check alias symbol's declaration first (for type aliases like Record<string, T>)
          const aliasSymbolDeclaration = aliasSymbol
            ? getPrimaryDeclaration(aliasSymbol)
            : undefined
          if (
            aliasSymbolDeclaration &&
            tsMorph.Node.isTypeAliasDeclaration(aliasSymbolDeclaration)
          ) {
            const typeNode = aliasSymbolDeclaration.getTypeNode()
            if (tsMorph.Node.isMappedTypeNode(typeNode)) {
              mappedNode = typeNode
            }
          } else if (tsMorph.Node.isTypeAliasDeclaration(symbolDeclaration)) {
            const typeNode = symbolDeclaration.getTypeNode()
            if (tsMorph.Node.isMappedTypeNode(typeNode)) {
              mappedNode = typeNode
            }
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
        } else if (aliasSymbol) {
          // Fallback: If we can't find the mapped node but have a type alias,
          // try to resolve it as a type reference (e.g., Record<string, T> utility type)
          const aliasDeclaration = getPrimaryDeclaration(aliasSymbol)
          if (
            aliasDeclaration &&
            tsMorph.Node.isTypeAliasDeclaration(aliasDeclaration)
          ) {
            const aliasTypeNode = aliasDeclaration.getTypeNode()
            // If the alias points to a TypeReference (like Record<string, T>),
            // try to resolve it as a type reference
            if (aliasTypeNode && tsMorph.Node.isTypeReference(aliasTypeNode)) {
              return toTypeReference(
                type,
                aliasTypeNode,
                filter,
                defaultValues,
                dependencies
              )
            }
            // If the alias points to a mapped type node directly, use it
            if (aliasTypeNode && tsMorph.Node.isMappedTypeNode(aliasTypeNode)) {
              mappedNode = aliasTypeNode
              // Retry with the found mapped node
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
          }
        }
      } else if (type.isObject()) {
        let resolvedMembers: Kind.MemberUnion[] = []
        let objectNode: TypeLiteralNode | undefined

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
          // Guard against recursive object types (interfaces / anonymous object wrappers).
          // Use a dedicated "expanding members" set so we don't confuse the root `resolveType()`
          // tracking (which also uses resolvingTypes) with true recursion.
          const objectTypeId = type.compilerType.id
          if (resolvingObjectMembers.has(objectTypeId)) {
            return toShallowReference(type, symbolDeclaration ?? enclosingNode)
          }

          resolvingObjectMembers.add(objectTypeId)
          const wasAlreadyResolvingType = resolvingTypes.has(objectTypeId)
          if (!wasAlreadyResolvingType) {
            resolvingTypes.add(objectTypeId)
          }
          try {
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
          } finally {
            resolvingObjectMembers.delete(objectTypeId)
            if (!wasAlreadyResolvingType) {
              resolvingTypes.delete(objectTypeId)
            }
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

  // Try to preserve alias references for property value types in common mapped cases.
  // When a mapped alias like `{ [K in keyof T]: T[K] }` is fully instantiated, TS often
  // substitutes the property value to its concrete form (e.g. a union), losing the
  // original alias reference. If we can locate the original property's annotated type
  // on the operand type `T`, and it is a TypeReference, prefer that.
  {
    const aliasArgs = type.getAliasTypeArguments()
    const operand = aliasArgs.length > 0 ? aliasArgs[0] : undefined
    if (
      operand &&
      (operand.isObject() || tsMorph.Node.isTypeLiteral(enclosingNode))
    ) {
      const operandProps = operand.getApparentProperties()
      const byName = new Map<string, Symbol>()
      for (const prop of operandProps) {
        const propName = prop.getName()
        byName.set(propName, prop)
        // Heuristic for common "$" prefix stripping remaps
        if (propName.startsWith('$')) {
          byName.set(propName.slice(1), prop)
        }
      }
      for (const member of members) {
        if (
          member.kind !==
          ('PropertySignature' as Kind.PropertySignature['kind'])
        ) {
          continue
        }
        const sourceSymbol =
          byName.get(member.name ?? '') ??
          byName.get(member.name ? `$${member.name}` : '')
        if (!sourceSymbol) {
          continue
        }
        // Prefer a declared PropertySignature to keep alias references
        let originalDecl: PropertySignature | undefined
        const decls = sourceSymbol.getDeclarations?.() ?? []
        for (let i = 0; i < decls.length; i++) {
          const d = decls[i]
          if (tsMorph.Node.isPropertySignature(d)) {
            originalDecl = d
            break
          }
        }
        if (!originalDecl) {
          const primary = getPrimaryDeclaration(sourceSymbol)
          if (tsMorph.Node.isPropertySignature(primary)) {
            originalDecl = primary
          }
        }
        if (!originalDecl) {
          continue
        }
        const originalTypeNode = originalDecl.getTypeNode()
        if (!originalTypeNode) {
          continue
        }
        const originalResolved = resolveTypeExpression(
          originalTypeNode.getType(),
          originalTypeNode,
          filter,
          defaultValues,
          dependencies
        )
        if (!originalResolved || originalResolved.kind !== 'TypeReference') {
          continue
        }
        // Override the member's type with the referenced alias form.
        // Prefer displaying the alias name as text to avoid showing expanded unions.
        const overriddenResolved: Kind.TypeReference = {
          ...originalResolved,
          text: originalResolved.name ?? originalResolved.text,
        }
        member.type = overriddenResolved
        const isOptional = member.isOptional
        member.text = `${member.name}${isOptional ? '?:' : ': '} ${overriddenResolved.text}`
      }
    }
  }

  if (!members.length) {
    return
  }

  const bodyText = members
    .map((member) =>
      member.kind === 'PropertySignature'
        ? `${member.name}${member.isOptional ? '?:' : ': '} ${member.type.text}`
        : (member.text?.replace?.(/\s*;\s*$/, '') ?? '')
    )
    .filter(Boolean)
    .join('; ')

  return {
    kind: 'TypeLiteral',
    text: `{ ${bodyText} }`,
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
        const signatures = previousResolvedMember.signatures
        const resolvedSignatures = resolved.signatures
        const startIndex = signatures.length
        const resolvedLength = resolvedSignatures.length
        signatures.length = startIndex + resolvedLength
        for (
          let signatureIndex = 0;
          signatureIndex < resolvedLength;
          ++signatureIndex
        ) {
          signatures[startIndex + signatureIndex] =
            resolvedSignatures[signatureIndex]
        }
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

    const resolvedPropertySignature = resolvePropertySignature(
      symbol,
      member,
      filter,
      defaultValues,
      dependencies
    )

    if (!resolvedPropertySignature) {
      throw new UnresolvedTypeExpressionError(member.getType(), member)
    }

    return resolvedPropertySignature
  }

  if (tsMorph.Node.isMethodSignature(member)) {
    const resolvedSignature = resolveCallSignature(
      member.getSignature(),
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
    const resolvedCallSignature = resolveCallSignature(
      member.getSignature(),
      member,
      filter,
      dependencies
    )

    if (!resolvedCallSignature) {
      throw new UnresolvedTypeExpressionError(member.getType(), member)
    }

    return {
      ...resolvedCallSignature,
      kind: 'CallSignature',
    } satisfies Kind.CallSignature
  }

  if (tsMorph.Node.isConstructSignatureDeclaration(member)) {
    const resolvedCallSignature = resolveCallSignature(
      member.getSignature(),
      member,
      filter,
      dependencies
    )

    if (!resolvedCallSignature) {
      throw new UnresolvedTypeExpressionError(member.getType(), member)
    }

    return {
      ...resolvedCallSignature,
      kind: 'ConstructSignature',
    } satisfies Kind.ConstructSignature
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
  const jsDocMetadata = getJsDocTemplateMetadata(parameterDeclaration)

  return {
    kind: 'TypeParameter',
    name,
    text: parameterDeclaration.getText(),
    constraintType: resolvedConstraint,
    defaultType: resolvedDefaultType,
    ...(jsDocMetadata ?? {}),
  } satisfies Kind.TypeParameter
}

/**
 * Decides if a call signature is worth resolving when:
 * - Authored inside the project
 * - External and no longer generic
 */
function shouldResolveCallSignature(signature: Signature): boolean {
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
  const jsDocTemplateTags = signatureDeclaration
    ? getJsDocTemplateTags(signatureDeclaration)
    : []
  if (jsDocTemplateTags.length) {
    const jsDocTypeParameters = jsDocTemplateTags.flatMap((tag) =>
      tag.getTypeParameters().map((typeParameter) => {
        const name = typeParameter.getName()
        const comment = tag.getCommentText()
        return {
          kind: 'TypeParameter',
          name,
          text: name,
          description: comment,
          tags: [
            {
              name: 'template',
              text: comment,
            },
          ],
        } satisfies Kind.TypeParameter
      })
    )

    for (const typeParameter of jsDocTypeParameters) {
      if (
        !resolvedTypeParameters.some(
          (existing) => existing.name === typeParameter.name
        )
      ) {
        resolvedTypeParameters.push(typeParameter)
      }
    }
  }
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
  const returnTypeNode = tsMorph.Node.isSignaturedDeclaration(
    signatureDeclaration
  )
    ? signatureDeclaration.getReturnTypeNode()
    : undefined
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

    if (!thisType) {
      const jsDocThisTag = getJsDocThisTag(signatureDeclaration)
      const typeExpression = jsDocThisTag?.getTypeExpression()
      const typeNode = typeExpression?.getTypeNode()
      const type = typeNode?.getType()

      if (type && typeNode) {
        thisType = resolveTypeExpression(
          type,
          typeNode,
          filter,
          undefined,
          dependencies
        )
      }
    }
  }

  const contextualParameters = signature.getParameters()
  const parameterContext =
    enclosingNode ||
    (signatureDeclaration && tsMorph.Node.isNode(signatureDeclaration)
      ? signatureDeclaration
      : undefined)

  for (const parameter of contextualParameters) {
    const resolved = resolveParameter(
      parameter,
      parameterContext,
      filter,
      dependencies
    )

    if (!resolved) {
      continue
    }

    if (parameter.getEscapedName() === 'this') {
      if (!thisType) {
        thisType = resolved.type
      }

      continue
    }

    parameters.push(resolved)
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
  let jsDocParameter: JSDocParameterTag | undefined
  let parameterType: Type | undefined
  const symbol = tsMorph.Node.isNode(parameterDeclarationOrSymbol)
    ? parameterDeclarationOrSymbol.getSymbol()
    : (parameterDeclarationOrSymbol as Symbol)

  if (tsMorph.Node.isNode(parameterDeclarationOrSymbol)) {
    parameterDeclaration = parameterDeclarationOrSymbol
    parameterType = parameterDeclaration.getType()
  } else {
    const symbolDeclaration = getPrimaryDeclaration(
      parameterDeclarationOrSymbol
    )

    if (tsMorph.Node.isParameterDeclaration(symbolDeclaration)) {
      parameterDeclaration = symbolDeclaration
    } else if (tsMorph.Node.isJSDocParameterTag(symbolDeclaration)) {
      jsDocParameter = symbolDeclaration
    }

    if (enclosingNode) {
      parameterType = (
        parameterDeclarationOrSymbol as Symbol
      ).getTypeAtLocation(enclosingNode)
    } else {
      throw new Error(
        `[renoun:resolveParameter]: No enclosing node found when resolving a contextual parameter symbol. If you are seeing this error, please file an issue.`
      )
    }
  }

  if (!parameterDeclaration && !jsDocParameter) {
    if (!parameterType) {
      return
    }

    const resolvedParameterType = resolveTypeExpression(
      parameterType,
      enclosingNode,
      filter,
      undefined,
      dependencies
    )

    if (!resolvedParameterType) {
      return
    }

    const optionalFromSymbol = (() => {
      if (!symbol) {
        return undefined
      }

      try {
        const symbolFlags = symbol.getFlags?.()

        if (typeof symbolFlags === 'number') {
          return (symbolFlags & tsMorph.SymbolFlags.Optional) !== 0
        }
      } catch {
        // Ignore failures when inspecting symbol flags.
      }

      return undefined
    })()
    const isOptional =
      optionalFromSymbol ??
      Boolean(parameterType.isNullable?.() ?? parameterType.isUndefined?.())
    const resolvedType = isOptional
      ? filterUndefinedFromUnion(resolvedParameterType)
      : resolvedParameterType
    const escapedName = symbol?.getEscapedName?.()
    const hasImplicitName = escapedName?.startsWith('__') ?? false
    const name = hasImplicitName
      ? undefined
      : (escapedName ?? symbol?.getName?.())
    const description = (() => {
      if (!symbol) {
        return undefined
      }

      try {
        return getSymbolDescription(symbol)
      } catch {
        return undefined
      }
    })()

    return {
      kind: 'Parameter',
      name,
      type: resolvedType,
      initializer: undefined,
      isOptional,
      isRest: false,
      description,
      text: name
        ? `${name}${isOptional ? '?' : ''}: ${resolvedType.text}`
        : resolvedType.text,
    } satisfies Kind.Parameter
  }

  if (parameterDeclaration) {
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
    let initializer = getInitializerValue(parameterDeclaration)
    const hasInitializer = initializer !== undefined
    const isLocal = parameterDeclaration === enclosingNode
    const isExternal = parameterDeclaration
      ? parameterDeclaration.getSourceFile().isInNodeModules()
      : false
    const jsDocParameterTag = getJsDocParameterTag(parameterDeclaration)
    const jsDocTypeNode = jsDocParameterTag?.getTypeExpression()?.getTypeNode()
    const shouldPreferJsDocType = Boolean(
      jsDocTypeNode &&
      parameterType &&
      (parameterType.isAny() || parameterType.isUnknown())
    )
    let resolvedParameterType: Kind.TypeExpression | undefined

    if (shouldPreferJsDocType) {
      resolvedParameterType = resolveTypeExpression(
        jsDocTypeNode!.getType(),
        jsDocTypeNode!,
        filter,
        initializer,
        dependencies
      )
    }

    if (!resolvedParameterType) {
      // Fall back to TypeScript's view of the parameter when JSDoc doesn't
      // provide a better answer so existing resolution semantics stay intact.
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
    }

    if (resolvedParameterType) {
      let isOptional = parameterDeclaration.hasQuestionToken() || hasInitializer
      let resolvedType = isOptional
        ? filterUndefinedFromUnion(resolvedParameterType)
        : resolvedParameterType
      let isRest = parameterDeclaration.isRestParameter()

      if (jsDocParameterTag) {
        const unwrappedJsDocType = jsDocTypeNode
          ? unwrapRestAndOptional(jsDocTypeNode)
          : undefined

        if (
          !isOptional &&
          (unwrappedJsDocType?.isOptional || jsDocParameterTag.isBracketed())
        ) {
          isOptional = true
          resolvedType = filterUndefinedFromUnion(resolvedParameterType)
        }

        if (!isRest && unwrappedJsDocType?.isRest) {
          isRest = true
        }

        // If bracketed with a default, capture it as the initializer when none exists
        if (initializer === undefined && jsDocParameterTag.isBracketed()) {
          const tagText = jsDocParameterTag.getText()
          const match = tagText.match(/\[([^\]]+)\]/)
          if (match) {
            const inner = match[1]
            const eqIndex = inner.indexOf('=')
            if (eqIndex !== -1) {
              const defaultRaw = inner.slice(eqIndex + 1).trim()
              const parsed = parseJsDocDefaultValue(defaultRaw)
              if (parsed !== undefined) {
                initializer = parsed
              }
            }
          }
        }
      }

      let name: string | undefined = parameterDeclaration.getName()

      if (name.startsWith('__')) {
        name = undefined
      }

      return {
        kind: 'Parameter',
        name,
        type: resolvedType,
        initializer,
        isOptional: isOptional || hasInitializer,
        isRest,
        description: getSymbolDescription(
          parameterDeclaration.getSymbolOrThrow()
        ),
        text: parameterDeclaration.getText(),
        ...getJsDocMetadata(parameterDeclaration),
        ...getDeclarationLocation(parameterDeclaration),
      } satisfies Kind.Parameter
    }

    return
  }

  if (!parameterType || !jsDocParameter) {
    return
  }

  const resolvedParameterType = resolveTypeExpression(
    parameterType,
    enclosingNode ?? jsDocParameter,
    filter,
    undefined,
    dependencies
  )

  if (!resolvedParameterType) {
    return
  }

  const jsDocTypeNode = jsDocParameter.getTypeExpression()?.getTypeNode()
  const unwrappedJsDocType = jsDocTypeNode
    ? unwrapRestAndOptional(jsDocTypeNode)
    : undefined
  const isRest = unwrappedJsDocType?.isRest ?? false
  const isOptional =
    jsDocParameter.isBracketed() || unwrappedJsDocType?.isOptional === true
  const resolvedType = isOptional
    ? filterUndefinedFromUnion(resolvedParameterType)
    : resolvedParameterType
  const name = jsDocParameter.getName()
  const description = jsDocParameter.getCommentText()

  return {
    kind: 'Parameter',
    name,
    type: resolvedType,
    initializer: (() => {
      // Detect default in bracketed form: @param {T} [name=default]
      if (jsDocParameter.isBracketed()) {
        const tagText = jsDocParameter.getText()
        const match = tagText.match(/\[([^\]]+)\]/)
        if (match) {
          const inner = match[1]
          const eqIndex = inner.indexOf('=')
          if (eqIndex !== -1) {
            const defaultRaw = inner.slice(eqIndex + 1).trim()
            return parseJsDocDefaultValue(defaultRaw)
          }
        }
      }
      return undefined
    })(),
    isOptional,
    isRest,
    description:
      description ?? (symbol ? getSymbolDescription(symbol) : undefined),
    text: `${isRest ? '...' : ''}${name}${isOptional ? '?' : ''}: ${resolvedType.text}`,
    ...getJsDocMetadata(jsDocParameter),
    ...getDeclarationLocation(jsDocParameter),
  }
}

/** Parse JSDoc default string value to a JS value. */
function parseJsDocDefaultValue(defaultRaw: string): unknown {
  const raw = defaultRaw.trim()
  // Strip surrounding quotes for strings
  const quoted =
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  const unquoted = quoted ? raw.slice(1, -1) : raw

  // Try JSON for arrays/objects and primitives if quoted properly
  if (/^[\[\{]/.test(raw)) {
    try {
      return JSON.parse(raw)
    } catch {
      // fall through
    }
  }

  if (raw === 'null') return null
  if (raw === 'undefined') return undefined
  if (raw === 'true') return true
  if (raw === 'false') return false

  // Number
  if (!Number.isNaN(Number(unquoted)) && unquoted !== '') {
    return Number(unquoted)
  }

  // String
  return unquoted
}

/** Finds all nodes that might hold JSDoc for a function-like node. */
function getJsDocCandidates(node: Node): Node[] {
  const candidates = [node]

  if (
    tsMorph.Node.isArrowFunction(node) ||
    tsMorph.Node.isFunctionExpression(node)
  ) {
    const parent = node.getParent()
    if (tsMorph.Node.isVariableDeclaration(parent)) {
      candidates.push(parent)
      const varList = parent.getParent()
      if (tsMorph.Node.isVariableDeclarationList(varList)) {
        const statement = varList.getParent()
        if (tsMorph.Node.isVariableStatement(statement)) {
          candidates.push(statement)
        }
      }
    }
  }
  return candidates
}

function getJsDocParameterTag(
  parameterDeclaration: ParameterDeclaration
): JSDocParameterTag | undefined {
  const functionLike = parameterDeclaration.getParent()
  const candidates = getJsDocCandidates(functionLike)
  const parameterName = parameterDeclaration.getName()

  for (const candidate of candidates) {
    if (!tsMorph.Node.isJSDocable(candidate)) continue

    for (const jsDoc of candidate.getJsDocs()) {
      for (const tag of jsDoc.getTags()) {
        if (!tsMorph.Node.isJSDocParameterTag(tag)) continue

        const tagName = tag.getName()
        // Match "paramName" or "paramName.subProp"
        if (
          tagName === parameterName ||
          tagName.split('.')[0] === parameterName
        ) {
          return tag
        }
      }
    }
  }
  return undefined
}

function getJsDocReturnTag(declaration: Node): JSDocReturnTag | undefined {
  const candidates = getJsDocCandidates(declaration)

  for (const candidate of candidates) {
    if (!tsMorph.Node.isJSDocable(candidate)) continue

    for (const jsDoc of candidate.getJsDocs()) {
      for (const tag of jsDoc.getTags()) {
        if (tsMorph.Node.isJSDocReturnTag(tag)) {
          return tag
        }
      }
    }
  }
  return undefined
}

function getJsDocThisTag(declaration: Node): JSDocThisTag | undefined {
  const candidates = getJsDocCandidates(declaration)

  for (const candidate of candidates) {
    if (!tsMorph.Node.isJSDocable(candidate)) continue

    for (const jsDoc of candidate.getJsDocs()) {
      for (const tag of jsDoc.getTags()) {
        if (tsMorph.Node.isJSDocThisTag(tag)) {
          return tag
        }
      }
    }
  }
  return undefined
}

function getJsDocTemplateTags(declaration: Node): JSDocTemplateTag[] {
  const candidates = getJsDocCandidates(declaration)
  const tags: JSDocTemplateTag[] = []

  for (const candidate of candidates) {
    if (!tsMorph.Node.isJSDocable(candidate)) {
      continue
    }

    for (const jsDoc of candidate.getJsDocs()) {
      for (const tag of jsDoc.getTags()) {
        if (tsMorph.Node.isJSDocTemplateTag(tag)) {
          tags.push(tag)
        }
      }
    }
  }

  return tags
}

function getJsDocTemplateMetadata(
  parameterDeclaration: TypeParameterDeclaration
):
  | { description?: string; tags?: { name: string; text?: string }[] }
  | undefined {
  const name = parameterDeclaration.getName()
  const tags: { name: string; text?: string }[] = []
  const seen = new Set<string | undefined>()
  let description: string | undefined

  const parent = parameterDeclaration.getParent()

  if (tsMorph.Node.isJSDocTemplateTag(parent)) {
    const comment = parent.getCommentText()?.trim()
    const cleanedComment = comment?.replace(/^[-\s]+/, '').trim() || undefined

    tags.push({ name: 'template', text: cleanedComment })
    seen.add(cleanedComment)

    if (cleanedComment) {
      description = cleanedComment
    }
  }

  const owner = parameterDeclaration.getFirstAncestor((ancestor) =>
    tsMorph.Node.isJSDocable(ancestor)
  ) as (Node & { getJsDocs?: () => JSDoc[] }) | undefined

  if (!owner?.getJsDocs) {
    return tags.length || description
      ? { description, tags: tags.length ? tags : undefined }
      : undefined
  }

  for (const jsDoc of owner.getJsDocs() ?? []) {
    for (const tag of jsDoc.getTags()) {
      if (!tsMorph.Node.isJSDocTemplateTag(tag)) {
        continue
      }

      const comment = tag.getCommentText()?.trim()
      const cleanedComment = comment?.replace(/^[-\s]+/, '').trim() || undefined

      for (const templateParameter of tag.getTypeParameters()) {
        if (templateParameter.getName() !== name) {
          continue
        }

        const tagText = cleanedComment ?? undefined

        if (!seen.has(tagText)) {
          tags.push({ name: 'template', text: tagText })
          seen.add(tagText)
        }

        if (tagText && !description) {
          description = tagText
        }
      }
    }
  }

  if (!tags.length && !description) {
    return undefined
  }

  return {
    description,
    tags: tags.length ? tags : undefined,
  }
}

function getJsDocHeritageExpressions(classDeclaration: ClassDeclaration): {
  extends?: ExpressionWithTypeArguments
  implements: ExpressionWithTypeArguments[]
} {
  const implementsExpressions: ExpressionWithTypeArguments[] = []
  let extendsExpression: ExpressionWithTypeArguments | undefined

  if (!tsMorph.Node.isJSDocable(classDeclaration)) {
    return { implements: implementsExpressions }
  }

  for (const jsDoc of classDeclaration.getJsDocs()) {
    for (const tag of jsDoc.getTags()) {
      let expressionNode: ExpressionWithTypeArguments | undefined

      if (tsMorph.Node.isJSDocAugmentsTag(tag)) {
        const compilerExpression = (tag.compilerNode as ts.JSDocAugmentsTag)
          .class
        if (compilerExpression) {
          const node = (
            tag as any
          )._context.compilerFactory.getNodeFromCompilerNode(
            compilerExpression,
            classDeclaration.getSourceFile()
          )

          if (tsMorph.Node.isExpressionWithTypeArguments(node)) {
            expressionNode = node
          }
        }
      } else if (tsMorph.Node.isJSDocImplementsTag(tag)) {
        const compilerExpression = (tag.compilerNode as ts.JSDocImplementsTag)
          .class
        if (compilerExpression) {
          const node = (
            tag as any
          )._context.compilerFactory.getNodeFromCompilerNode(
            compilerExpression,
            classDeclaration.getSourceFile()
          )

          if (tsMorph.Node.isExpressionWithTypeArguments(node)) {
            expressionNode = node
          }
        }
      }

      if (!expressionNode) {
        continue
      }

      if (tsMorph.Node.isJSDocAugmentsTag(tag)) {
        extendsExpression = expressionNode
      } else if (tsMorph.Node.isJSDocImplementsTag(tag)) {
        implementsExpressions.push(expressionNode)
      }
    }
  }

  return { extends: extendsExpression, implements: implementsExpressions }
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
  const rootIsInNodeModules =
    enclosingNode?.getSourceFile().isInNodeModules() ?? false
  const propertyIsInNodeModules =
    propertyDeclaration?.getSourceFile().isInNodeModules() ??
    symbolMetadata.isInNodeModules
  const ownerName =
    tsMorph.Node.isPropertySignature(propertyDeclaration) ||
    tsMorph.Node.isPropertyDeclaration(propertyDeclaration)
      ? propertyDeclaration.getParent()?.getSymbol()?.getName()
      : undefined
  const isExternalAttributeType =
    propertyIsInNodeModules &&
    typeof ownerName === 'string' &&
    ownerName.endsWith('Attributes')
  const filterResult = shouldIncludeType(
    filter,
    symbolMetadata,
    undefined,
    ownerName
  )

  // Avoid inlining massive DOM/React attribute interfaces unless explicitly requested.
  if (isExternalAttributeType && !rootIsInNodeModules && !filter) {
    return
  }

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

function unwrapJsDocNullableType(typeNode?: TypeNode) {
  if (typeNode && tsMorph.Node.isJSDocNullableType(typeNode)) {
    return typeNode.getTypeNode()
  }

  return typeNode
}

function unwrapJsDocNonNullableType(typeNode?: TypeNode) {
  if (typeNode && tsMorph.Node.isJSDocNonNullableType(typeNode)) {
    return typeNode.getTypeNode()
  }
  return typeNode
}

/** Unwrap Rest and Optional type nodes. */
function unwrapRestAndOptional(node: TypeNode) {
  let currentNode: TypeNode = node
  let isRest = false
  let isOptional = false

  if (tsMorph.Node.isRestTypeNode(currentNode)) {
    isRest = true
    currentNode = currentNode.getTypeNode()
  }

  if (tsMorph.Node.isJSDocVariadicType(currentNode)) {
    isRest = true
    currentNode = currentNode.getTypeNode()
  }

  if (tsMorph.Node.isOptionalTypeNode(currentNode)) {
    isOptional = true
    currentNode = currentNode.getTypeNode()
  }

  if (tsMorph.Node.isJSDocOptionalType(currentNode)) {
    isOptional = true
    currentNode = currentNode.getTypeNode()
  }

  return { node: currentNode, isRest, isOptional }
}

/** Fallback resolver when TS gives `any` for JSDoc types. */
function resolveTypeNodeFallback(
  typeNode?: TypeNode,
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.TypeExpression | undefined {
  if (!typeNode) return undefined

  // Handle parentheses
  if (tsMorph.Node.isParenthesizedTypeNode(typeNode)) {
    return resolveTypeNodeFallback(typeNode.getTypeNode(), filter, dependencies)
  }

  if (tsMorph.Node.isUnionTypeNode(typeNode)) {
    const parts = typeNode
      .getTypeNodes()
      .map((childTypeNode) =>
        resolveTypeNodeFallback(childTypeNode, filter, dependencies)
      )
      .filter((childTypeNode): childTypeNode is Kind.TypeExpression =>
        Boolean(childTypeNode)
      )
    if (parts.length) {
      return {
        kind: 'UnionType',
        types: parts,
        text: parts.map((type) => type.text).join(' | '),
      } satisfies Kind.UnionType
    }
    return undefined
  }

  if (tsMorph.Node.isLiteralTypeNode(typeNode)) {
    const literal = typeNode.getLiteral()
    if (tsMorph.Node.isStringLiteral(literal)) {
      return {
        kind: 'String',
        text: literal.getText(),
        value: literal.getLiteralText(),
      }
    }
    if (tsMorph.Node.isNumericLiteral(literal)) {
      const value = Number(literal.getText())
      return { kind: 'Number', text: literal.getText(), value }
    }
    if (literal.getKind() === tsMorph.SyntaxKind.TrueKeyword) {
      return { kind: 'Boolean', text: 'true' }
    }
    if (literal.getKind() === tsMorph.SyntaxKind.FalseKeyword) {
      return { kind: 'Boolean', text: 'false' }
    }
  }

  if (tsMorph.Node.isStringKeyword(typeNode)) {
    return { kind: 'String', text: 'string' }
  }
  if (tsMorph.Node.isNumberKeyword(typeNode)) {
    return { kind: 'Number', text: 'number' }
  }
  if (tsMorph.Node.isBooleanKeyword(typeNode)) {
    return { kind: 'Boolean', text: 'boolean' }
  }
  if (
    tsMorph.Node.isAnyKeyword(typeNode) ||
    tsMorph.Node.isJSDocAllType(typeNode)
  ) {
    return { kind: 'Any', text: 'any' }
  }
  if (typeNode.getKind() === tsMorph.SyntaxKind.NullKeyword) {
    return { kind: 'Null', text: 'null' }
  }
  if (tsMorph.Node.isUndefinedKeyword(typeNode)) {
    return { kind: 'Undefined', text: 'undefined' }
  }
  if (tsMorph.Node.isJSDocUnknownType(typeNode)) {
    return { kind: 'Unknown', text: 'unknown' }
  }
  if (tsMorph.Node.isArrayTypeNode(typeNode)) {
    const elementNode = typeNode.getElementTypeNode()
    const elementType =
      resolveTypeNodeFallback(elementNode, filter, dependencies) ??
      resolveTypeExpression(
        elementNode.getType(),
        elementNode,
        filter,
        undefined,
        dependencies
      )
    if (!elementType) {
      return undefined
    }
    return {
      kind: 'TypeReference',
      name: 'Array',
      text: `Array<${elementType.text}>`,
      typeArguments: [elementType],
      ...getDeclarationLocation(typeNode),
    } satisfies Kind.TypeReference
  }

  if (tsMorph.Node.isTypeLiteral(typeNode)) {
    const members: Kind.PropertySignature[] = []
    for (const member of typeNode.getMembers()) {
      if (tsMorph.Node.isPropertySignature(member)) {
        const memberTypeNode = member.getTypeNode()
        let memberType =
          memberTypeNode &&
          resolveTypeNodeFallback(memberTypeNode, filter, dependencies)

        if (!memberType) {
          memberType = resolveTypeExpression(
            member.getType(),
            memberTypeNode ?? member,
            filter,
            undefined,
            dependencies
          )
        }

        if (memberType) {
          members.push({
            kind: 'PropertySignature',
            name: member.getName(),
            text: memberType.text,
            type: memberType,
            isOptional: member.hasQuestionToken?.() ?? false,
            ...getDeclarationLocation(member),
          } satisfies Kind.PropertySignature)
        }
      }
    }

    return {
      kind: 'TypeLiteral',
      text: typeNode.getText(),
      members,
      ...getDeclarationLocation(typeNode),
    } satisfies Kind.TypeLiteral
  }

  if (tsMorph.Node.isTypeReference(typeNode)) {
    return resolveTypeExpression(
      typeNode.getType(),
      typeNode,
      filter,
      undefined,
      dependencies
    )
  }

  return resolveTypeExpression(
    typeNode.getType(),
    typeNode,
    filter,
    undefined,
    dependencies
  )
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
    node?: TypeNode
  }

  const elementMetadataList: TupleElementMetadata[] = []

  // Prefer a nearby TupleTypeNode so we can read labels & tokens
  let tupleNode: TupleTypeNode | undefined
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
    const typeNode = enclosingNode.getTypeNode()
    if (typeNode) {
      if (tsMorph.Node.isTupleTypeNode(typeNode)) {
        tupleNode = typeNode
      }
    }
  }

  if (tupleNode) {
    for (const tupleElementNode of tupleNode.getElements()) {
      const elementMetadata: TupleElementMetadata = {}
      let elementTypeNode: TypeNode

      if (tsMorph.Node.isNamedTupleMember(tupleElementNode)) {
        elementMetadata.name = tupleElementNode.getNameNode().getText()
        // tokens on the member itself (e.g. `x?:`, `...x`, `readonly x`)
        const questionTokenNode = (
          tupleElementNode as any
        ).getQuestionTokenNode?.()
        elementMetadata.isOptional = Boolean(questionTokenNode)
        const dotDotDotToken = tupleElementNode.getDotDotDotToken()
        elementMetadata.isRest = Boolean(dotDotDotToken)

        // Check for readonly modifier via the compiler node's modifiers
        // TypeScript's type definitions don't expose modifiers on NamedTupleMember,
        // but they exist at runtime for readonly tuple members
        const compilerNode = tupleElementNode.compilerNode as any
        const modifiers = compilerNode.modifiers as
          | ts.NodeArray<ts.Modifier>
          | undefined
        const hasReadonlyModifier = modifiers?.some((modifier: ts.Modifier) => {
          return modifier.kind === tsMorph.ts.SyntaxKind.ReadonlyKeyword
        })
        elementMetadata.isReadonly = Boolean(hasReadonlyModifier)

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
        elementTypeNode = tupleElementNode as TypeNode
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

function isReadonlySymbol(symbol: Symbol) {
  for (const declaration of symbol.getDeclarations()) {
    if (
      tsMorph.Node.isPropertySignature(declaration) ||
      tsMorph.Node.isPropertyDeclaration(declaration)
    ) {
      if (declaration.isReadonly()) {
        return true
      }
    }
  }
  return false
}

function isOptionalSymbol(symbol: Symbol) {
  if ((symbol.getFlags() & tsMorph.SymbolFlags.Optional) !== 0) {
    return true
  }

  for (const declaration of symbol.getDeclarations()) {
    if (
      tsMorph.Node.isPropertySignature(declaration) ||
      tsMorph.Node.isPropertyDeclaration(declaration)
    ) {
      if (declaration.hasQuestionToken && declaration.hasQuestionToken()) {
        return true
      }
    }
  }

  return false
}

function isPrivateSymbol(symbol: Symbol) {
  const name = symbol.getName()
  if (name.startsWith('#')) {
    return true
  }

  for (const declaration of symbol.getDeclarations()) {
    if (
      'hasModifier' in declaration &&
      typeof declaration.hasModifier === 'function' &&
      declaration.hasModifier(tsMorph.SyntaxKind.PrivateKeyword)
    ) {
      return true
    }
  }

  return false
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
    constructor: resolveClassConstructor(
      classDeclaration,
      filter,
      dependencies
    ),
    ...getJsDocMetadata(classDeclaration),
    ...getDeclarationLocation(classDeclaration),
  }

  // Resolve explicit members declared in the class body
  for (const member of classDeclaration.getMembers()) {
    // FIX: Filter out Constructors and Static Blocks first.
    // They don't have names/modifiers in the way we check below.
    if (
      tsMorph.Node.isConstructorDeclaration(member) ||
      tsMorph.Node.isClassStaticBlockDeclaration(member)
    ) {
      continue
    }

    // Now TypeScript knows 'member' is a Property, Method, or Accessor
    // so we can safely check for private modifiers.
    if (
      member.hasModifier(tsMorph.SyntaxKind.PrivateKeyword) ||
      member.getNameNode().getKind() === tsMorph.SyntaxKind.PrivateIdentifier ||
      member.getName().startsWith('#')
    ) {
      continue
    }

    if (
      tsMorph.Node.isGetAccessorDeclaration(member) ||
      tsMorph.Node.isSetAccessorDeclaration(member)
    ) {
      const resolved = resolveClassAccessor(member, filter, dependencies)
      if (resolved) {
        ;(classMetadata.accessors ??= []).push(resolved)
      }
    } else if (tsMorph.Node.isMethodDeclaration(member)) {
      const resolved = resolveClassMethod(member, filter, dependencies)
      if (resolved) {
        ;(classMetadata.methods ??= []).push(resolved)
      }
    } else if (tsMorph.Node.isPropertyDeclaration(member)) {
      const resolved = resolveClassProperty(member, filter, dependencies)
      if (resolved) {
        ;(classMetadata.properties ??= []).push(resolved)
      }
    }
  }

  // Resolve members added via declaration merging (e.g. interfaces)
  const existingMethodNames = new Set(classMetadata.methods?.map((m) => m.name))
  const existingPropertyNames = new Set(
    classMetadata.properties?.map((property) => property.name)
  )
  const existingAccessorNames = new Set(
    classMetadata.accessors?.map((accessor) => accessor.name)
  )

  const classType = classDeclaration.getType()
  const classSourceFile = classDeclaration.getSourceFile()

  for (const prop of classType.getProperties()) {
    if (isPrivateSymbol(prop)) continue

    const propName = prop.getName()
    if (
      existingMethodNames.has(propName) ||
      existingPropertyNames.has(propName) ||
      existingAccessorNames.has(propName)
    ) {
      continue
    }

    const declarations = prop.getDeclarations()
    const declaration = declarations[0]

    // Only include if the declaration is in the same file (avoids inherited base members)
    // but wasn't caught by the explicit member scan (e.g. merged interface).
    const hasDeclarationInClassFile = declarations.some((propDeclaration) => {
      return (
        propDeclaration.getSourceFile().getFilePath() ===
        classSourceFile.getFilePath()
      )
    })

    if (!hasDeclarationInClassFile) {
      continue
    }

    // Skip properties that are actually accessors (handled in explicit check usually)
    if (
      declarations.some((propDeclaration) => {
        return (
          tsMorph.Node.isGetAccessorDeclaration(propDeclaration) ||
          tsMorph.Node.isSetAccessorDeclaration(propDeclaration)
        )
      })
    ) {
      continue
    }

    const propType = prop.getTypeAtLocation(classDeclaration)
    const callSignatures = propType.getCallSignatures()

    if (callSignatures.length > 0) {
      const resolvedSignatures = resolveCallSignatures(
        callSignatures,
        declaration ?? classDeclaration,
        filter,
        dependencies
      )

      ;(classMetadata.methods ??= []).push({
        kind: 'ClassMethod',
        name: propName,
        scope:
          declaration && tsMorph.Node.isMethodDeclaration(declaration)
            ? getScope(declaration)
            : undefined,
        visibility:
          declaration && tsMorph.Node.isMethodDeclaration(declaration)
            ? getVisibility(declaration)
            : undefined,
        signatures: resolvedSignatures,
        text: propType.getText(classDeclaration, TYPE_FORMAT_FLAGS),
      })
      existingMethodNames.add(propName)
    } else {
      const resolvedPropertyType = resolveTypeExpression(
        propType,
        declaration ?? classDeclaration,
        filter,
        undefined,
        dependencies
      )

      if (resolvedPropertyType) {
        ;(classMetadata.properties ??= []).push({
          kind: 'ClassProperty',
          name: propName,
          scope:
            declaration && tsMorph.Node.isPropertyDeclaration(declaration)
              ? getScope(declaration)
              : undefined,
          visibility:
            declaration && tsMorph.Node.isPropertyDeclaration(declaration)
              ? getVisibility(declaration)
              : undefined,
          isOptional: isOptionalSymbol(prop),
          isReadonly: isReadonlySymbol(prop),
          initializer: undefined,
          text: propType.getText(classDeclaration, TYPE_FORMAT_FLAGS),
          type: filterUndefinedFromUnion(resolvedPropertyType),
          ...getJsDocMetadata(declaration ?? classDeclaration),
          ...(declaration ? getDeclarationLocation(declaration) : {}),
        })
        existingPropertyNames.add(propName)
      }
    }
  }

  // Resolve extends and implements clauses
  const baseClass = classDeclaration.getExtends()
  if (baseClass) {
    const resolvedBaseClass = resolveTypeExpression(
      baseClass.getType(),
      classDeclaration,
      filter,
      undefined,
      dependencies
    )

    if (
      resolvedBaseClass &&
      (resolvedBaseClass.kind === 'TypeReference' ||
        resolvedBaseClass.kind === 'Any' ||
        resolvedBaseClass.kind === 'Unknown')
    ) {
      classMetadata.extends = resolvedBaseClass
    }
  }

  const resolvedImplementClauses: Kind.TypeReference[] = []
  for (const implementClause of classDeclaration.getImplements()) {
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

  const jsDocHeritage = getJsDocHeritageExpressions(classDeclaration)

  if (jsDocHeritage.extends) {
    const resolvedJsDocExtends = resolveTypeExpression(
      jsDocHeritage.extends.getType(),
      jsDocHeritage.extends,
      filter,
      undefined,
      dependencies
    )

    if (
      resolvedJsDocExtends &&
      resolvedJsDocExtends.kind === 'TypeReference' &&
      (!classMetadata.extends ||
        classMetadata.extends.kind === 'Any' ||
        classMetadata.extends.kind === 'Unknown')
    ) {
      classMetadata.extends = resolvedJsDocExtends
    }
  }

  if (jsDocHeritage.implements.length) {
    for (const jsDocImplements of jsDocHeritage.implements) {
      const resolved = resolveTypeExpression(
        jsDocImplements.getType(),
        jsDocImplements,
        filter,
        undefined,
        dependencies
      ) as Kind.TypeReference | undefined

      if (
        resolved &&
        !resolvedImplementClauses.some(
          (implemented) => implemented.text === resolved.text
        )
      ) {
        resolvedImplementClauses.push(resolved)
      }
    }
  }

  if (resolvedImplementClauses.length) {
    classMetadata.implements = resolvedImplementClauses
  }

  return classMetadata
}

function resolveClassConstructor(
  classDeclaration: ClassDeclaration,
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.ClassConstructor | undefined {
  const constructorDeclarations = classDeclaration.getConstructors()
  const constructorSignatures = classDeclaration
    .getType()
    .getConstructSignatures()

  if (
    constructorDeclarations.length === 0 &&
    constructorSignatures.length === 0
  ) {
    return undefined
  }

  // 1. Identify the implementation (actual code) to use as the "Primary" context.
  // This ensures resolveParameters looks at the right node for defaults.
  const implementationConstructor =
    constructorDeclarations.find((declaration) => !declaration.isOverload()) ??
    constructorDeclarations[0]

  const primaryConstructorDeclaration =
    implementationConstructor ?? constructorDeclarations[0] ?? classDeclaration

  // 2. Gather signatures from AST (Declarations)
  // We prioritize these because they hold the AST nodes with initializers (e.g. `param = 0`)
  const declarationSignatures = implementationConstructor
    ? [
        ...(implementationConstructor.getOverloads?.() ?? []),
        implementationConstructor,
      ].map((d) => d.getSignature())
    : constructorDeclarations.map((d) => d.getSignature())

  // 3. Merge AST signatures with Type signatures.
  // We need both because Type signatures handle 'inherited' constructors
  // or implicit ones, while AST signatures have the rich syntax data.
  const callSignatures: Signature[] = []
  const seenSignatureDeclarations = new Set<string>()

  for (const signature of [
    ...declarationSignatures,
    ...constructorSignatures,
  ]) {
    const declaration = signature.getDeclaration()

    // In some synthetic cases, declaration might be undefined; we keep the signature anyway.
    if (!declaration) {
      callSignatures.push(signature)
      continue
    }

    const declarationPath = declaration.getSourceFile().getFilePath()
    const key = `${declarationPath}:${declaration.getStart()}:${declaration.getEnd()}`

    if (!seenSignatureDeclarations.has(key)) {
      seenSignatureDeclarations.add(key)
      callSignatures.push(signature)
    }
  }

  // Sort signatures by position to ensure deterministic output
  callSignatures.sort((left, right) => {
    const leftDecl = left.getDeclaration()
    const rightDecl = right.getDeclaration()
    return (
      (leftDecl ? leftDecl.getStart() : 0) -
      (rightDecl ? rightDecl.getStart() : 0)
    )
  })

  // 4. Resolve using the primary constructor as context
  const resolvedSignatures = resolveCallSignatures(
    callSignatures,
    primaryConstructorDeclaration,
    filter,
    dependencies
  )

  if (resolvedSignatures.length === 0) {
    return undefined
  }

  return {
    kind: 'ClassConstructor',
    signatures: resolvedSignatures,
    text: tsMorph.Node.isClassDeclaration(primaryConstructorDeclaration)
      ? ''
      : primaryConstructorDeclaration.getText(),
  }
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

  let classDeclaration: Node | undefined
  let typeLikeDeclaration: Node | undefined
  let functionWithBody: Node | undefined
  let firstDeclaration: Node | undefined

  for (let index = 0; index < declarations.length; ++index) {
    const declaration = declarations[index]
    const kind = declaration.getKind()

    if (kind === tsMorph.SyntaxKind.ClassDeclaration) {
      classDeclaration = declaration
      break
    }

    switch (kind) {
      case tsMorph.SyntaxKind.InterfaceDeclaration:
      case tsMorph.SyntaxKind.TypeAliasDeclaration:
      case tsMorph.SyntaxKind.EnumDeclaration:
        if (!typeLikeDeclaration) {
          typeLikeDeclaration = declaration
        }
        break
    }

    switch (kind) {
      case tsMorph.SyntaxKind.FunctionDeclaration:
      case tsMorph.SyntaxKind.MethodDeclaration:
      case tsMorph.SyntaxKind.Constructor:
      case tsMorph.SyntaxKind.GetAccessor:
      case tsMorph.SyntaxKind.SetAccessor:
      case tsMorph.SyntaxKind.FunctionExpression:
      case tsMorph.SyntaxKind.ArrowFunction:
        if ((declaration as any).getBody?.() && !functionWithBody) {
          functionWithBody = declaration
        }
        break
    }

    if (index === 0) {
      firstDeclaration = declaration
    }
  }

  return (
    classDeclaration ??
    typeLikeDeclaration ??
    functionWithBody ??
    firstDeclaration
  )
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
): type is Type & { compilerType: ts.ConditionalType } {
  return (type.compilerType.flags & tsMorph.ts.TypeFlags.Conditional) !== 0
}

/** Returns true if the given type is an indexed access type (e.g. `Type[Key]`). */
function isIndexedAccessType(
  type: Type
): type is Type & { compilerType: ts.IndexedAccessType } {
  return (type.compilerType.flags & tsMorph.ts.TypeFlags.IndexedAccess) !== 0
}

/** Returns true if the given type is a type operator type (e.g. `keyof Type`). */
function isTypeOperatorType(
  type: Type
): type is Type & { compilerType: ts.IndexType } {
  return (type.compilerType.flags & tsMorph.ts.TypeFlags.Index) !== 0
}

/** Returns true if the given type is a Substitution type (e.g. generic placeholder `Type<Foo>`). */
function isSubstitutionType(type: Type): boolean {
  return (type.getFlags() & tsMorph.ts.TypeFlags.Substitution) !== 0
}

/** Determines if a type is a symbol type (ESSymbol or unique symbol). */
function isSymbolType(type: Type) {
  const flags = type.getFlags()
  // Check for ESSymbol (primitive symbol) or ESSymbolLike (unique symbol)
  return (
    (flags & tsMorph.ts.TypeFlags.ESSymbol) !== 0 ||
    (flags & tsMorph.ts.TypeFlags.UniqueESSymbol) !== 0
  )
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
  // Treat an explicit type reference node as a reference when the compiler reports an indeterminate type.
  if (
    tsMorph.Node.isTypeReference(enclosingNode) &&
    (type.isAny() || type.isUnknown())
  ) {
    return true
  }

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
      if (
        type.filePath &&
        /lib\.es.*promise|promise.*lib\.es/.test(type.filePath)
      ) {
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
function isTypeReferenceExported(typeReference: TypeReferenceNode): boolean {
  const declaration = getPrimaryDeclaration(
    typeReference.getTypeName().getSymbolOrThrow()
  )
  return tsMorph.Node.isExportable(declaration)
    ? declaration.isExported()
    : false
}

/** Gets the left most type reference of an indexed access type node. */
function getLeftMostTypeReference(
  node: IndexedAccessTypeNode
): TypeReferenceNode | undefined {
  let current: TypeNode = node.getObjectTypeNode()
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
  seen: Set<number> = new Set()
): boolean {
  if (!type) {
    return false
  }

  if (type.isTypeParameter()) {
    return true
  }

  // avoid infinite recursion for self-referential types
  if (seen.has(type.compilerType.id)) {
    return false
  }
  seen.add(type.compilerType.id)

  // If this is an alias application (e.g. TypeAlias<Types>), check its arguments.
  // If the arguments are concrete, we assume the resulting type is concrete
  // without forcing the compiler to resolve the full alias body, which can
  // trigger infinite recursion for complex cyclic types.
  const aliasArguments = type.getAliasTypeArguments()
  if (aliasArguments.length > 0) {
    for (
      let index = 0, length = aliasArguments.length;
      index < length;
      ++index
    ) {
      if (containsFreeTypeParameter(aliasArguments[index], seen)) {
        return true
      }
    }
    return false
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
  symbol: Symbol | undefined,
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
 * Checks if a mapped type node represents an identity mapping pattern.
 * An identity mapped type has the form: { [K in keyof T]: T[K] }
 *
 * Uses text-based matching for robustness across different ts-morph versions.
 */
function isIdentityMappedTypeNode(
  mappedNode: MappedTypeNode,
  typeParams: TypeParameterDeclaration[]
): boolean {
  const mappedParam = mappedNode.getTypeParameter()
  const mappedParamName = mappedParam.getName()

  // Check if there's a key remapping (as clause) - if so, this is NOT an identity mapping
  // e.g., { [K in keyof T as K extends `$${infer I}` ? I : K]: T[K] }
  const nameTypeNode = mappedNode.getNameTypeNode()
  if (nameTypeNode) {
    return false
  }

  // Get constraint text (e.g., "keyof T")
  const constraint = mappedParam.getConstraint()
  if (!constraint) {
    return false
  }

  const constraintText = constraint.getText().trim()

  // Check if constraint is "keyof T" where T is a type parameter
  // Handle both "keyof T" and "keyof  T" (with extra spaces)
  const keyofMatch = constraintText.match(/^keyof\s+(.+)$/)
  if (!keyofMatch) {
    return false
  }

  const targetParamName = keyofMatch[1].trim()

  // Check that targetParamName matches one of the type parameters
  const matchingParam = typeParams.find((p) => p.getName() === targetParamName)
  if (!matchingParam) {
    return false
  }

  // Check if the value type is T[K] (identity mapping)
  const valueNode = mappedNode.getTypeNode()
  if (!valueNode) {
    return false
  }

  const valueText = valueNode.getText().trim()

  // Check for pattern like "T[Key]" where T is the target param and Key is the mapped param
  // Handle potential whitespace: T[Key], T[ Key ], etc.
  const valueMatch = valueText.match(/^(\w+)\s*\[\s*(\w+)\s*\]$/)
  if (!valueMatch) {
    return false
  }

  const [, objectName, indexName] = valueMatch

  if (objectName !== targetParamName || indexName !== mappedParamName) {
    return false
  }

  return true
}

/**
 * Checks if a type node contains an identity mapped type pattern.
 * Handles intersection types like `{ [K in keyof T]: T[K] } & {}`.
 */
function hasIdentityMappedTypeNode(
  node: TypeNode,
  typeParams: TypeParameterDeclaration[]
): boolean {
  // Handle intersection types - look for identity mapped type in any branch
  if (tsMorph.Node.isIntersectionTypeNode(node)) {
    return node
      .getTypeNodes()
      .some((node) => hasIdentityMappedTypeNode(node, typeParams))
  }

  if (tsMorph.Node.isMappedTypeNode(node)) {
    return isIdentityMappedTypeNode(node, typeParams)
  }

  return false
}

/**
 * Detects "transparent utility types" like Simplify, Expand, Prettify, etc.
 * These are type aliases that have an identity mapped type pattern,
 * meaning they don't change the structure of the type - they just flatten it for display.
 *
 * Pattern: `type Simplify<T> = { [K in keyof T]: T[K] } & {}`
 */
function isTransparentUtilityType(type: Type): boolean {
  // Try to get the alias symbol - this is the primary way to identify the type
  const aliasSymbol = type.getAliasSymbol()

  // Also try the regular symbol as a fallback
  const symbol = aliasSymbol || type.getSymbol()
  if (!symbol) {
    return false
  }

  const declaration = getPrimaryDeclaration(symbol)

  if (!tsMorph.Node.isTypeAliasDeclaration(declaration)) {
    return false
  }

  const typeParams = declaration.getTypeParameters()

  // Transparent utility types typically have exactly one type parameter
  if (typeParams.length !== 1) {
    return false
  }

  const typeNode = declaration.getTypeNode()
  if (!typeNode) {
    return false
  }

  return hasIdentityMappedTypeNode(typeNode, typeParams)
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
  if (type.isAny() || type.isUnknown()) {
    return false
  }

  // Check for transparent utility types via enclosingNode FIRST, before resolvingTypes check
  // This is important because when TypeScript resolves Simplify<T>, the Type object
  // is already the flattened result, so type.getAliasSymbol() returns undefined.
  // We need to check the enclosingNode (the TypeReference) to detect Simplify.
  if (tsMorph.Node.isTypeReference(enclosingNode)) {
    const typeNameSymbol = enclosingNode.getTypeName().getSymbol()
    if (typeNameSymbol) {
      // Need to get the aliased symbol if this is an import
      let targetSymbol = typeNameSymbol
      if (typeNameSymbol.isAlias()) {
        const aliasedSymbol = typeNameSymbol.getAliasedSymbol()
        if (aliasedSymbol) {
          targetSymbol = aliasedSymbol
        }
      }

      const declaration = getPrimaryDeclaration(targetSymbol)

      // Check if this is a transparent utility type (works for both local and node_modules)
      if (tsMorph.Node.isTypeAliasDeclaration(declaration)) {
        const typeParams = declaration.getTypeParameters()
        if (typeParams.length === 1) {
          const typeNode = declaration.getTypeNode()
          if (typeNode && hasIdentityMappedTypeNode(typeNode, typeParams)) {
            return true
          }
        }
      }
    }
  }

  if (resolvingTypes.has(type.compilerType.id)) {
    return false
  }

  // Check for transparent utility types early - these should always be expanded
  // regardless of other conditions like containsFreeTypeParameter
  // Try multiple approaches to detect transparent types
  if (isTransparentUtilityType(type)) {
    return true
  }

  // If the reference appears to contain free type parameters, allow an
  // exception when the alias is fully instantiated with concrete arguments.
  // This lets mapped type aliases (which introduce internal type parameters
  // like key or infer placeholders) still resolve once their external
  // parameters are bound.
  if (containsFreeTypeParameter(type)) {
    const aliasOrSymbol = type.getAliasSymbol() || type.getSymbol()
    const primaryDeclaration = getPrimaryDeclaration(aliasOrSymbol)

    if (tsMorph.Node.isTypeAliasDeclaration(primaryDeclaration)) {
      const expectedParams = primaryDeclaration.getTypeParameters().length
      const aliasArgs = type.getAliasTypeArguments()
      const fullyInstantiated =
        expectedParams > 0 &&
        aliasArgs.length === expectedParams &&
        aliasArgs.every((arg) => !containsFreeTypeParameter(arg))

      if (!fullyInstantiated) {
        return false
      }
      // fall through to continue resolution
    } else {
      return false
    }
  }

  const symbol = type.getAliasSymbol() || type.getSymbol()

  if (!symbol) {
    return false
  }

  const visibility = getSymbolVisibility(symbol, enclosingNode)

  if (visibility === 'local-internal') {
    // Let conditional branches attempt reference emission before falling back
    // to resolution so we base the decision on actual visibility outcomes.
    return !tsMorph.Node.isConditionalTypeNode(enclosingNode)
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
  mappedNode: MappedTypeNode,
  type: Type
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
function getModuleFromSymbol(symbol: Symbol | undefined) {
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

function isJsDocTypeReferenceNode(node?: Node): node is TypeReferenceNode {
  if (!node || !tsMorph.Node.isTypeReference(node)) {
    return false
  }

  let current: Node | undefined = node.getParent()

  while (current) {
    if (tsMorph.Node.isTypeReference(current)) {
      current = current.getParent()
      continue
    }

    if (
      tsMorph.Node.isJSDocTypeExpression(current) ||
      tsMorph.Node.isJSDocTypeTag(current) ||
      tsMorph.Node.isJSDocTypedefTag(current) ||
      tsMorph.Node.isJSDocParameterTag(current) ||
      tsMorph.Node.isJSDocReturnTag(current) ||
      tsMorph.Node.isJSDocTemplateTag(current) ||
      (tsMorph.Node.isJSDocTag(current) &&
        ['const', 'export', 'exports', 'module'].includes(
          current.getTagName?.() ?? ''
        )) ||
      (tsMorph.Node.isJSDocTag(current) &&
        ['prop', 'property'].includes(current.getTagName?.() ?? '')) ||
      tsMorph.Node.isJSDocPropertyTag(current) ||
      tsMorph.Node.isJSDocCallbackTag?.(current) ||
      tsMorph.Node.isJSDocImplementsTag(current) ||
      tsMorph.Node.isJSDocAugmentsTag(current) ||
      tsMorph.Node.isJSDocThisTag(current) ||
      tsMorph.Node.isJSDocEnumTag(current)
    ) {
      return true
    }

    current = current.getParent()
  }

  return false
}

/** Check imports within a single source file to resolve the module specifier. */
function matchImportInSourceFile(
  sourceFile: SourceFile,
  symbol: Symbol,
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
  symbol?: Symbol
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
    let leftSide: EntityName | Expression = typeName.getLeft()
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

  const compilerFactory = (type as TypeWithContext)._context.compilerFactory

  return origin.types.map((unionType: ts.Type) =>
    compilerFactory.getType(unionType)
  )
}

/** Cache for JSDoc typedef/callback lookups per source file. WeakMap ensures
 * automatic cache invalidation when SourceFile objects are replaced (e.g., on file change). */
const jsDocTagCache = new WeakMap<
  SourceFile,
  Map<
    string,
    | { kind: 'typedef'; tag: JSDocTypedefTag }
    | { kind: 'callback'; tag: JSDocCallbackTag }
  >
>()

/** Builds the JSDoc typedef/callback cache for a source file.
 * Uses getStatements() instead of getDescendants() for efficiency since
 * JSDoc typedefs/callbacks are typically on top-level statements. */
function buildJsDocTagCache(
  sourceFile: SourceFile
): Map<
  string,
  | { kind: 'typedef'; tag: JSDocTypedefTag }
  | { kind: 'callback'; tag: JSDocCallbackTag }
> {
  const cache = new Map<
    string,
    | { kind: 'typedef'; tag: JSDocTypedefTag }
    | { kind: 'callback'; tag: JSDocCallbackTag }
  >()

  // Process JSDoc on top-level statements (most common case for typedefs/callbacks)
  for (const statement of sourceFile.getStatements()) {
    if (!tsMorph.Node.isJSDocable(statement)) continue

    for (const jsDoc of statement.getJsDocs()) {
      for (const tag of jsDoc.getTags()) {
        if (tsMorph.Node.isJSDocTypedefTag(tag)) {
          const tagName = tag.getTagName()
          if (tagName) {
            cache.set(tagName, { kind: 'typedef', tag })
          }
        }

        if (tsMorph.Node.isJSDocCallbackTag(tag)) {
          const tagName = tag.getTagName()
          if (tagName) {
            cache.set(tagName, { kind: 'callback', tag })
          }
        }
      }
    }
  }

  return cache
}

function findJsDocTypedefOrCallbackByName(
  name: string,
  sourceFile: SourceFile
):
  | { kind: 'typedef'; tag: JSDocTypedefTag }
  | { kind: 'callback'; tag: JSDocCallbackTag }
  | undefined {
  let fileCache = jsDocTagCache.get(sourceFile)
  if (!fileCache) {
    fileCache = buildJsDocTagCache(sourceFile)
    jsDocTagCache.set(sourceFile, fileCache)
  }

  return fileCache.get(name)
}

function resolveJSDocTypedef(
  typedefTag: JSDocTypedefTag,
  _enclosingNode?: Node,
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.TypeLiteral | undefined {
  const jsDoc = typedefTag.getParent()
  if (!tsMorph.Node.isJSDoc(jsDoc)) {
    return undefined
  }

  const members: Kind.PropertySignature[] = []

  // Helper to process a property tag and add to members
  const processPropertyTag = (tag: JSDocPropertyTag) => {
    const typeExpression = tag.getTypeExpression()
    const rawTypeNode = typeExpression?.getTypeNode()
    const unwrappedRestInfo =
      rawTypeNode && tsMorph.Node.isTypeNode(rawTypeNode)
        ? unwrapRestAndOptional(rawTypeNode)
        : undefined
    const typeNode = unwrapJsDocNonNullableType(
      unwrapJsDocNullableType(unwrappedRestInfo?.node ?? rawTypeNode)
    )
    const type = typeNode?.getType()

    if (type && typeNode) {
      let resolvedType = resolveTypeExpression(
        type,
        typeNode,
        filter,
        undefined,
        dependencies
      )

      // Special handling for JSDoc primitive types that resolve to Any
      if (resolvedType?.kind === 'Any') {
        const typeText = typeNode.getText()
        switch (typeText) {
          case 'number':
            resolvedType = { kind: 'Number', text: 'number' }
            break
          case 'string':
            resolvedType = { kind: 'String', text: 'string' }
            break
          case 'boolean':
            resolvedType = { kind: 'Boolean', text: 'boolean' }
            break
          case 'null':
            resolvedType = { kind: 'Null', text: 'null' }
            break
          case 'undefined':
            resolvedType = { kind: 'Undefined', text: 'undefined' }
            break
          case 'any':
            resolvedType = { kind: 'Any', text: 'any' }
            break
          case 'void':
            resolvedType = { kind: 'Void', text: 'void' }
            break
          case 'never':
            resolvedType = { kind: 'Never', text: 'never' }
            break
          case 'unknown':
            resolvedType = { kind: 'Unknown', text: 'unknown' }
            break
          case 'bigint':
            resolvedType = { kind: 'BigInt', text: 'bigint' }
            break
          case 'symbol':
            resolvedType = { kind: 'Symbol', text: 'symbol' }
            break
        }
      }

      const finalType =
        resolvedType?.kind === 'Any'
          ? (resolveTypeNodeFallback(typeNode, filter, dependencies) ??
            resolvedType)
          : resolvedType

      if (finalType) {
        members.push({
          kind: 'PropertySignature',
          name: tag.getName(),
          text: finalType.text,
          type: finalType,
          isOptional:
            tag.isBracketed() || Boolean(unwrappedRestInfo?.isOptional),
          ...getJsDocMetadata(tag),
          ...getDeclarationLocation(tag),
        })
      }
    }
  }

  // Collect @property/@prop tags from the same JSDoc block
  for (const tag of jsDoc.getTags()) {
    // Handle both @property and @prop aliases
    if (tsMorph.Node.isJSDocPropertyTag(tag)) {
      processPropertyTag(tag)
    }
  }

  // Also check children of the typedef tag for nested structures (JSDocTypeLiteral)
  for (const child of typedefTag.getChildren()) {
    if (tsMorph.Node.isJSDocTypeLiteral(child)) {
      for (const literalChild of child.getChildren()) {
        if (tsMorph.Node.isJSDocPropertyTag(literalChild)) {
          processPropertyTag(literalChild)
        }
      }
    }
  }

  // If no members were found, this is a simple type alias (e.g. @typedef {Float32Array} mat3)
  // and should not be expanded to a TypeLiteral. Return undefined to let the normal
  // type reference resolution handle it.
  if (members.length === 0) {
    return undefined
  }

  return {
    kind: 'TypeLiteral',
    text:
      members.length > 0
        ? `{ ${members.map((member) => `${member.name}${member.isOptional ? '?' : ''}: ${member.text}`).join('; ')} }`
        : '{ }',
    members,
    ...getDeclarationLocation(typedefTag),
  } satisfies Kind.TypeLiteral
}

function resolveJSDocCallback(
  callbackTag: JSDocCallbackTag,
  _enclosingNode?: Node,
  filter?: TypeFilter,
  dependencies?: Set<string>
): Kind.Function | undefined {
  const jsDoc = callbackTag.getParent()
  if (!tsMorph.Node.isJSDoc(jsDoc)) {
    return undefined
  }

  const parameters: Kind.Parameter[] = []
  let returnType: Kind.TypeExpression | undefined

  // Collect @param and @returns tags from the same JSDoc block
  for (const tag of jsDoc.getTags()) {
    if (tsMorph.Node.isJSDocParameterTag(tag)) {
      const typeExpression = tag.getTypeExpression()
      const rawTypeNode = typeExpression?.getTypeNode()
      const unwrappedRestInfo =
        rawTypeNode && tsMorph.Node.isTypeNode(rawTypeNode)
          ? unwrapRestAndOptional(rawTypeNode)
          : undefined
      const typeNode = unwrapJsDocNonNullableType(
        unwrapJsDocNullableType(unwrappedRestInfo?.node ?? rawTypeNode)
      )
      const type = typeNode?.getType()

      if (type && typeNode) {
        let resolvedType = resolveTypeExpression(
          type,
          typeNode,
          filter,
          undefined,
          dependencies
        )

        // Special handling for JSDoc primitive types that resolve to Any
        if (resolvedType?.kind === 'Any') {
          const typeText = typeNode.getText()
          switch (typeText) {
            case 'number':
              resolvedType = { kind: 'Number', text: 'number' }
              break
            case 'string':
              resolvedType = { kind: 'String', text: 'string' }
              break
            case 'boolean':
              resolvedType = { kind: 'Boolean', text: 'boolean' }
              break
            case 'null':
              resolvedType = { kind: 'Null', text: 'null' }
              break
            case 'undefined':
              resolvedType = { kind: 'Undefined', text: 'undefined' }
              break
            case 'any':
              resolvedType = { kind: 'Any', text: 'any' }
              break
            case 'void':
              resolvedType = { kind: 'Void', text: 'void' }
              break
            case 'never':
              resolvedType = { kind: 'Never', text: 'never' }
              break
            case 'unknown':
              resolvedType = { kind: 'Unknown', text: 'unknown' }
              break
            case 'bigint':
              resolvedType = { kind: 'BigInt', text: 'bigint' }
              break
            case 'symbol':
              resolvedType = { kind: 'Symbol', text: 'symbol' }
              break
          }
        }

        const fallbackType =
          resolvedType?.kind === 'Any'
            ? resolveTypeNodeFallback(typeNode, filter, dependencies)
            : undefined
        const finalType = resolvedType ?? fallbackType

        if (finalType) {
          parameters.push({
            kind: 'Parameter',
            name: tag.getName(),
            text: finalType.text,
            type: finalType,
            isOptional:
              tag.isBracketed() || Boolean(unwrappedRestInfo?.isOptional),
            isRest: Boolean(unwrappedRestInfo?.isRest),
            ...getJsDocMetadata(tag),
            ...getDeclarationLocation(tag),
          })
        }
      }
    } else if (tsMorph.Node.isJSDocReturnTag(tag)) {
      const typeExpression = tag.getTypeExpression()
      const typeNode = unwrapJsDocNullableType(typeExpression?.getTypeNode())
      const type = typeNode?.getType()

      if (type && typeNode) {
        returnType = resolveTypeExpression(
          type,
          typeNode,
          filter,
          undefined,
          dependencies
        )

        if (!returnType || returnType.kind === 'Any') {
          returnType =
            resolveTypeNodeFallback(typeNode, filter, dependencies) ??
            returnType
        }
      }
    }
  }

  const returnTypeResolved = returnType ?? { kind: 'Any' as const, text: 'any' }
  const parametersText = parameters
    .map((parameter) => `${parameter.name}: ${parameter.text}`)
    .join(', ')
  const signatureText = `(${parametersText}) => ${returnTypeResolved.text}`

  const signature: Kind.CallSignature = {
    kind: 'CallSignature',
    text: signatureText,
    parameters,
    returnType: returnTypeResolved,
    ...getDeclarationLocation(callbackTag),
  }

  return {
    kind: 'Function',
    name: callbackTag.getTagName(),
    text: `(${parameters.map((parameter) => `${parameter.name}${parameter.isOptional ? '?' : ''}: ${parameter.type.text}`).join(', ')}) => ${returnType ? returnType.text : 'any'}`,
    signatures: [signature],
    ...getDeclarationLocation(callbackTag),
  } satisfies Kind.Function
}

/** Prints helpful information about a node for debugging. */
function printNode(node: Node) {
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
