/**
 * Build Solar-Accounting-System.pptx
 * Run from repo root: node docs/presentations/build-pptx.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = (...parts) => path.join(__dirname, "assets", ...parts);
const outFile = path.join(__dirname, "Solar-Accounting-System.pptx");

const C = {
  navy: "0B1F3A",
  navyMid: "143D66",
  accent: "1B6CA8",
  teal: "0E7C7B",
  ink: "1A2332",
  muted: "5B6B7C",
  line: "D5DEE8",
  soft: "F2F6FA",
  white: "FFFFFF",
  green: "1F7A4D",
  amber: "B45309",
};

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Solar & Inverter Co.";
pptx.title = "Solar Accounting System";
pptx.subject = "Product and architecture overview — Sections 1–16";

let slideNo = 0;

function footer(slide) {
  slideNo += 1;
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 7.15, w: 13.333, h: 0.35,
    fill: { color: C.navy },
  });
  slide.addText("Solar Accounting · Confidential", {
    x: 0.4, y: 7.18, w: 8, h: 0.28,
    fontSize: 10, color: C.white, fontFace: "Calibri",
  });
  slide.addText(String(slideNo), {
    x: 12.2, y: 7.18, w: 0.8, h: 0.28,
    fontSize: 10, color: C.white, fontFace: "Calibri", align: "right",
  });
}

function titleBar(slide, title, subtitle) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 1.15,
    fill: { color: C.navy },
  });
  slide.addText(title, {
    x: 0.5, y: 0.22, w: 12.3, h: 0.45,
    fontSize: 26, bold: true, color: C.white, fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.68, w: 12.3, h: 0.32,
      fontSize: 13, color: "B8C9DC", fontFace: "Calibri",
    });
  }
}

function bullets(slide, items, opts = {}) {
  const x = opts.x ?? 0.55;
  const y = opts.y ?? 1.45;
  const w = opts.w ?? 12.2;
  slide.addText(
    items.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
    {
      x, y, w, h: opts.h ?? 5.2,
      fontSize: opts.fontSize ?? 15,
      color: C.ink,
      fontFace: "Calibri",
      paraSpaceAfter: 8,
      valign: "top",
    },
  );
}

function box(slide, { x, y, w, h, fill, label, sub, color = C.white }) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: fill },
    shadow: { type: "outer", color: "000000", blur: 4, opacity: 0.12, offset: 1 },
  });
  slide.addText(label, {
    x: x + 0.08, y: y + (sub ? 0.12 : h / 2 - 0.16), w: w - 0.16, h: 0.32,
    fontSize: 12, bold: true, color, fontFace: "Calibri", align: "center",
  });
  if (sub) {
    slide.addText(sub, {
      x: x + 0.08, y: y + 0.4, w: w - 0.16, h: h - 0.5,
      fontSize: 10, color, fontFace: "Calibri", align: "center",
    });
  }
}

function arrowRight(slide, x, y) {
  slide.addShape(pptx.shapes.RIGHT_ARROW, {
    x, y, w: 0.35, h: 0.22,
    fill: { color: C.accent },
  });
}

// ——— 1 Title ———
{
  const s = pptx.addSlide();
  s.addImage({ path: assets("hero-solar-business.jpg"), x: 0, y: 0, w: 13.333, h: 7.5 });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 7.5,
    fill: { color: C.navy, transparency: 45 },
  });
  s.addText("Solar & Inverter Co.", {
    x: 0.8, y: 2.0, w: 11.5, h: 0.7,
    fontSize: 40, bold: true, color: C.white, fontFace: "Calibri",
  });
  s.addText("Accounting System", {
    x: 0.8, y: 2.7, w: 11.5, h: 0.55,
    fontSize: 32, color: "D6E6F5", fontFace: "Calibri",
  });
  s.addText("One company · Many branches · Double-entry GL · Nigerian Naira (NGN)", {
    x: 0.8, y: 3.5, w: 11.5, h: 0.4,
    fontSize: 16, color: C.white, fontFace: "Calibri",
  });
  s.addText("Product & architecture overview · Sections 1–16 complete", {
    x: 0.8, y: 5.8, w: 11.5, h: 0.35,
    fontSize: 14, color: "B8C9DC", fontFace: "Calibri",
  });
  slideNo += 1;
  s.addText(String(slideNo), {
    x: 12.2, y: 7.05, w: 0.8, h: 0.28,
    fontSize: 10, color: C.white, fontFace: "Calibri", align: "right",
  });
}

// ——— 2 Agenda ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Agenda", "What this presentation covers");
  const left = [
    "Purpose and product scope",
    "Runtime architecture and monorepo",
    "Financial authority and money rules",
    "Company structure and security",
    "Posting engine and dashboard",
    "Sales and procurement cycles",
  ];
  const right = [
    "Inventory, expenses, banking, projects",
    "Reports, closing, payroll, admin",
    "Historical data import",
    "Testing and production readiness",
    "Deployment",
    "Roadmap Sections 1–16",
  ];
  bullets(s, left, { x: 0.7, y: 1.6, w: 5.8, h: 5 });
  bullets(s, right, { x: 7.0, y: 1.6, w: 5.8, h: 5 });
  footer(s);
}

// ——— 3 Problem & purpose ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Problem & purpose", "Operational ERP with a true general ledger");
  bullets(s, [
    "Built for a solar and inverter business that sells products, manages stock, and delivers installation projects.",
    "One legal company with many branches — not a multi-tenant SaaS platform.",
    "Every financial figure on screens and exports comes from posted double-entry journals.",
    "The NestJS API owns posting, tax, costing, and approvals; the browser displays decimal-string amounts only.",
    "Currency is Nigerian Naira (NGN). Totals are never calculated with JavaScript floating-point numbers.",
  ], { y: 1.55 });
  footer(s);
}

// ——— 4 Product modules ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "What is in the product", "Modules from operations through close and import");
  const mods = [
    ["Sales", C.accent], ["Purchases", C.navyMid], ["Inventory", C.teal],
    ["Expenses", C.amber], ["Banking", C.navy], ["Projects", C.green],
    ["Reports", C.accent], ["Closing", C.navyMid], ["Payroll", C.teal],
    ["Admin", C.navy], ["Import", C.green], ["Dashboard", C.accent],
  ];
  mods.forEach((m, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    box(s, {
      x: 0.7 + col * 3.1, y: 1.6 + row * 1.5, w: 2.85, h: 1.15,
      fill: m[1], label: m[0],
    });
  });
  footer(s);
}

// ——— 5 Architecture diagram ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Runtime architecture", "Web → API → PostgreSQL, with Redis and Docker");
  box(s, { x: 0.6, y: 2.0, w: 2.6, h: 1.4, fill: C.accent, label: "Web", sub: "React · Vite\nPermission nav" });
  arrowRight(s, 3.35, 2.55);
  box(s, { x: 3.85, y: 2.0, w: 2.8, h: 1.4, fill: C.navy, label: "API", sub: "NestJS 11\nPosting · Auth" });
  arrowRight(s, 6.8, 2.55);
  box(s, { x: 7.3, y: 1.7, w: 2.5, h: 1.0, fill: C.teal, label: "PostgreSQL 16", sub: "System of record" });
  box(s, { x: 7.3, y: 2.95, w: 2.5, h: 1.0, fill: C.navyMid, label: "Redis 7", sub: "BullMQ jobs" });
  box(s, { x: 10.3, y: 2.0, w: 2.5, h: 1.4, fill: C.green, label: "Docker", sub: "Compose\ndev & prod" });
  s.addText("Health checks database, Redis, and queue depth. Swagger is available outside production.", {
    x: 0.6, y: 4.5, w: 12, h: 0.4, fontSize: 13, color: C.muted, fontFace: "Calibri",
  });
  s.addImage({ path: assets("deployment-stack.jpg"), x: 0.6, y: 5.0, w: 5.2, h: 1.9 });
  s.addText("Production path: nginx (TLS) → API → managed or compose Postgres; migrate deploy on start.", {
    x: 6.1, y: 5.3, w: 6.5, h: 1.4, fontSize: 14, color: C.ink, fontFace: "Calibri",
  });
  footer(s);
}

// ——— 6 Monorepo ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Monorepo layout", "pnpm workspace · Node 22");
  const pkgs = [
    { t: "apps/web", d: "React shell, feature clients, dashboards, module pages" },
    { t: "apps/api", d: "Nest modules, Prisma, posting engine, auth, imports" },
    { t: "packages/shared", d: "Types and NGN display formatting — no Prisma" },
    { t: "packages/accounting-rules", d: "Posting event catalog; API remains financial authority" },
  ];
  pkgs.forEach((p, i) => {
    box(s, {
      x: 0.6, y: 1.5 + i * 1.2, w: 12.1, h: 1.05,
      fill: i % 2 === 0 ? C.navy : C.navyMid, label: p.t, sub: p.d,
    });
  });
  footer(s);
}

// ——— 7 Financial authority ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Financial authority", "The API is the only writer of journals");
  bullets(s, [
    "AccountingPostingService records every journal — sales, purchases, expenses, banking, projects, payroll, and opening balances call it.",
    "packages/shared formats amounts for display. It does not own balances or profit.",
    "packages/accounting-rules lists posting event mappings; the API applies them.",
    "Posted journals cannot be edited or deleted. A reversal is a new journal that preserves the original.",
    "Dashboard cards, reports, and PDFs all read posted journal lines — empty ledgers show 0.0000.",
  ]);
  footer(s);
}

// ——— 8 Money & dates ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Money & dates", "Decimal strings and company timezone");
  box(s, { x: 0.6, y: 1.7, w: 5.9, h: 4.6, fill: C.navy, label: "Money", sub: "API amounts are decimal strings\n(e.g. 150000.0000)\n\nDisplay uses decimal.js and NGN\n\nNo JS number maths for totals\n\nOpening inventory reconciles\nquantity × unit cost to value" });
  box(s, { x: 6.8, y: 1.7, w: 5.9, h: 4.6, fill: C.teal, label: "Dates", sub: "Seeded timezone: Africa/Lagos\n\nDashboard month/year presets\nuse company timezone\n\nCustom ranges pass through\n\nClosed fiscal periods reject\nposting without adjustment" });
  footer(s);
}

// ——— 9 Company structure ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Company structure", "One legal entity, branch-aware operations");
  s.addImage({ path: assets("multi-branch-org.jpg"), x: 0.5, y: 1.45, w: 5.8, h: 5.2 });
  bullets(s, [
    "Single company profile with fiscal settings.",
    "Branches, departments, and employees.",
    "Default chart of accounts and roles.",
    "Document numbers allocated with row locks so concurrent requests stay unique.",
    "Soft delete for masters; branch deactivation keeps history readable.",
    "Header branch selector narrows scope via X-Branch-Ids within the user’s assignments.",
  ], { x: 6.6, y: 1.55, w: 6.2, h: 5.2, fontSize: 14 });
  footer(s);
}

// ——— 10 Security ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Security & access", "Sessions, CSRF, RBAC, branch scope");
  bullets(s, [
    "HTTP-only session cookies and a readable CSRF cookie; unsafe methods require X-CSRF-Token.",
    "Argon2id passwords; five failed logins lock the account for fifteen minutes.",
    "Privileged roles must enroll TOTP before other protected routes.",
    "Invite-only staff; no public registration. Reset tokens are hashed.",
    "Permissions drive navigation and API guards. Company-wide roles see all branches; others use assignments.",
    "Separation rules block originators from approving their own restricted actions.",
    "Audit events are append-only; secrets are redacted from payloads.",
  ], { fontSize: 14 });
  footer(s);
}

// ——— 11 Posting engine ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Posting engine", "Events map to balanced, immutable journals");
  s.addImage({ path: assets("posting-engine.jpg"), x: 8.6, y: 1.45, w: 4.3, h: 3.9 });
  const steps = [
    ["1", "Business event", C.accent],
    ["2", "Account mapping", C.navyMid],
    ["3", "Balanced draft", C.teal],
    ["4", "Posted lines", C.green],
  ];
  steps.forEach((st, i) => {
    box(s, {
      x: 0.5 + i * 2.0, y: 2.2, w: 1.75, h: 1.5,
      fill: st[2], label: st[0], sub: st[1],
    });
    if (i < 3) arrowRight(s, 2.3 + i * 2.0, 2.85);
  });
  bullets(s, [
    "Opening balances reconcile to control accounts.",
    "Closed periods reject posting unless an approved adjustment.",
    "Reversal creates a linked opposite journal once.",
  ], { x: 0.5, y: 4.2, w: 7.8, h: 2.4, fontSize: 14 });
  footer(s);
}

// ——— 12 Dashboard ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Dashboard", "KPIs from posted activity for selected branches");
  bullets(s, [
    "Sales, purchases, gross profit, expenses, cash & bank, AR, AP, inventory valuation.",
    "Net profit = revenue − cost of sales − operating expenses from journal lines.",
    "Charts for revenue, expenses, branch sales/profit, and cash movement.",
    "Each financial card opens the journal lines that make up the figure.",
    "Pending approvals open the accounting review workspace.",
    "With no posted journals, totals remain 0.0000.",
  ]);
  footer(s);
}

// ——— 13 Sales cycle ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Sales cycle (order to cash)", "Quotations do not post revenue");
  const sale = [
    ["Quotation", "No GL"],
    ["Invoice", "AR / revenue"],
    ["Stock issue", "COGS"],
    ["Receipt", "Cash/bank"],
    ["Credit note", "Reversal"],
  ];
  sale.forEach((st, i) => {
    box(s, {
      x: 0.4 + i * 2.55, y: 2.3, w: 2.3, h: 1.6,
      fill: i === 0 ? C.muted : C.navy, label: st[0], sub: st[1],
    });
    if (i < 4) arrowRight(s, 2.75 + i * 2.55, 3.0);
  });
  bullets(s, [
    "Invoice totals, tax, and discounts are calculated by the API.",
    "Receipts settle invoices or record advances without posting revenue again.",
    "Customer statements and aging come from posted sales documents.",
  ], { y: 4.4, h: 2.2, fontSize: 14 });
  footer(s);
}

// ——— 14 Procurement ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Procurement cycle (procure to pay)", "PO does not post; GRN and bill do");
  const buy = [
    ["PO", "No GL"],
    ["GRN", "Inventory / GRNI"],
    ["Bill", "AP"],
    ["Payment", "Cash/bank"],
  ];
  buy.forEach((st, i) => {
    box(s, {
      x: 1.0 + i * 3.0, y: 2.2, w: 2.5, h: 1.6,
      fill: i === 0 ? C.muted : C.teal, label: st[0], sub: st[1],
    });
    if (i < 3) arrowRight(s, 3.55 + i * 3.0, 2.9);
  });
  bullets(s, [
    "Approvals enforce separation of duties and branch purchase limits.",
    "Central procurement requires a company-wide user.",
    "Supplier bank numbers are masked in API responses.",
  ], { y: 4.3, h: 2.2, fontSize: 14 });
  footer(s);
}

// ——— 15 Inventory ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Inventory, warehouses & costing", "Weighted-average cost and controlled transfers");
  s.addImage({ path: assets("warehouse-stock.jpg"), x: 8.5, y: 1.45, w: 4.4, h: 5.2 });
  bullets(s, [
    "Each branch has a main warehouse and an in-transit warehouse.",
    "Receipts and returns recalculate branch weighted-average cost.",
    "Transfers: draft → approve → ship → receive; company inventory total unchanged.",
    "Stock counts post shortages/surpluses through the journal.",
    "Serial-tracked products need one in-stock serial per unit sold.",
  ], { x: 0.55, y: 1.55, w: 7.6, h: 5, fontSize: 14 });
  footer(s);
}

// ——— 16 Expenses ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Expenses & approvals", "Creator cannot approve; budgets can block");
  bullets(s, [
    "Expense categories map to postable accounts (not inventory or fixed-asset accounts).",
    "Submit → approve (different user) → pay (different user).",
    "Approval accrues expense; payment clears the accrual from cash.",
    "Budgets can block approval when the month would go over the limit.",
    "Reports cover branch, category, department, project, and budget versus actual.",
  ]);
  footer(s);
}

// ——— 17 Banking ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Banking, cash & reconciliation", "Book balances from journals");
  bullets(s, [
    "Bank accounts and cash drawers map to GL accounts; book amounts come from posted lines.",
    "Same-day transfers debit destination and credit source; later receipts use transfers in transit.",
    "Cash counts compare counted cash to the drawer; a different user posts differences.",
    "Cash book shows opening, receipts, payments, and closing.",
    "Statement import (CSV/manual), suggested matches, lock by a different user.",
  ]);
  footer(s);
}

// ——— 18 Projects ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Solar installation projects", "Deposits, WIP, milestone recognition");
  bullets(s, [
    "Projects store contract, quotation, and budget; profit and WIP come from journals.",
    "Material issues (after approval) debit WIP and credit inventory for installations.",
    "Customer deposits credit advances — not revenue — and create an advance receipt.",
    "Milestone invoices recognize revenue and a proportional share of WIP as cost.",
    "Dashboard lists project profitability inside the selected date range.",
  ]);
  footer(s);
}

// ——— 19 Reports ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Financial reports", "Same rows on screen, PDF, spreadsheet, and CSV");
  const reports = [
    "General journal & ledger", "Trial balance", "Profit & loss",
    "Balance sheet", "Cash flow (indirect)", "AR / AP ledgers",
    "Inventory valuation", "Fixed assets", "Tax codes",
  ];
  reports.forEach((r, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    box(s, {
      x: 0.7 + col * 4.1, y: 1.7 + row * 1.5, w: 3.85, h: 1.2,
      fill: C.navyMid, label: r,
    });
  });
  footer(s);
}

// ——— 20 Closing ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Daily closing & fiscal periods", "Reviewer ≠ preparer; lock after checklist");
  bullets(s, [
    "Daily close stores sales, collections, expenses, exceptions, and cash difference for the branch day.",
    "Month close moves open → closing → locked after checklist and a second person’s approval.",
    "Closed periods reject ordinary posting.",
    "Year-end stores statement snapshots, closes income/expense to retained earnings, and opens the next year.",
    "Reopening requires permission and a reason.",
  ]);
  footer(s);
}

// ——— 21 Payroll ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Employees & salary accounting", "External payroll summaries through the posting engine");
  bullets(s, [
    "Employee directory holds branch, department, and status — not salary amounts on the person record.",
    "Accountants enter approved external payroll summaries.",
    "Approval posts gross expense, deduction liabilities, and salaries payable (different approver).",
    "Payments settle one or more summaries against account 2300, including partial settlement.",
    "Future payroll integrations must keep using the posting engine.",
  ]);
  footer(s);
}

// ——— 22 Admin ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Administration, audit & notifications", "Settings hub and immutable history");
  bullets(s, [
    "Settings covers company profile, templates, account mappings, tax codes, periods, policies, delegations, and separation rules.",
    "Managed documents enforce MIME type, 2 MB size, and branch-aware access.",
    "Company and configuration changes write redacted audit events.",
    "In-app notifications for approvals, overdue invoices, low stock, bills due, failed postings, and closing reminders.",
  ]);
  footer(s);
}

// ——— 23 Import pipeline ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Historical data import", "Staged CSV — unbalanced openings cannot commit");
  const pipe = ["Upload", "Parse", "Validate", "Preview", "Approve", "Commit", "Report"];
  pipe.forEach((p, i) => {
    box(s, {
      x: 0.35 + i * 1.85, y: 2.1, w: 1.7, h: 1.2,
      fill: i === 4 ? C.amber : C.navy, label: p,
    });
    if (i < 6) arrowRight(s, 2.1 + i * 1.85, 2.55);
  });
  bullets(s, [
    "Masters (customers, suppliers, products, CoA) create through domain services.",
    "Opening financials go through importOpeningBalances — not direct journal-line writes.",
    "A different user must approve. Unbalanced trial balance / bank opening batches are rejected.",
    "Permissions: imports.view and imports.manage. Schema version 16.",
  ], { y: 3.7, h: 3, fontSize: 14 });
  footer(s);
}

// ——— 24 Testing ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Testing & production readiness", "Automated gates plus a human checklist");
  bullets(s, [
    "Unit, integration, security, April 2028 accounting scenario, and import pipeline packs.",
    "Backup dump/restore into a throwaway database with schema_version verified.",
    "CI: install, migrate, typecheck, tests, backup-restore.",
    "GET /health reports BullMQ waiting/active/delayed/failed counts.",
    "Human items remain open: accountant acceptance, independent report sign-off, secret rotation, production TLS.",
  ]);
  footer(s);
}

// ——— 25 Deployment ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Deployment", "Production compose, TLS, migrate-then-start");
  s.addImage({ path: assets("deployment-stack.jpg"), x: 0.5, y: 1.5, w: 5.5, h: 4.9 });
  bullets(s, [
    "docker-compose.prod.yml: Postgres (no published port by default), Redis, API production image, nginx web.",
    "API entrypoint runs prisma migrate deploy then starts Node.",
    "TLS terminates at nginx with mounted certificates.",
    "COOKIE_SECURE with NODE_ENV=production.",
    "Backup scripts for Linux/macOS and Windows PowerShell.",
    "Structured Pino JSON logs for shipping.",
  ], { x: 6.3, y: 1.55, w: 6.5, h: 5, fontSize: 13 });
  footer(s);
}

// ——— 26 Roadmap ———
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft } });
  titleBar(s, "Section roadmap 1–16", "All listed sections are complete");
  const roadmap = [
    "1 Foundation", "2 Company", "3 Auth", "4 Posting engine",
    "5 Dashboard", "6 Sales", "7 Procurement", "8 Inventory",
    "9 Expenses", "10 Banking", "11 Projects", "12 Reports",
    "13 Closing", "14 Payroll", "15 Admin", "16 Import & deploy",
  ];
  roadmap.forEach((r, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    box(s, {
      x: 0.45 + col * 3.2, y: 1.5 + row * 1.25, w: 3.0, h: 1.05,
      fill: C.green, label: r,
    });
  });
  footer(s);
}

// ——— 27 Closing ———
{
  const s = pptx.addSlide();
  s.addImage({ path: assets("hero-solar-business.jpg"), x: 0, y: 0, w: 13.333, h: 7.5 });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 7.5,
    fill: { color: C.navy, transparency: 40 },
  });
  s.addText("Thank you", {
    x: 0.8, y: 2.4, w: 11.5, h: 0.7,
    fontSize: 40, bold: true, color: C.white, fontFace: "Calibri",
  });
  s.addText("Sections 1–16 are in place. Section 17 has not started.", {
    x: 0.8, y: 3.3, w: 11.5, h: 0.4,
    fontSize: 18, color: "D6E6F5", fontFace: "Calibri",
  });
  s.addText("Questions welcome.", {
    x: 0.8, y: 4.0, w: 11.5, h: 0.4,
    fontSize: 18, color: C.white, fontFace: "Calibri",
  });
  s.addText("Solar Accounting · Confidential", {
    x: 0.8, y: 6.5, w: 11.5, h: 0.35,
    fontSize: 12, color: "B8C9DC", fontFace: "Calibri",
  });
}

await pptx.writeFile({ fileName: outFile });
console.log(`Wrote ${outFile}`);
console.log(`Slides: ${slideNo + 1}`);
