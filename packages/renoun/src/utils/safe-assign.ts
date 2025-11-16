const POLLUTING_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

type Assignable = Record<PropertyKey, unknown>

export function safeAssign<Type extends Assignable>(
  target: Type,
  ...sources: unknown[]
): Type {
  for (const source of sources) {
    if (source == null) {
      throw new TypeError('Cannot convert undefined or null to object')
    }

    const object = Object(source) as Assignable

    for (const key of Reflect.ownKeys(object)) {
      if (typeof key === 'string' && POLLUTING_KEYS.has(key)) {
        continue
      }

      if (Object.prototype.propertyIsEnumerable.call(object, key)) {
        ;(target as Assignable)[key] = object[key]
      }
    }
  }

  return target
}
