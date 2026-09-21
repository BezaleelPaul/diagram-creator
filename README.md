# Diagram Creator — Code to UML (accurate, no guessing)

Static site. Paste code / fetch a public GitHub repo → deterministic parsers → Mermaid v10 diagrams.

Combines ideas from GitDiagram (repo map), Mermaid + Copilot (UML types),
Swark (code → Mermaid), Structurizr (component/layered views),
DrawX (HLD/LLD) and repo-cartographer (import graph) — but with a strict rule:

> **Accuracy > completeness. Missing is fine, wrong is not.**

## Diagrams

- **Class** (`classDiagram`): JS/TS, Java, Python classes, extends/implements, fields, methods
- **ER** (`erDiagram`): SQL `CREATE TABLE` + Prisma `model`, FK from real `REFERENCES` (+ `_id` convention flagged as inferred)
- **Sequence** (`sequenceDiagram`): call graph from real function defs; walks from your exact flow text; failure `alt` only if throw/catch/4xx/5xx exists
- **State** (`stateDiagram-v2`): only from explicit `enum State` / status literals + transitions in code
- **Component** (`flowchart TD`): files + resolved relative imports, grouped into routes/models/ui/services/db layers

Unsupported types are **skipped with a reason in Notes**, never hallucinated.

## Run locally

Open `index.html` directly, or:

```bash
npx serve .
```

## Deploy to Vercel

Static, zero build. `vercel.json` included.

```bash
vercel --prod
```

## How to use for coursework

1. Add only relevant files per pass (filenames matter, e.g. `routes/auth.js`).
2. Tick the diagrams you need.
3. For sequence/state, type the exact flow: `POST /register → validation → DB write → response`.
4. Generate → Copy the `## Title` + ````mermaid` block into your submission.
5. Read **Notes** — anything inferred or skipped is listed there.
