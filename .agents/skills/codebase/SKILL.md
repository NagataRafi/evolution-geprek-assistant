---
name: codebase
description: Map the repository before modifying code across files. Use for cross-file changes, new features touching several modules, or onboarding into unfamiliar code. Covers directory structure, dependencies, and data flow between modules.
---

# Codebase

Map first. Then modify. No blind edits across files.

## Trigger

Use when a change spans two or more files/modules, introduces a new module, or touches request -> handler -> service -> data flow.

## Step 1 - Structure

1. List root and relevant directories (`list_directory`, `glob`).
2. Find entrypoints: `package.json` scripts, server entry, bot entry, route registration.
3. Identify layers actually present: routes/controllers, services/domain, integrations, storage, config, tests. Do not invent layers the project lacks.
4. Note config/env contract (`.env.example`, config module) and build/test commands.

## Step 2 - Dependencies

1. Read `package.json` (or equivalent): runtime deps, dev tooling, module system (ESM/CJS), TS or JS.
2. Check the lockfile exists and which package manager is used. Use that manager only.
3. Trace imports of the modules you will touch: who imports them, what they import.
4. Flag: circular imports, duplicated helpers, unused deps, direct env reads scattered around.

## Step 3 - Data flow

1. Write the path in one line per hop:
   `WhatsApp -> Evolution webhook route -> parser -> conversation service -> order service -> sendText`
2. For each hop record: input shape, output shape, side effects, error behavior, persistence.
3. Locate state ownership: where conversation state, order state, and pause/handover flags live.
4. Find all write points for shared state. Multiple writers = concurrency/ordering risk; state it.

## Step 4 - Impact plan

Before editing, output a short map:

```
Entry:       src/index.ts
Touched:     src/webhook.ts, src/services/order.ts
Upstream:    src/index.ts imports webhook
Downstream:  order.ts -> evolution.ts (HTTP)
State:       conversationStore (Map), keyed by remoteJid
Risk:        fromMe loop, duplicate webhook delivery
Check:       npm run typecheck; manual payload test
```

Then modify. Keep changes inside the stated impact set; if scope grows, update the map first.

## Rules

- Read before edit. Never assume a function's contract from its name.
- Reuse existing helpers instead of adding parallel ones.
- Preserve public interfaces unless the task requires changing them; if changed, list every caller updated.
- New module: place it where sibling modules live and wire it through the existing entrypoint.
- Keep the map current at the end of the task; mention it in the final report only if it changed decisions.
