# Solar Accounting presentations

## Solar Accounting System deck

File: [Solar-Accounting-System.pptx](./Solar-Accounting-System.pptx)

Stakeholder overview of the product through Section 16 (architecture, modules, workflows, security, import, deployment).

## How it works — accountant guide

File: [How-It-Works-User-Guide.pptx](./How-It-Works-User-Guide.pptx)

Accountant-facing guide: what the platform does, how head office and branches work, how the accounting engine posts and locks the books, and how each module updates ledgers, stock, and reports. Written in business language only (no developer or infrastructure detail).

### Regenerate

From the repository root:

```bash
pnpm add -D pptxgenjs -w
node docs/presentations/build-pptx.mjs
node docs/presentations/build-how-it-works-pptx.mjs
```

Or: `pnpm pptx` (overview) and `pnpm pptx:how-it-works` (accountant guide).

Illustrative images live in [`assets/`](./assets/). Diagrams on the slides are native PowerPoint shapes so they stay editable after generation.
