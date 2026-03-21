#!/usr/bin/env bash
set -euo pipefail

shopt -s nullglob

cache_paths=(
  .next/cache/renoun/fs-cache.sqlite
  .renoun/cache/fs-cache.sqlite
  apps/*/.next/cache/renoun/fs-cache.sqlite
  apps/*/.renoun/cache/fs-cache.sqlite
  examples/*/.next/cache/renoun/fs-cache.sqlite
  examples/*/.renoun/cache/fs-cache.sqlite
)

if ((${#cache_paths[@]} == 0)); then
  exit 0
fi

for db_path in "${cache_paths[@]}"; do
  if [[ ! -f "$db_path" ]]; then
    continue
  fi

  node --experimental-strip-types packages/renoun/src/cli/index.ts cache-maintenance \
    --db-path "$db_path" \
    --checkpoint \
    --checkpoint-mode truncate \
    --no-vacuum
done
