import { Repository } from '@napi-rs/simple-git'

let repository: ReturnType<typeof Repository.discover>

/** Returns a local git repository if found. */
export function getRepository() {
  if (repository) {
    return repository
  }

  try {
    repository = Repository.discover(process.cwd())
    return repository
  } catch (error) {
    if (error instanceof Error) {
      console.warn(`[mdxts] Could not find a git repository: ${error.message}`)
    }
  }
}
