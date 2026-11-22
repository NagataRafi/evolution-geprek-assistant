---
name: ponytail
description: Code hygiene and modularity discipline. Use when writing or refactoring code, or after a large change that may have left the codebase messy. Keeps functions small, naming consistent, and files tidy.
---

# Ponytail

Tie code back. Clean, modular, consistent. Tidy after big change.

## Before writing

1. Read neighboring files. Match existing naming, layering, error style, formatting.
2. Project convention beats this skill. Deviate only with a stated reason.
3. One function = one job. Extract pure helpers for parsing, validation, formatting, pricing.
4. Keep side effects (I/O, HTTP, DB, clock, random) at the edges; logic in pure functions.
5. Avoid deep nesting: guard clauses over `if` pyramids. Max ~3 levels.
6. Name by intent, not type: `buildOrderSummary`, not `processData2`. Boolean: `isPaused`, `hasSpiceLevel`.
7. No magic values: name constants (`SPICE_LEVEL_MAX`, `DELIVERY_FEE`). No duplicated literals.
8. Never duplicate a rule in two places; centralize domain rules (menu, price, state) in one module.
9. Guard input at boundaries. Fail with clear messages; never swallow errors.

## Naming conventions (default, override by project)

- `camelCase` variables/functions, `PascalCase` types/classes/components, `UPPER_SNAKE_CASE` constants.
- Files: follow project (`kebab-case.ts`, `PascalCase.tsx`, etc.).
- Domain terms in Indonesian are fine (`pesanan`, `levelCabai`); keep one spelling everywhere.

## After a large change (cleanup pass)

Do this before declaring done:

1. Remove dead code, unused imports/vars/exports, commented-out blocks, debug logs.
2. Split files that now mix concerns; group by feature, not by type, when project does.
3. Move shared helpers to their proper module; delete copies.
4. Re-run formatter/linter/typecheck. Fix, do not suppress.
5. Keep diffs reviewable: no drive-by renames or unrelated refactors. Report cleanup separately from behavior change.
6. Update imports and references after moves; run the affected check again.

## Refactor safety

- Behavior must not change unless the request says so.
- Refactor and feature work in separate steps, so failures are attributable.
- If tests exist, run the focused ones before and after.
- Large move: list old path -> new path in the final report.

## Done check

- [ ] Functions small, single-purpose, testable
- [ ] Names consistent with the rest of the repo
- [ ] No dead code, duplicates, stray logs
- [ ] Lint/typecheck pass
- [ ] No unrelated changes in the diff
