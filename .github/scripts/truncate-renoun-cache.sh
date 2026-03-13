#!/usr/bin/env bash
set -euo pipefail

shopt -s nullglob

cache_paths=(
  .renoun/cache/fs-cache.sqlite
  apps/*/.renoun/cache/fs-cache.sqlite
  examples/*/.renoun/cache/fs-cache.sqlite
)

if ((${#cache_paths[@]} == 0)); then
  exit 0
fi

for db_path in "${cache_paths[@]}"; do
  if [[ ! -f "$db_path" ]]; then
    continue
  fi

  pnpm exec renoun cache-maintenance \
    --db-path "$db_path" \
    --checkpoint \
    --checkpoint-mode truncate \
    --no-vacuum
done
