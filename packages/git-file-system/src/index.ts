import { createHash } from 'node:crypto'

import { checkout, clone } from 'isomorphic-git'
import path from 'path'
import fs from 'fs/promises'
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
}

export async function loadContent(props: LoadContentProps) {
  const cloneConfig = createCloneConfig(props)

  console.dir(cloneConfig, { depth: null })
}


// calculates the path to store the remote files locally
// if `cacheDirectory` is specified, we will use this path
// if `cacheDirectory` is not specified, we will use `<project-dir>/.renoun/cache/git-file-system/<hash>` as fallback
function getCacheDirectory(props: LoadContentProps) {
  if (props.cacheDirectory) {
    return props.cacheDirectory
  }
  const hash = createHash('sha256');
  hash.update(`${props.repository}-${props.branch ?? "main"}`)

  return path.join(process.cwd(), '.renoun', 'cache', 'git-file-system', hash.digest("hex"))
}

// Creates the configuration to run the `clone` command
// Doc: https://isomorphic-git.org/docs/en/clone
export function createCloneConfig(props: LoadContentProps) {
  return {
    singleBranch: true,
    depth: 1,
    url: props.repository,
    corsProxy: props.proxy,
    dir: getCacheDirectory(props),
    fs,
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
export function createCheckoutConfig(props: LoadContentProps) {
  return {
    dir: getCacheDirectory(props),
    fs,
    force: true, // always override local changes
  } as Parameters<typeof checkout>[number]
}
