# node-app

SaaS website generator. Users design a site as a **tree of pages**: every node is a page with a freeform prompt; a node's children are pages it links to. Hitting **Generate** compiles the tree into one instruction set, the OpenAI Codex SDK runner inside an E2B sandbox writes a real Next.js app, and the user previews it live in an iframe. Editing any node's prompt and re-generating produces an incremental edit on the same project.

## Stack

- **Runtime:** Bun
- **Server:** Hono + bun:sqlite
- **Frontend:** Vite + React + Tailwind + React Flow (Dagre auto-layout)
- **Sandbox:** E2B with a custom `node-app-bun` template (Bun + Next.js 16 + Tailwind + shadcn + Codex)
- **Agent:** `@openai/codex-sdk`, run inside the E2B sandbox so Codex edits `/home/user`

## Setup

1. Install Bun (https://bun.sh) and the E2B CLI (`bun add -g @e2b/cli`).
2. `cp .env.example .env` and fill in `E2B_API_KEY`.
3. `bun install`
4. Build the sandbox template once: `bun run --cwd e2b build`
5. `bun run dev:server` and `bun run dev:web` in two terminals.

## Layout

```
server/   Hono API + sandbox Codex SDK runner
web/      React tree editor + iframe preview
shared/   Cross-package types
e2b/      Sandbox template definition
```

Full design notes: `/Users/rishabh/.claude/plans/splendid-skipping-fountain.md`.
