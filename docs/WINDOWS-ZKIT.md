# Windows — zkit generated import paths

## Problem

Running `npm run compile` on Windows fails with:

```
Error: Cannot find module '..helpers'
```

`@solarity/zktype` builds helper import paths with `path.relative()`. On Windows that yields
backslashes (`from "..\helpers"`), which Node treats as an invalid module name.

## Fix

1. `scripts/fix-win-paths.js` — after `zkit make`, rewrite `\` → `/` in generated `.ts` files.
2. `scripts/zkit-require-alias.cjs` — fallback resolver during `zkit verifiers`.
3. `scripts/run-compile.cjs` — cross-platform sequential `compile` (replaces `cmd &` chaining).

## Usage

```bash
npm run compile
```

Individual steps:

```bash
npm run hardhat:compile
npm run zkit:make
npm run zkit:fix-paths
npm run zkit:verifiers
```

No-op on Linux/macOS when paths already use `/`.
