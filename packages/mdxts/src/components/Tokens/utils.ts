/** Memoizes a function based on all arguments */
export function memoize<Args extends unknown[], Return>(
  fn: (...args: Args) => Return
): (...args: Args) => Return {
  const cache = new Map()

  return (...args: Args): Return => {
    const id = args[0]
    const resultCached = cache.get(id)

    if (resultCached !== undefined || cache.has(id)) return resultCached

    const result = fn.apply(undefined, args)

    cache.set(id, result)

    return result
  }
}

/** Calls a function once, always returning the original result.  */
export function once<Type>(fn: () => Type): () => Type {
  let called = false
  let result: Type

  return (): Type => {
    if (!called) {
      called = true
      result = fn()
    }

    return result
  }
}
