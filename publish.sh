#!/usr/bin/env bash
set -euo pipefail

echo "── Typecheck ──"
pnpm run typecheck

echo "── Lint ──"
pnpm run check

echo "── Test ──"
pnpm test

echo "── Build ──"
pnpm run build

echo "── Publish ──"
npm publish

echo "✓ Published @9tensor/retouch@$(node -p "require('./package.json').version")"
