# T6 Scaffolding & Cleanup — Analysis Report

**Date**: 2026-02-28  
**Status**: READ-ONLY ANALYSIS (Prometheus Planning Phase)  
**Task**: T6 REDO + Cleanup Fixes

---

## Executive Summary

Previous T6 agent FAILED to create root-level configuration files. Current state:
- ❌ Root `package.json` missing
- ❌ Root `tsconfig.json` missing  
- ❌ Root `vitest.config.ts` missing
- ❌ Root `.gitignore` missing
- ❌ `server/package.json` contains Plannotator metadata + bun peerDependency
- ❌ `ui/src/components/Viewer.test.tsx` imports from "bun:test" (breaks vitest)

**Impact**: Cannot run `npm install` or `npx vitest run` from root. 77 tests exist but cannot execute.

---

## Detailed Findings

### 1. Root Configuration Files (All Missing)

#### package.json
- **Location**: `/home/developer/source/plancop/package.json`
- **Status**: ❌ MISSING
- **Required Content**:
  - name: "plancop"
  - version: "0.1.0"
  - type: "module" (ES modules)
  - scripts: test, test:watch, build, dev, lint
  - devDependencies: typescript, vitest, happy-dom, tsx, @types/node
  - NO production dependencies

#### tsconfig.json
- **Location**: `/home/developer/source/plancop/tsconfig.json`
- **Status**: ❌ MISSING
- **Required Content**:
  - target: ES2022
  - module: ESNext
  - moduleResolution: bundler
  - lib: ["ES2022", "DOM", "DOM.Iterable"]
  - jsx: react-jsx
  - strict: true
  - includes: src/**, server/**, test/**, ui/src/**
  - excludes: node_modules, dist, ui

#### vitest.config.ts
- **Location**: `/home/developer/source/plancop/vitest.config.ts`
- **Status**: ❌ MISSING
- **Required Content**:
  - globals: true
  - environment: happy-dom
  - include patterns for all test files
  - exclude: node_modules, dist

#### .gitignore
- **Location**: `/home/developer/source/plancop/.gitignore`
- **Status**: ❌ MISSING
- **Required Content**:
  - node_modules/
  - dist/
  - ui/dist/
  - ui/node_modules/
  - *.tsbuildinfo

---

### 2. server/package.json (Plannotator Leftover)

**Current Content**:
```json
{
  "name": "@plannotator/server",
  "version": "0.9.3",
  "private": true,
  "description": "Shared server implementation for Plannotator plugins",
  "main": "index.ts",
  "types": "index.ts",
  "exports": {
    ".": "./index.ts",
    "./review": "./review.ts",
    "./annotate": "./annotate.ts",
    "./remote": "./remote.ts",
    "./browser": "./browser.ts",
    "./storage": "./storage.ts",
    "./git": "./git.ts",
    "./repo": "./repo.ts"
  },
  "files": ["*.ts"],
  "peerDependencies": {
    "bun": ">=1.0.0"
  }
}
```

**Problems**:
1. Package name is "@plannotator/server" (should be "plancop-server")
2. Version is 0.9.3 (should be 0.1.0)
3. Description references Plannotator (should reference Plancop)
4. Exports field lists Plannotator modules (not used in Plancop)
5. **CRITICAL**: peerDependencies includes bun (Plancop is Node.js only)

**Required Fix**: Replace entire file with clean manifest

---

### 3. ui/src/components/Viewer.test.tsx (Bun Import)

**Current Line 8**:
```typescript
import { describe, test, expect, beforeAll } from "bun:test";
```

**Problem**: 
- "bun:test" is Bun-specific
- vitest cannot resolve this import
- Test file fails to load when running `npx vitest run`

**Required Fix**: Change to:
```typescript
import { describe, test, expect, beforeAll } from "vitest";
```

---

## Test File Inventory

### Existing Test Files (5 total, 77+ tests)

1. **server/__tests__/utils.test.ts**
   - 34 tests
   - Status: ✅ Ready (uses vitest)

2. **server/__tests__/index.test.ts**
   - 6 tests
   - Status: ✅ Ready (uses vitest)

3. **server/__tests__/hook.test.ts**
   - 16 tests
   - Status: ✅ Ready (uses vitest)

4. **server/project.test.ts**
   - 21 tests
   - Status: ✅ Ready (uses vitest)

5. **ui/src/components/Viewer.test.tsx**
   - Status: ❌ BLOCKED (imports from "bun:test")
   - Fix: Change line 8 import

**Total**: 77+ tests (exact count pending Viewer.test.tsx fix)

---

## Implementation Checklist

### Phase 1: Create Root Config Files
- [ ] Create `/home/developer/source/plancop/package.json`
- [ ] Create `/home/developer/source/plancop/tsconfig.json`
- [ ] Create `/home/developer/source/plancop/vitest.config.ts`
- [ ] Create `/home/developer/source/plancop/.gitignore`

### Phase 2: Fix Leftover Issues
- [ ] Replace `/home/developer/source/plancop/server/package.json`
- [ ] Fix `/home/developer/source/plancop/ui/src/components/Viewer.test.tsx` line 8

### Phase 3: Verify
- [ ] Run `npm install` from root → succeeds
- [ ] Run `npx vitest run` → passes 77+ tests
- [ ] Run `npx tsc --noEmit` → completes
- [ ] Write evidence to `.sisyphus/evidence/task-6-scaffolding.txt`

---

## Constraints & Guardrails

### DO NOT
- ❌ Modify `ui/package.json` (already correct from T9)
- ❌ Modify any source code except Viewer.test.tsx line 8
- ❌ Install UI dependencies in root (stay in ui/)
- ❌ Modify server/ source files (only package.json)
- ❌ Overwrite evidence file (append only)

### DO
- ✅ Create all 4 root config files
- ✅ Replace server/package.json entirely
- ✅ Fix Viewer.test.tsx line 8 import
- ✅ Run full test suite
- ✅ Append evidence to notepad

---

## Success Criteria

All of the following must be true:

1. ✅ Root `package.json` exists and is valid JSON
2. ✅ Root `tsconfig.json` exists and is valid JSON
3. ✅ Root `vitest.config.ts` exists and is valid TypeScript
4. ✅ Root `.gitignore` exists with required entries
5. ✅ `server/package.json` has name "plancop-server" (no bun peerDependency)
6. ✅ `ui/src/components/Viewer.test.tsx` line 8 imports from "vitest"
7. ✅ `npm install` from root succeeds
8. ✅ `npx vitest run` passes 77+ tests (all test files)
9. ✅ `npx tsc --noEmit` completes (may have warnings)
10. ✅ Evidence file created at `.sisyphus/evidence/task-6-scaffolding.txt`

---

## Notes for Implementation Agent

1. **Order matters**: Create config files before running npm install
2. **Test discovery**: vitest.config.ts must include all test patterns
3. **Happy-dom**: Required for DOM tests in Viewer.test.tsx
4. **Evidence**: Capture full test output (test count, pass/fail, timing)
5. **Verification**: Run all three commands (npm install, vitest, tsc) to confirm

