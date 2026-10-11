# Solar Accounting presentations

## Solar Accounting System deck

File: [Solar-Accounting-System.pptx](./Solar-Accounting-System.pptx)

Stakeholder overview of the product through Section 16 (architecture, modules, workflows, security, import, deployment).

## How it works — user guide & background

File: [How-It-Works-User-Guide.pptx](./How-It-Works-User-Guide.pptx)

Detailed guide: how to use the app, and what the browser, guards, services, posting engine, and PostgreSQL do for each major action (login, sales, purchases, inventory, expenses, banking, projects, reports, closing, payroll, admin, import).

### Regenerate

From the repository root:

```bash
pnpm add -D pptxgenjs -w
node docs/presentations/build-pptx.mjs
node docs/presentations/build-how-it-works-pptx.mjs
```

Or: `pnpm pptx` (overview) and `pnpm pptx:how-it-works` (this guide).

Illustrative images live in [`assets/`](./assets/). Diagrams on the slides are native PowerPoint shapes so they stay editable after generation.
