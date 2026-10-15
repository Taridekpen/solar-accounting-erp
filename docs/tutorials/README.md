# Tutorials

Regenerable PDF guides for Solar Accounting.

## End-user guide (staff)

File: [Solar-Accounting-User-Guide.pdf](./Solar-Accounting-User-Guide.pdf)

Plain-language click-by-click guide for everyday staff (sales, branch, stock, expenses)—not accountants or developers.

```bash
pnpm tutorial:pdf
```

Source: [build-user-guide-pdf.mjs](./build-user-guide-pdf.mjs).

## Accountant guide (controllers)

File: [Solar-Accounting-Accountant-Guide.pdf](./Solar-Accounting-Accountant-Guide.pdf)

Detailed reference for accountants and controllers: posting engine, event mappings (Dr/Cr), fiscal period rules, and every sidebar page with ledger/stock effects. Complements the How-It-Works PowerPoint (`pnpm pptx:how-it-works`).

```bash
pnpm tutorial:accountant-pdf
```

Source: [build-accountant-guide-pdf.mjs](./build-accountant-guide-pdf.mjs).

## Roles & permissions guide

File: [Solar-Accounting-Roles-Guide.pdf](./Solar-Accounting-Roles-Guide.pdf)

What each built-in role is for, what staff do day to day, and which permissions unlock Expenses/Projects actions.

```bash
pnpm tutorial:roles-pdf
```

Source: [build-roles-guide-pdf.mjs](./build-roles-guide-pdf.mjs).
