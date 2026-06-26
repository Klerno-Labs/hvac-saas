#!/bin/bash
set -o pipefail

WORKDIR="/home/chris/.openclaw/coding-sandbox/c6abcbe4a91449bc99f1a1e97c33a6f5/app-scaffold/hvac-app"
cd "$WORKDIR"

echo "=== COMMAND 1: npx vitest run tests/pricebook-import.test.ts ==="
npx vitest run tests/pricebook-import.test.ts 2>&1
echo "VITEST_EXIT_CODE=$?"

echo ""
echo "=== COMMAND 2: npx tsc --noEmit ==="
npx tsc --noEmit 2>&1
echo "TSC_EXIT_CODE=$?"

echo ""
echo "=== COMMAND 3: npm run build ==="
npm run build 2>&1
echo "BUILD_EXIT_CODE=$?"
