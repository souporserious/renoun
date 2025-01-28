import { createHash } from 'node:crypto'

import { MemoryFileSystem } from 'renoun/file-system'

import git, {
  checkout,
  clone,
  listFiles,
  statusMatrix,
  type CallbackFsClient,
  type PromiseFsClient,
} from 'isomorphic-git'
import path from 'path'
import defaultFs from 'fs/promises'
import http from 'isomorphic-git/http/node'

export type LoadContentProps = {
  repository: string
  branch?: string
  credentials?: {
    username: string
    token: string
  }
  cacheDirectory?: string
  proxy?: string
  include?: string[]
}

// TODO: Check if we can use the methods from the `MemoryFileSystem`
//       directly while running the isogit functions ( e.g. `clone` or `checkout` )
function getFilesystemWrapper(memoryFs: MemoryFileSystem) {
  return {
    readFile: () => memoryFs.readFileSync,
    writeFile: memoryFs.createFile,
    mkdir: () => null,
    rmdir: () => null,
    unlink: () => null,
    stat: () => null,
    lstat: () => null,
    readdir: () => memoryFs.readDirectorySync,
    readlink: () => null,
    symlink: () => null,
    
  }
}

export async function loadContent(props: LoadContentProps): Promise<MemoryFileSystem> {
  const memoryFs = new MemoryFileSystem({})
  // const fs = getFilesystemWrapper(memoryFs)
  let cache = {}


  const cacheDirectory = getCacheDirectory(props)
  
  // we can also 
  const cloneConfig = createCloneConfig(props)
  const checkoutConfig = createCheckoutConfig(props)

  // TODO: try to integrate the `MemoryFileSystem` 
  //       together with `getFileSystemWrapper`

  // we're cloning the repo without checkout the code
  await clone({ ...cloneConfig, cache })
  // because we will use the `checkout` function
  // which allows us to filter the files to store
  // so we save only the documents which are required
  await checkout({ ...checkoutConfig, cache })

  const files = await listFiles({fs: defaultFs, dir: cacheDirectory, ref: props.branch, cache})

  // TODO: Maybe we should add an check for file extensions here, 
  //       otherwise we would also load images and other unsupported file types
  for(const filePath of files) {
    const fileContent = await defaultFs.readFile(path.join(cacheDirectory, filePath), 'utf8')
    memoryFs.createFile(filePath, fileContent)
  }

  cache = {}

  return memoryFs
}

// calculates the path to store the remote files locally
// if `cacheDirectory` is specified, we will use this path
// if `cacheDirectory` is not specified, we will use `<project-dir>/.renoun/cache/git-file-system/<hash>` as fallback
// for the `<hash>`, we're using the given repository url and branch ( defaults to `main` )
// with this, we can ensure, that we do not overwrite the content, in case we fetch from the
// same repo, but different branches - maybe there is a better solution, but haven't found it, yet
function getCacheDirectory(props: LoadContentProps) {
  if (props.cacheDirectory) {
    return props.cacheDirectory
  }
  const hash = createHash('sha256')
  hash.update(`${props.repository}-${props.branch ?? 'main'}`)

  return path.join(
    process.cwd(),
    '.renoun',
    'cache',
    'git-file-system',
    hash.digest('hex')
  )
}

// Creates the configuration to run the `clone` command
// Doc: https://isomorphic-git.org/docs/en/clone
export function createCloneConfig(
  props: LoadContentProps,
  fs?: CallbackFsClient | PromiseFsClient
) {
  return {
    singleBranch: true,
    depth: 1,
    url: props.repository,
    corsProxy: props.proxy,
    dir: getCacheDirectory(props),
    noCheckout: true,
    ref: props.branch,
    fs: fs ?? defaultFs,
    http,
    onAuth: props.credentials
      ? () => {
          return {
            username: props.credentials?.username,
            password: props.credentials?.token,
          }
        }
      : undefined,
  } as Parameters<typeof clone>[number]
}

// Creates the configuration to run the `checkout` command
// Doc: https://isomorphic-git.org/docs/en/checkout
export function createCheckoutConfig(
  props: LoadContentProps,
  fs?: CallbackFsClient | PromiseFsClient
) {
  return {
    dir: getCacheDirectory(props),
    fs: fs ?? defaultFs,
    filepaths: props.include,
    ref: props.branch,
    force: true, // always override local changes
  } as Parameters<typeof checkout>[number]
}
