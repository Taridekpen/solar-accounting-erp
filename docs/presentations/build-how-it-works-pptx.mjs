/**
 * Detailed "how to use" + background mechanics deck.
 * Run: node docs/presentations/build-how-it-works-pptx.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = (...p) => path.join(__dirname, "assets", ...p);
const outFile = path.join(__dirname, "How-It-Works-User-Guide.pptx");

const C = {
  navy: "0B1F3A",
  navyMid: "143D66",
  accent: "1B6CA8",
  teal: "0E7C7B",
  ink: "1A2332",
  muted: "5B6B7C",
  soft: "F2F6FA",
  white: "FFFFFF",
  green: "1F7A4D",
  amber: "B45309",
  red: "9B1C1C",
};

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "Solar & Inverter Co.";
pptx.title = "How It Works — User Guide & Background";
pptx.subject = "Using the system and what happens behind every action";

let slideNo = 0;

function footer(slide) {
  slideNo += 1;
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 7.15, w: 13.333, h: 0.35, fill: { color: C.navy },
  });
  slide.addText("Solar Accounting · How it works · Confidential", {
    x: 0.35, y: 7.18, w: 10, h: 0.28, fontSize: 10, color: C.white, fontFace: "Calibri",
  });
  slide.addText(String(slideNo), {
    x: 12.2, y: 7.18, w: 0.8, h: 0.28, fontSize: 10, color: C.white, fontFace: "Calibri", align: "right",
  });
}

function titleBar(slide, title, subtitle) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 1.1, fill: { color: C.navy },
  });
  slide.addText(title, {
    x: 0.45, y: 0.18, w: 12.4, h: 0.42, fontSize: 24, bold: true, color: C.white, fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.45, y: 0.62, w: 12.4, h: 0.35, fontSize: 12, color: "B8C9DC", fontFace: "Calibri",
    });
  }
}

function softBg(slide) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.soft },
  });
}

function bullets(slide, items, opts = {}) {
  slide.addText(
    items.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
    {
      x: opts.x ?? 0.5,
      y: opts.y ?? 1.35,
      w: opts.w ?? 12.3,
      h: opts.h ?? 5.4,
      fontSize: opts.fontSize ?? 13,
      color: C.ink,
      fontFace: "Calibri",
      paraSpaceAfter: opts.gap ?? 6,
      valign: "top",
    },
  );
}

function twoCol(slide, leftTitle, leftItems, rightTitle, rightItems) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 1.35, w: 6.1, h: 5.4, fill: { color: C.white },
    shadow: { type: "outer", color: "000000", blur: 3, opacity: 0.08, offset: 1 },
  });
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.8, y: 1.35, w: 6.1, h: 5.4, fill: { color: C.white },
    shadow: { type: "outer", color: "000000", blur: 3, opacity: 0.08, offset: 1 },
  });
  slide.addText(leftTitle, {
    x: 0.6, y: 1.5, w: 5.7, h: 0.35, fontSize: 14, bold: true, color: C.accent, fontFace: "Calibri",
  });
  slide.addText(rightTitle, {
    x: 7.0, y: 1.5, w: 5.7, h: 0.35, fontSize: 14, bold: true, color: C.teal, fontFace: "Calibri",
  });
  bullets(slide, leftItems, { x: 0.6, y: 1.95, w: 5.7, h: 4.5, fontSize: 12, gap: 5 });
  bullets(slide, rightItems, { x: 7.0, y: 1.95, w: 5.7, h: 4.5, fontSize: 12, gap: 5 });
}

function flowBoxes(slide, labels, y = 2.0) {
  const n = labels.length;
  const w = Math.min(2.15, (12.2 - (n - 1) * 0.35) / n);
  const total = n * w + (n - 1) * 0.35;
  const start = (13.333 - total) / 2;
  labels.forEach((label, i) => {
    const x = start + i * (w + 0.35);
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y, w, h: 1.05, fill: { color: i === 0 ? C.accent : C.navy },
    });
    slide.addText(label, {
      x: x + 0.05, y: y + 0.28, w: w - 0.1, h: 0.5,
      fontSize: 11, bold: true, color: C.white, fontFace: "Calibri", align: "center",
    });
    if (i < n - 1) {
      slide.addShape(pptx.shapes.RIGHT_ARROW, {
        x: x + w + 0.05, y: y + 0.4, w: 0.25, h: 0.22, fill: { color: C.accent },
      });
    }
  });
}

// 1 Title
{
  const s = pptx.addSlide();
  s.addImage({ path: assets("hero-solar-business.jpg"), x: 0, y: 0, w: 13.333, h: 7.5 });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.navy, transparency: 42 },
  });
  s.addText("How to use this system", {
    x: 0.7, y: 2.1, w: 12, h: 0.6, fontSize: 36, bold: true, color: C.white, fontFace: "Calibri",
  });
  s.addText("What happens in the background for every important action", {
    x: 0.7, y: 2.85, w: 12, h: 0.45, fontSize: 20, color: "D6E6F5", fontFace: "Calibri",
  });
  s.addText("Solar & Inverter Co. · One company · Many branches · NGN · API-owned ledgers", {
    x: 0.7, y: 5.9, w: 12, h: 0.35, fontSize: 14, color: "B8C9DC", fontFace: "Calibri",
  });
  slideNo += 1;
}

// 2 Agenda
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Agenda", "User guide first, then the machinery behind each click");
  bullets(s, [
    "Start the app, sign in, and move around the shell",
    "The universal request pipeline (browser → guards → services → PostgreSQL)",
    "Money, branch scope, CSRF, and permissions on every call",
    "Action-by-action: dashboard, sales, purchases, inventory, expenses, banking, projects",
    "Reports, closing, payroll, settings, documents, notifications, data import",
    "What never happens in the browser (financial calculations)",
  ], { fontSize: 15, gap: 8 });
  footer(s);
}

// 3 Getting started
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Getting started (local)", "What you do vs what the stack starts");
  twoCol(
    s,
    "What you do",
    [
      "Install Node 22 and pnpm; start Docker Compose (Postgres on 5433, Redis, optional API/web containers).",
      "Copy .env values; run migrate and seed on solar_accounting.",
      "pnpm dev — web on :5173, API on :3000.",
      "Open the login page; use the seeded admin (after MFA if required).",
      "Use the sidebar to open modules your role can see.",
    ],
    "What starts in the background",
    [
      "Prisma connects to PostgreSQL; seed creates company, HO branch, CoA, roles, mappings, admin user.",
      "Nest loads modules, validates env, enables CORS for WEB_ORIGIN.",
      "Redis + BullMQ system queue come online; /health checks all three.",
      "Vite serves React; React Query will call the API with credentials.",
      "Schema version in system_metadata marks the migrated level (currently 16).",
    ],
  );
  footer(s);
}

// 4 Shell usage
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Using the shell", "Navigation, branches, and independent scrolling");
  bullets(s, [
    "Sidebar lists only routes allowed by your permissions (operations vs records groups).",
    "Header: branch filter (all / one / many assigned branches), date range for the dashboard, theme, notifications, account.",
    "Selecting branches stores IDs in the UI store; every later API call sends X-Branch-Ids to narrow scope.",
    "Main content scrolls in its own pane; the sidebar nav scrolls separately and stays viewport-tall.",
    "Mobile: hamburger opens the same sidebar as a drawer; overlay closes it.",
    "Login sits outside the shell; after session + MFA (if needed) you land on the dashboard.",
  ], { fontSize: 14, gap: 7 });
  footer(s);
}

// 5 Universal pipeline diagram
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Universal background pipeline", "Every protected action follows this path");
  flowBoxes(s, ["UI click", "apiRequest", "AccessGuard", "Controller", "Service", "Prisma / GL"], 1.55);
  bullets(s, [
    "UI: React page or form calls a feature API helper (for example finalizeInvoice).",
    "apiRequest: adds cookies (credentials include), CSRF header on POST/PATCH/DELETE, optional X-Branch-Ids, JSON body.",
    "AccessGuard: session cookie → resolve user; reject 401; MFA pending → 403; CSRF check on unsafe methods; RequirePermissions.",
    "Controller: validates DTO (whitelist / forbid unknown fields), passes AccessContext + body.",
    "Service: business rules, document numbers, then AccountingPostingService when money moves.",
    "PostgreSQL: masters, documents, journal_entries + journal_lines; Redis for queues; audit_events append-only.",
  ], { y: 2.9, fontSize: 13, gap: 5 });
  footer(s);
}

// 6 Request details
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "What travels on every API call", "Cookies, headers, and why the browser never owns money");
  twoCol(
    s,
    "Sent from the browser",
    [
      "Cookie solar_session (HTTP-only) — proves who you are.",
      "Cookie solar_csrf (readable) — copied into X-CSRF-Token on mutations.",
      "X-Branch-Ids when a subset of branches is selected.",
      "JSON body with decimal-string amounts (never raw JS floats for money).",
      "credentials: include so cross-origin Vercel→API cookies work when CORS allows WEB_ORIGIN.",
    ],
    "Enforced on the server",
    [
      "Session hash lookup; locked/suspended users rejected.",
      "Permission list from roles; missing permission → 403.",
      "Branch scope: company-wide roles or user_branch_assignments only.",
      "X-Branch-Ids can only narrow your own scope — never expand it.",
      "Totals for screens and PDFs are computed or stored by the API and returned as strings.",
    ],
  );
  footer(s);
}

// 7 Sign in
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Sign in", "What you do → what the API does");
  twoCol(
    s,
    "You",
    [
      "Enter email + password on /login.",
      "If prompted, enter TOTP from your authenticator (privileged roles).",
      "On first privileged login without MFA, complete enroll → verify.",
      "After success, the shell loads and navigation appears for your permissions.",
    ],
    "Background",
    [
      "POST /auth/login — Argon2id verify; same error if email missing or password wrong.",
      "Failed count increments; at 5 failures lock 15 minutes.",
      "On success: create session row, set solar_session + solar_csrf cookies, write audit auth.login (or mfa_enrollment_required).",
      "Privileged roles without MFA stay mfaPending until verify clears it.",
      "Later requests: AccessGuard loads session → permissions → branch scope.",
    ],
  );
  footer(s);
}

// 8 Branch filter
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Change branch filter", "Header selection narrows every later query");
  bullets(s, [
    "You pick All branches, one branch, or several from the header dropdown.",
    "UI store updates selectedBranchIds; setActiveBranchFilter updates the API client.",
    "Dashboard and detail pages refetch with the new filter.",
    "Background: each request sends X-Branch-Ids. Guard narrows AccessContext.scope to those IDs if they are inside your assignments.",
    "Journal and stock queries use branchId filters so another branch’s rows never appear.",
    "Company-wide roles can see all branches until they voluntarily narrow; restricted roles never see unassigned branches.",
  ], { fontSize: 14, gap: 7 });
  footer(s);
}

// 9 Dashboard
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Open Dashboard / change dates", "KPIs are aggregates of posted journal lines");
  twoCol(
    s,
    "You",
    [
      "Land on / after login.",
      "Change preset (This month, custom range, etc.).",
      "Click a KPI card to open detail lines.",
      "Open charts for revenue, expenses, branch sales/profit, cash movement.",
    ],
    "Background",
    [
      "GET /dashboard/summary with preset/from/to.",
      "DashboardService sums posted journal lines in scope and date range (Lagos timezone for presets).",
      "Returns decimal strings: sales, purchases, gross profit, expenses, cash, AR, AP, inventory, etc.",
      "Net profit = revenue − COS − operating expenses from lines — not recalculated in React.",
      "Detail route loads the exact journal lines that make up that metric.",
      "Empty ledger → all 0.0000 and empty lists.",
    ],
  );
  footer(s);
}

// 10 Sales invoice
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Create & finalize a sales invoice", "Revenue, tax, stock, and COGS post together");
  twoCol(
    s,
    "You",
    [
      "Customers: create customer linked to a branch.",
      "Sales: draft invoice with lines (product, qty, price, tax).",
      "Optionally start from an accepted quotation (quotation itself never posted revenue).",
      "Finalize / post the invoice.",
      "Later: take a receipt and allocate to open invoices.",
    ],
    "Background on finalize",
    [
      "Validate draft, credit limit (credit sales), serials if tracked.",
      "Allocate invoice number via SELECT … FOR UPDATE on document_sequences.",
      "Build journal lines from account mappings (AR/cash, revenue, tax, COGS, inventory).",
      "postSystemDocument → balanced journal → status posted; stock movements reduce available qty at WAC.",
      "Invoice row stores totals as decimals and journalEntryId.",
      "Receipt later: cash/bank + AR (or advance); allocations cannot exceed open balance; no second revenue post.",
    ],
  );
  footer(s);
}

// 11 Credit note
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Credit note / return", "Reverses revenue and inventory at original cost");
  bullets(s, [
    "You request a return from a posted invoice, approve, inspect accepted qty, then post.",
    "Background: validates quantities ≤ invoice lines; refund path checks amounts already received.",
    "Posting creates a credit note journal reversing revenue/tax and restoring inventory at the invoice line cost.",
    "Customer open balance decreases; stock positions increase for accepted product returns.",
    "UI shows API-calculated grand totals only.",
  ], { fontSize: 14, gap: 8 });
  footer(s);
}

// 12 Procurement
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Purchase order → receive → bill → pay", "PO has no GL; GRN and bill do");
  flowBoxes(s, ["Create PO", "Submit", "Approve", "GRN", "Bill", "Pay"], 1.5);
  bullets(s, [
    "Create/submit PO: stores lines and totals; no journal. Central mode requires company-wide user.",
    "Approve: different user; branch approver capped by company purchaseApprovalLimit; overage needs company-wide approver.",
    "GRN: increases warehouse stock, recalculates WAC, posts Inventory vs GRNI through posting engine.",
    "Supplier bill: clears GRNI, records price difference if any, creates AP; bank details stay masked in responses.",
    "Payment: settles bills or records supplier deposit; posts AP and cash/bank; duplicate over-allocation rejected.",
  ], { y: 2.85, fontSize: 13, gap: 5 });
  footer(s);
}

// 13 Inventory transfer
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Stock transfer / count / serial sale", "Inventory journals keep company total coherent");
  twoCol(
    s,
    "Transfer (you)",
    [
      "Draft transfer between branches/warehouses.",
      "Different user approves.",
      "Ship, then receive at destination.",
    ],
    "Transfer (background)",
    [
      "Ship: Dr Inventory in Transit / Cr source Inventory at current cost.",
      "Receive: Dr destination Inventory / Cr In Transit.",
      "Company inventory value unchanged; available qty excludes in-transit.",
      "Count: book qty stored; different user posts variance to expense/income + inventory.",
      "Serial sale: requires one in-stock serial per unit; marks serial sold to customer/invoice.",
    ],
  );
  footer(s);
}

// 14 Expenses
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Submit, approve, and pay an expense", "Creator cannot approve; payee path is separate");
  flowBoxes(s, ["Draft", "Submit", "Approve", "Pay"], 1.55);
  bullets(s, [
    "Draft stores category, amount (decimal string), receipt attachment metadata.",
    "Submit moves to pending; notifications can alert approvers.",
    "Approve: separation of duties; level/limit rules; may debit expense + credit accrued (tax to prepaid when mapped).",
    "Budget check can reject approval if the month would exceed the budget.",
    "Pay: different user; clears accrual from a postable cash account; second payment rejected.",
    "Rejection posts nothing to the ledger.",
  ], { y: 2.9, fontSize: 13, gap: 5 });
  footer(s);
}

// 15 Banking
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Bank transfer, cash count, reconcile statement", "Book balance always from journals");
  twoCol(
    s,
    "You",
    [
      "Create transfer/deposit between cash/bank accounts.",
      "Count a cash drawer and submit counted amount.",
      "Import statement CSV or add a line; match suggestions; lock when done.",
    ],
    "Background",
    [
      "Transfer: Dr destination / Cr source (same-day). Later receipt uses transfers-in-transit account — never income/expense.",
      "Cash count: compare counted vs book; different user posts shortage (expense) or overage (income).",
      "Statement match links lines to journal lines / documents; charges/interest post via engine.",
      "Lock by different user freezes further edits.",
      "Cash book API aggregates posted cash/bank lines for opening/receipts/payments/closing.",
    ],
  );
  footer(s);
}

// 16 Projects
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Project deposit, issue materials, milestone invoice", "Advances ≠ revenue until milestones");
  bullets(s, [
    "Create project with contract/quotation/budget — draft stores data only.",
    "Customer deposit: Dr cash/bank / Cr customer advances + advance receipt document; revenue unchanged.",
    "Reserve materials (available qty down); different user approves issue.",
    "Installation issue: Dr WIP / Cr Inventory once at cost. Maintenance may hit installation expense immediately.",
    "Milestone invoice: Dr AR / Cr installation revenue; cost = remaining WIP × (milestone ÷ contract), capped at remaining WIP.",
    "Dashboard profitability reads journals overlapping the selected dates.",
  ], { fontSize: 13, gap: 6 });
  footer(s);
}

// 17 Reports
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Run a financial report or export", "One calculation path for screen, PDF, Excel, CSV");
  bullets(s, [
    "You open Reports, pick type (TB, P&L, BS, CF, AR, AP, inventory, assets), dates, optional format.",
    "GET/POST report endpoints require reports.view and company or branch report permission.",
    "ReportsService reads posted journal lines in scope; builds rows and decimal totals.",
    "P&L supports period compare, YTD, branch columns, budget; BS includes current-year profit and clearing so A = L+E.",
    "Cash flow uses the indirect method; internal cash↔bank transfers do not invent profit.",
    "Export serializers reuse the same row arrays — downloads cannot disagree with the on-screen table.",
  ], { fontSize: 13, gap: 6 });
  footer(s);
}

// 18 Closing
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Daily close and period lock", "Reviewer ≠ preparer; lock stops ordinary posting");
  twoCol(
    s,
    "Daily close",
    [
      "You prepare the branch day (or view stored figures).",
      "API aggregates sales, collections, credit sales, expenses, refunds, exceptions, cash difference from posted activity.",
      "Different user reviews; stored JSON keeps the day’s figures.",
    ],
    "Month / year close",
    [
      "Start closing → complete checklist tasks → second person locks.",
      "Closed period: posting engine rejects normal posts.",
      "Year-end: snapshot statements, close P&L to retained earnings, open next year.",
      "Reopen needs permission + reason; audited.",
    ],
  );
  footer(s);
}

// 19 Payroll
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Enter payroll summary and pay salaries", "External payroll numbers enter through the posting engine");
  bullets(s, [
    "Employees page edits HR fields only — no salary stored on the person row.",
    "You create a payroll summary (gross, net, deductions) for a period/branch.",
    "Different user approves → posts salary expense, PAYE/pension (etc.) liabilities, salaries payable (2300).",
    "Payment settles one or more summaries (partial allowed); reduces 2300 and credits cash/bank.",
    "Outstanding payables on screen agree with control account 2300 from journals.",
  ], { fontSize: 14, gap: 7 });
  footer(s);
}

// 20 Admin / audit / docs / notifications
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Settings, documents, notifications", "Configuration changes are audited");
  twoCol(
    s,
    "You",
    [
      "Edit company, templates, mappings, tax codes, policies, delegations, separation rules.",
      "Upload managed documents (PDF/PNG/JPEG/CSV, ≤ 2 MB).",
      "Open notifications; refresh alerts; mark read.",
      "Search audit history.",
    ],
    "Background",
    [
      "PATCH/POST write rows + AuditService.record with redacted secrets.",
      "Documents: MIME/size checks, branch scope, bytes in Postgres; logo is a managed document.",
      "Notifications refresh scans overdue invoices, low stock, bills due, failed postings, closing reminders.",
      "Audit table trigger rejects UPDATE/DELETE of audit rows.",
      "Account mapping edits change how future posting events resolve accounts.",
    ],
  );
  footer(s);
}

// 21 Import
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Action: Historical CSV import", "Staged pipeline; unbalanced openings cannot commit");
  flowBoxes(s, ["Upload", "Parse", "Validate", "Preview", "Approve", "Commit", "Report"], 1.5);
  bullets(s, [
    "Upload: base64 CSV ≤ 2 MB → import_batches status uploaded (bytes stored).",
    "Parse: CSV → import_rows raw JSON.",
    "Validate: type rules + duplicates; reconciliation for TB/bank (debit must equal credit).",
    "Preview: sample rows + checklist; Approve must be a different imports.manage user; error/duplicate/unbalanced rejected.",
    "Commit: masters via domain creates; opening stock/bank/TB via importOpeningBalances (not direct journal_line inserts).",
    "Report: stored JSON on the batch; audits imports.approved / imports.committed.",
  ], { y: 2.85, fontSize: 12, gap: 4 });
  footer(s);
}

// 22 Posting engine deep dive
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Deep dive: AccountingPostingService", "The only writer of financial journals");
  s.addImage({ path: assets("posting-engine.jpg"), x: 9.0, y: 1.4, w: 3.9, h: 3.5 });
  bullets(s, [
    "Modules never insert journal lines themselves.",
    "postEvent / postSystemDocument / importOpeningBalances / reverse all go through saveJournal.",
    "Validates debit=credit, active postable accounts, branch exists, period open (or adjustment).",
    "Opening mode reconciles detail kinds (cash, bank, inventory qty×cost, equity, AR/AP, assets) to control accounts.",
    "Posted journals immutable; reversal creates opposite linked journal once.",
    "Failed attempts can be recorded and surface as notifications.",
    "Dashboard and reports only trust status=posted lines.",
  ], { x: 0.5, y: 1.4, w: 8.2, h: 5.3, fontSize: 13, gap: 5 });
  footer(s);
}

// 23 Failures users see
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Common rejections (and why)", "The API fails closed on money and security");
  bullets(s, [
    "401 — no session cookie or expired session.",
    "403 — missing permission, CSRF missing/wrong, MFA not finished, branch outside scope, approving your own restricted action.",
    "400 — unbalanced journal, closed period, allocation > open balance, duplicate payment, bad MIME/size, unbalanced import TB.",
    "409 — unique document number / business uniqueness conflicts.",
    "UI shows API error messages; it does not invent fallback totals.",
  ], { fontSize: 14, gap: 8 });
  footer(s);
}

// 24 Mental model
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Mental model to remember", "Use the app; trust the ledger");
  bullets(s, [
    "Screens are windows onto PostgreSQL documents and posted journals.",
    "If it changes money, stock value, or control accounts — the posting engine ran.",
    "If it only stores a draft (quotation, open PO, draft expense) — no GL yet.",
    "Approvals and imports require a second person where separation is configured.",
    "Branch filters and permissions shape every query; they are not cosmetic.",
    "NGN amounts cross the wire as decimal strings with four decimal places.",
  ], { fontSize: 15, gap: 8 });
  footer(s);
}

// 25 Close
{
  const s = pptx.addSlide();
  s.addImage({ path: assets("hero-solar-business.jpg"), x: 0, y: 0, w: 13.333, h: 7.5 });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.navy, transparency: 40 },
  });
  s.addText("Use the UI for workflow.", {
    x: 0.8, y: 2.5, w: 11.5, h: 0.55, fontSize: 28, bold: true, color: C.white, fontFace: "Calibri",
  });
  s.addText("The API owns the truth of every naira.", {
    x: 0.8, y: 3.2, w: 11.5, h: 0.5, fontSize: 24, color: "D6E6F5", fontFace: "Calibri",
  });
  s.addText("See also: Solar-Accounting-System.pptx · docs/critical-workflows.md · docs/vercel-online-database.md", {
    x: 0.8, y: 5.8, w: 11.5, h: 0.4, fontSize: 13, color: "B8C9DC", fontFace: "Calibri",
  });
  slideNo += 1;
}

await pptx.writeFile({ fileName: outFile });
console.log(`Wrote ${outFile} (${slideNo} slides)`);
