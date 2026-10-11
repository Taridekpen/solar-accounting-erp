/**
 * Accountant-facing guide: what the platform and accounting engine do.
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
pptx.title = "How It Works — Accountant Guide";
pptx.subject = "Accounting engine, branches, and how each module updates the books";

let slideNo = 0;

function footer(slide) {
  slideNo += 1;
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 7.15, w: 13.333, h: 0.35, fill: { color: C.navy },
  });
  slide.addText("Solar Accounting · Accountant guide · Confidential", {
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
  s.addText("How the books work", {
    x: 0.7, y: 2.0, w: 12, h: 0.6, fontSize: 36, bold: true, color: C.white, fontFace: "Calibri",
  });
  s.addText("A guide for accountants — what the system does, how branches and head office work,\nand how every module updates the ledgers", {
    x: 0.7, y: 2.75, w: 12, h: 0.85, fontSize: 18, color: "D6E6F5", fontFace: "Calibri",
  });
  s.addText("Solar & Inverter Co. · One company · Many branches · Nigerian Naira (NGN)", {
    x: 0.7, y: 5.9, w: 12, h: 0.35, fontSize: 14, color: "B8C9DC", fontFace: "Calibri",
  });
  slideNo += 1;
}

// 2 What this system is
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "What this system is", "End-to-end books for a solar and inverter business");
  bullets(s, [
    "One platform for trading panels, inverters, and accessories, plus installation projects.",
    "Covers the full finance cycle: sales and collections, purchasing and payments, inventory costing, expenses, banking, payroll summaries, period close, and management reports.",
    "Every naira that moves through operations is recorded as a balanced journal in the general ledger.",
    "Dashboard totals, aging, trial balance, profit and loss, and balance sheet all read from those posted journals — not from separate spreadsheet figures.",
    "Designed so branch staff process documents while accountants control the books, approvals, and period locks.",
  ], { fontSize: 15, gap: 8 });
  footer(s);
}

// 3 Who uses what
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Who uses what", "Menus and actions follow each person’s role");
  twoCol(
    s,
    "Typical roles",
    [
      "Sales / cashier — quotations, invoices, receipts at their branch.",
      "Branch manager — approvals within the branch purchase limit; daily close review.",
      "Procurement — requisitions, purchase orders, goods receipts, supplier bills.",
      "Accountant — journals, reports, banking, payroll summaries, period close.",
      "Auditor — read-only review of books, imports, and audit history.",
      "Company admin — users, branches, mappings, company settings.",
    ],
    "What you see",
    [
      "The sidebar only lists modules your role may open.",
      "You cannot approve your own expense or requisition when dual control applies.",
      "Company-wide roles can work across all branches; others stay within assigned branches.",
      "Sensitive supplier bank details show only the last four digits.",
      "If a menu item is missing, your role was not given that permission.",
    ],
  );
  footer(s);
}

// 4 Head office vs branches
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Head office vs branches", "One legal company; many operating locations");
  s.addImage({
    path: assets("multi-branch-org.jpg"),
    x: 8.6, y: 1.4, w: 4.3, h: 5.4,
  });
  bullets(s, [
    "There is one company entity. Branches are operating units (shops, warehouses, head office), not separate legal companies.",
    "Head office (and company-wide roles) can see and approve across the whole company when their role allows it.",
    "Branch users are assigned to one or more branches. They cannot open another branch’s customers, stock, or journals.",
    "Departments and employees sit under the company and are linked to branches for reporting and payroll context.",
    "Deactivating a branch stops new work there but keeps history readable for assigned users.",
    "Central procurement and large approvals typically require a company-wide approver.",
  ], { x: 0.5, y: 1.35, w: 7.8, h: 5.4, fontSize: 13, gap: 6 });
  footer(s);
}

// 5 Branch context
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Working in branch context", "The header filter shapes every screen and report");
  bullets(s, [
    "At the top of the app, choose All branches, one branch, or several of your assigned branches.",
    "Dashboard, sales, stock, expenses, banking, projects, and reports all follow that selection.",
    "Choosing one branch means you only see that branch’s documents, stock, and journal lines.",
    "Choosing several branches combines those branches for comparison without including locations you did not select.",
    "Company-wide users may start with all branches, then narrow the view when they want a single location’s pack.",
    "Branch-restricted users never expand beyond their assignments — the filter can only narrow what they already may see.",
  ], { fontSize: 14, gap: 7 });
  footer(s);
}

// 6 Money rules
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Money rules", "Naira amounts stay exact from document to ledger");
  twoCol(
    s,
    "How amounts work",
    [
      "Currency is Nigerian Naira (NGN).",
      "Totals, tax, discounts, and costs are calculated by the system when you finalize or approve — not typed as free-form “guess” totals on the screen.",
      "Printed invoices, PDFs, and on-screen reports use the same calculated figures.",
      "Dashboard cards show four-decimal strings so nothing is rounded away silently.",
    ],
    "What this protects",
    [
      "Branch A’s sale cannot change Branch B’s cash or stock.",
      "A receipt that settles an invoice does not post revenue a second time.",
      "With no posted journals, every total stays zero — the system never invents sample profit.",
      "Opening stock must reconcile quantity and value to the inventory control account.",
    ],
  );
  footer(s);
}

// 7 Accounting engine overview
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "The accounting engine", "One path for every movement of money and cost");
  s.addImage({
    path: assets("posting-engine.jpg"),
    x: 8.6, y: 1.4, w: 4.3, h: 5.4,
  });
  bullets(s, [
    "Sales, purchases, expenses, banking, projects, payroll summaries, fixed assets, and opening imports all post through the same accounting engine.",
    "Modules prepare the business document; the engine writes the balanced debit and credit lines.",
    "No module is allowed to edit ledger lines on its own — that keeps the trial balance trustworthy.",
    "Account balances, aging control accounts, and management reports are built from posted journal lines only.",
    "If a posting fails (closed period, unbalanced opening, missing mapping), the document does not silently leave half-updated books.",
  ], { x: 0.5, y: 1.35, w: 7.8, h: 5.4, fontSize: 14, gap: 7 });
  footer(s);
}

// 8 Journal rules
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Journal rules", "Posted history is permanent");
  twoCol(
    s,
    "After a journal is posted",
    [
      "It cannot be edited or deleted.",
      "To correct a mistake, post a reversal journal that preserves the original.",
      "The same journal cannot be reversed twice.",
      "Document numbers stay unique so each invoice, receipt, or bill remains traceable.",
    ],
    "Fiscal periods",
    [
      "Periods for the current year start open.",
      "A closed period rejects ordinary posting.",
      "Only an approved closed-period adjustment may post into a closed period.",
      "Year-end close can roll income and expense into retained earnings and open the next year after statements are stored.",
    ],
  );
  footer(s);
}

// 9 CoA and mappings
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Chart of accounts and mappings", "Which accounts move for each business event");
  bullets(s, [
    "The company starts with a seeded chart of accounts (cash, bank, AR, inventory, AP, revenue, cost of sales, expenses, salaries payable, and more).",
    "Accounting mappings tell the engine which accounts to debit and credit for each event — for example cash sale, credit sale, cost of sales, customer receipt, goods receipt, supplier bill, expense, bank transfer, salary accrual, depreciation.",
    "Expense categories must map to postable expense accounts — not inventory or fixed-asset accounts.",
    "Bank accounts each link to a general ledger cash or bank account so book balances match the ledger.",
    "Tax codes carry effective dates; a tax payment outside those dates is rejected.",
    "Accountants maintain mappings and the chart carefully — wrong mappings mean wrong books even when staff follow the right workflow.",
  ], { fontSize: 13, gap: 6 });
  footer(s);
}

// 10 Lifecycle of a posting
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Lifecycle of a posting", "From business action to updated platform");
  flowBoxes(s, ["Document ready", "Approve / finalize", "Balanced journal", "Stock if needed", "Reports refresh"], 1.55);
  bullets(s, [
    "Staff create a draft (invoice, goods receipt, expense, transfer, payroll summary, and so on).",
    "When the document is finalized or approved (often by a second person), the engine builds balanced debit and credit lines.",
    "The ledger updates immediately; related stock movements happen in the same business step when inventory is involved.",
    "Dashboard KPIs, aging, trial balance, P&L, and balance sheet recalculate from the new posted lines the next time you open them.",
    "Audit history records who changed company settings, mappings, and other controlled configuration.",
  ], { y: 2.9, fontSize: 13, gap: 5 });
  footer(s);
}

// 11 Dashboard
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Dashboard", "Live picture of the books for your branch filter and dates");
  twoCol(
    s,
    "What you do",
    [
      "Open Dashboard after sign-in.",
      "Pick a date preset or custom range (month, period, and so on).",
      "Set the branch filter to one location, several, or all you may see.",
      "Open a KPI card to see the journal lines behind that total.",
      "Review charts for revenue, expenses, branch sales/profit, and cash movement.",
    ],
    "What updates / what you see",
    [
      "Sales, purchases, gross profit, expenses, cash, receivables, payables, and inventory valuation come from posted journals.",
      "Net profit = revenue − cost of sales − operating expenses from those lines.",
      "Empty books show zeros — never placeholder profit.",
      "Pending approvals point you to the accounting review queue.",
      "Changing branch or dates refreshes every card to match that scope.",
    ],
  );
  footer(s);
}

// 12 Sales
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Customers and sales", "From quotation to cash without double-counting revenue");
  twoCol(
    s,
    "What you do",
    [
      "Maintain customers (company-wide masters, linked to branches).",
      "Raise quotations (no revenue yet). Accept into a draft invoice when ready.",
      "Finalize a cash or credit invoice for the selling branch.",
      "Collect a receipt and allocate it to invoices or record a customer advance.",
      "Issue credit notes when goods or charges must be reversed.",
    ],
    "What updates in the books",
    [
      "Finalize posts one journal: revenue (+ tax if applicable) and AR or cash/bank.",
      "Product lines issue stock and post cost of sales at weighted-average cost (or catalog cost if average is still zero).",
      "Receipt settles AR or credits customer advances — it does not post revenue again.",
      "Credit notes reverse revenue, tax, and inventory cost at the original line cost.",
      "Customer statements, aging, and product rankings follow posted sales documents.",
    ],
  );
  footer(s);
}

// 13 Purchases
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Suppliers and purchases", "Order → receive → bill → pay");
  flowBoxes(s, ["Requisition / PO", "Approve", "Goods receipt", "Supplier bill", "Payment"], 1.45);
  bullets(s, [
    "Requisition or PO: dual control; branch approvers up to the company purchase limit; larger amounts need a company-wide approver. A PO does not post a journal.",
    "Goods receipt: stock rises at the branch main warehouse; inventory is debited against Goods Received Not Invoiced (GRNI).",
    "Supplier bill: clears the GRNI accrual, records price differences, and creates Accounts Payable (with tax where mapped).",
    "Payment: settles bills or records a supplier deposit from cash/bank — AP aging and cash movement update together.",
    "Supplier statements and dashboard payable aging come from posted bills, not from open POs alone.",
  ], { y: 2.75, fontSize: 12, gap: 5 });
  footer(s);
}

// 14 Inventory
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Inventory, warehouses, and costing", "Where stock sits and what it costs");
  s.addImage({
    path: assets("warehouse-stock.jpg"),
    x: 8.6, y: 1.4, w: 4.3, h: 5.4,
  });
  bullets(s, [
    "Each branch has a main warehouse and an in-transit warehouse. Sellable quantity is the branch balance excluding stock still in transit.",
    "Receipts, openings, and customer returns recalculate branch weighted-average cost used on the next sale’s cost of sales.",
    "Inter-branch transfer: draft → approve (different user) → ship → receive. Shipping moves value to Inventory in Transit; receiving lands it at the destination. Company inventory total is unchanged.",
    "Stock count: book quantity is recorded; a different user posts variance (shortage to expense, surplus to income) against inventory.",
    "Serial-tracked items need one in-stock serial at the selling branch per unit; the same serial cannot be sold twice.",
  ], { x: 0.5, y: 1.35, w: 7.8, h: 5.4, fontSize: 12, gap: 5 });
  footer(s);
}

// 15 Expenses
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Expenses", "Dual control, budgets, then the ledger");
  twoCol(
    s,
    "What you do",
    [
      "Create a draft with category, branch, amount, and receipt details.",
      "Submit for approval — the creator cannot approve their own claim.",
      "Branch approvers work within the purchase limit; larger amounts need company-wide approval.",
      "A later approval level, when required, must be a different person.",
      "A different user pays an approved expense from a cash or bank account.",
    ],
    "What updates in the books",
    [
      "Approval debits the expense category and credits accrued expenses (tax may debit prepaid tax).",
      "Rejection posts nothing.",
      "Payment clears the accrual from cash/bank; a second payment is blocked.",
      "A monthly budget can block approval when the category would overspend.",
      "Reports cover branch, category, department, project, pending, unpaid, and budget versus actual.",
    ],
  );
  footer(s);
}

// 16 Banking
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Banking and cash", "Book balance, transfers, statements, and lock");
  twoCol(
    s,
    "What you do",
    [
      "Maintain bank accounts and cash drawers linked to ledger accounts.",
      "Record same-day transfers/deposits or later-dated transfers that use Bank Transfers in Transit.",
      "Import or enter statement lines; accept suggested matches or match by hand.",
      "Post bank charges and interest when they appear on the statement.",
      "Have a different user lock the statement when reconciliation is complete.",
      "Cash count: compare counted cash to the drawer; another user posts shortage or overage.",
    ],
    "What updates in the books",
    [
      "Book balances are calculated only from posted cash and bank journal lines.",
      "Transfers move value between asset accounts — they do not hit income or expense.",
      "Charges and interest post through the engine to the mapped accounts.",
      "A locked statement rejects further changes.",
      "Cash book shows opening, receipts, payments, and closing for the selected scope.",
      "Matching does not change invoice status by itself — receipts and payments do.",
    ],
  );
  footer(s);
}

// 17 Projects
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Installation projects", "Contract, materials, revenue, and WIP");
  twoCol(
    s,
    "What you do",
    [
      "Open a project with contract value, quotation link, and budget.",
      "Reserve materials, then have a different user approve the issue.",
      "Take customer deposits against the project.",
      "Raise milestone invoices as work is recognized.",
      "Link expenses to the project when they belong in WIP.",
    ],
    "What updates in the books",
    [
      "Installation issues debit work in progress and credit inventory; maintenance can debit installation cost immediately.",
      "Returns put quantity back at the issued cost.",
      "Deposits debit cash/bank and credit customer advances — not revenue.",
      "Milestone invoices debit AR and credit installation/maintenance revenue; cost is recognized from remaining WIP in proportion to the milestone.",
      "Dashboard project counts and profitability use journals inside your date range.",
    ],
  );
  footer(s);
}

// 18 Accounting workspace
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Accounting workspace", "Manual journals, ledgers, assets, and tax");
  bullets(s, [
    "General journal entries still go through approval before they post — same permanence rules as system journals.",
    "General ledger, trial balance, and account inquiry show posted lines only.",
    "Receivable and payable sub-ledgers must agree with their control accounts; inventory ledger shows quantity and value by product and warehouse.",
    "Fixed assets: acquisition, straight-line depreciation, and disposal each post balanced journals.",
    "Tax codes and payments respect effective dates so you cannot apply an expired code.",
    "PDF, spreadsheet, and CSV downloads use the same rows you see on screen.",
  ], { fontSize: 14, gap: 7 });
  footer(s);
}

// 19 Reports
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Financial reports", "Management packs from the same journals");
  twoCol(
    s,
    "Statements",
    [
      "Profit and loss — compare another period, year to date, branches, and statement budget.",
      "Balance sheet — includes current-year profit.",
      "On a branch balance sheet, interbranch clearing keeps Assets = Liabilities + Equity.",
      "At company level, interbranch clearing nets to zero.",
      "Cash flow uses the indirect method; internal cash↔bank transfers do not inflate profit or company cash.",
    ],
    "How to use them",
    [
      "Always set branch filter and dates before reading totals.",
      "Drill from dashboard cards into the lines that built a figure.",
      "Use aging and control accounts to prove AR, AP, and inventory.",
      "After month close, closed-period adjustments are the only way into locked months.",
      "Export the same pack for board or auditors without re-keying.",
    ],
  );
  footer(s);
}

// 20 Daily closing
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Daily closing", "Branch day pack with dual review");
  bullets(s, [
    "Each branch day stores sales, collections, credit sales, expenses, refunds, inventory exceptions, pending approvals, and the cash-count difference.",
    "Figures are taken from posted activity for that day — not from a separate manual sheet that can drift.",
    "A reviewer who is not the preparer signs off the day.",
    "Once reviewed, the stored figures stay with that day for later audit.",
    "Use daily close to catch cash differences and unfinished approvals before month end.",
  ], { fontSize: 15, gap: 8 });
  footer(s);
}

// 21 Period close
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Month and period close", "Checklist, second person, then lock");
  flowBoxes(s, ["Open period", "Closing + checklist", "Second approval", "Locked", "Reopen if allowed"], 1.55);
  bullets(s, [
    "Month close moves a period from open to closing and records the twelve checklist results.",
    "Only another person can approve the lock. After lock, ordinary posting is rejected.",
    "Reopening requires the reopen permission and a written reason.",
    "Locking the last month of a year can store statements, close income and expense into retained earnings, and open the next year — the snapshot keeps profit from before that transfer.",
    "Closed-period adjustments remain the controlled exception path for true late corrections.",
  ], { y: 2.9, fontSize: 13, gap: 5 });
  footer(s);
}

// 22 Payroll
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Payroll summaries", "External payroll, controlled posting inside the books");
  twoCol(
    s,
    "What you do",
    [
      "Keep employees on the directory (branch, department, status) — not salary amounts on the person record.",
      "Enter an approved summary from your external payroll process.",
      "A different person must approve the summary before it posts.",
      "Record salary payments (including partial settlement) against one or more summaries.",
      "Post only into an open fiscal period.",
    ],
    "What updates in the books",
    [
      "Approval posts gross salary expense, deduction liabilities, and salaries payable.",
      "Payments clear salaries payable from cash or bank.",
      "Outstanding totals should agree with the salaries payable control account.",
      "Nothing posts until the second person approves.",
      "This keeps payroll processing outside the system while the general ledger stays complete.",
    ],
  );
  footer(s);
}

// 23 Users and approvals
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Users, roles, and approvals", "Separation of duties across head office and branches");
  bullets(s, [
    "Invite users, assign roles, and attach branch assignments for anyone who is not company-wide.",
    "Company-wide roles are not limited to a branch list; everyone else only sees assigned branches.",
    "Approval policies, delegations, and separation rules stop the same person from creating and approving where dual control is required.",
    "Purchase and expense limits: branch approvers up to the company limit; above that, company-wide approval.",
    "Suspend a user or revoke sessions when access must stop immediately.",
    "Privileged finance roles may require authenticator (MFA) before they can work in the books.",
  ], { fontSize: 14, gap: 7 });
  footer(s);
}

// 24 Settings and documents
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Settings and documents", "Configuration that shapes every posting");
  twoCol(
    s,
    "Settings hub",
    [
      "Company profile and logo.",
      "Document templates for customer-facing printouts.",
      "Accounting mappings and tax codes.",
      "Fiscal period status overview.",
      "Approval policies, delegations, and separation rules.",
      "Searchable audit history of controlled changes.",
    ],
    "What changes when you edit",
    [
      "Mapping or tax edits change how future documents post — review carefully.",
      "Company and branch changes are written to immutable audit events (sensitive values redacted).",
      "Managed documents (attachments, logo) respect size and type rules and branch-aware access.",
      "Wrong configuration is a books risk even when staff follow screens correctly.",
    ],
  );
  footer(s);
}

// 25 Notifications
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Notifications accountants care about", "Work that needs your attention");
  bullets(s, [
    "Approval requests and outcomes — so dual control does not stall sales, purchases, or expenses.",
    "Overdue customer invoices — collections focus.",
    "Low stock — purchasing and transfer planning.",
    "Supplier bills due — cash planning and AP.",
    "Failed postings — investigate before month end.",
    "Period-closing reminders — checklist and lock on time.",
  ], { fontSize: 15, gap: 8 });
  footer(s);
}

// 26 Data import
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Data import (opening the books)", "Staged CSV with dual control");
  flowBoxes(s, ["Upload CSV", "Validate", "Preview", "Approve", "Commit"], 1.55);
  bullets(s, [
    "Use Data Import to bring masters and opening balances when going live or catching up history.",
    "Pipeline: upload → parse → validate → preview → a different user approves → commit → stored report.",
    "Unbalanced opening trial balance or bank opening batches cannot be approved or committed.",
    "Commit posts opening financials through the same accounting engine as day-to-day work — not as free-hand ledger edits.",
    "After commit, confirm control accounts, inventory quantity/value, and the import report before trading.",
  ], { y: 2.9, fontSize: 13, gap: 5 });
  footer(s);
}

// 27 Platform sync
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "How the platform stays in sync", "One action, many places that refresh");
  bullets(s, [
    "Finalize or approve a document → document status changes (draft to posted/paid/received).",
    "If stock is involved → warehouse quantities and average cost update in the same step.",
    "The accounting engine posts the journal → every report that reads journals reflects the new lines.",
    "Dashboard, aging, trial balance, P&L, balance sheet, cash book, and project profitability stay aligned because they share one ledger.",
    "Branch filter only changes which slice you view — it does not create a second set of books.",
    "Notifications and pending-approval queues update so the next reviewer sees the work.",
  ], { fontSize: 14, gap: 7 });
  footer(s);
}

// 28 What never changes
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "What never changes after posting", "Integrity rules to teach every branch");
  bullets(s, [
    "No silent edit of a posted journal — reverse and, if needed, enter a new correct document.",
    "No second receipt that “adds” the same revenue again — receipts settle AR or advances only.",
    "No posting into a closed period without an approved closed-period adjustment.",
    "No self-approval where dual control is required.",
    "No selling serials or quantities the branch does not hold (including stock still in transit).",
    "No unbalanced opening import — the books must balance before commit.",
  ], { fontSize: 15, gap: 8 });
  footer(s);
}

// 29 Quick reference
{
  const s = pptx.addSlide();
  softBg(s);
  titleBar(s, "Quick reference — when the books update", "Module → ledger and stock effect");
  bullets(s, [
    "Finalize invoice → AR or cash, revenue (+ tax), inventory ↓, cost of sales.",
    "Customer receipt → cash/bank ↑, AR ↓ or customer advances ↑ (no new revenue).",
    "Goods receipt → inventory ↑, GRNI ↑; supplier bill → GRNI ↓, AP ↑ (variance as mapped).",
    "Supplier / expense payment → AP or accruals ↓, cash/bank ↓.",
    "Expense approval → expense ↑, accrued expenses ↑; payment clears the accrual.",
    "Bank transfer → one cash/bank ↑, another ↓ (or via transfers in transit).",
    "Project issue → WIP or project cost ↑, inventory ↓; milestone invoice → AR + revenue + cost recognition.",
    "Payroll summary approve → salary expense + deductions + salaries payable; payment clears payable.",
    "Stock count variance / FA depreciate / import commit → journals through the same engine.",
  ], { fontSize: 12, gap: 4 });
  footer(s);
}

// 30 Close
{
  const s = pptx.addSlide();
  s.addImage({ path: assets("hero-solar-business.jpg"), x: 0, y: 0, w: 13.333, h: 7.5 });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.navy, transparency: 40 },
  });
  s.addText("One company. Clear branches. One ledger.", {
    x: 0.8, y: 2.4, w: 11.5, h: 0.55, fontSize: 28, bold: true, color: C.white, fontFace: "Calibri",
  });
  s.addText("Every module updates the same books through the accounting engine —\nso dashboard, reports, and period close always tell one story.", {
    x: 0.8, y: 3.15, w: 11.5, h: 0.8, fontSize: 18, color: "D6E6F5", fontFace: "Calibri",
  });
  s.addText("For a shorter stakeholder overview, see Solar-Accounting-System.pptx", {
    x: 0.8, y: 5.9, w: 11.5, h: 0.35, fontSize: 13, color: "B8C9DC", fontFace: "Calibri",
  });
  slideNo += 1;
}

await pptx.writeFile({ fileName: outFile });
console.log(`Wrote ${outFile} (${slideNo} slides)`);
