/// <reference types="react/canary" />

export type DistributiveOmit<
  Type,
  Key extends keyof Type,
> = Type extends unknown ? Omit<Type, Key> : never

export type ExcludeOtherKeys<MemberType, UnionType> = MemberType & {
  [Key in keyof UnionType]?: never
}

export type ExclusiveUnion<
  UnionType,
  AllMembers = UnionType,
> = UnionType extends any ? ExcludeOtherKeys<UnionType, AllMembers> : never
