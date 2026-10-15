/**
 * Accountant / controller guide PDF — posting engine, mappings, page-by-page ledger effects.
 * Run: node docs/tutorials/build-accountant-guide-pdf.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(__dirname, "Solar-Accounting-Accountant-Guide.pdf");

const C = {
  navy: "#0B1F3A",
  accent: "#1B6CA8",
  teal: "#0E7C7B",
  ink: "#1A2332",
  muted: "#5B6B7C",
  soft: "#F2F6FA",
  tip: "#EEF6FB",
  tipBorder: "#1B6CA8",
  white: "#FFFFFF",
  rowAlt: "#F7FAFC",
};

const MARGIN = 50;
const PAGE_W = 612;
const PAGE_H = 792;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 42;
const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 16;

const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: MARGIN, bottom: FOOTER_H + 16, left: MARGIN, right: MARGIN },
  bufferPages: true,
  info: {
    Title: "Solar Accounting — Accountant Guide",
    Author: "Solar & Inverter Co.",
    Subject: "Posting engine, accounting rules, and every screen for controllers",
  },
});

const stream = fs.createWriteStream(outFile);
doc.pipe(stream);

function ensureSpace(needed) {
  if (doc.y + needed > CONTENT_BOTTOM) {
    doc.addPage();
  }
}

function h1(text) {
  if (doc.y > MARGIN + 40) {
    doc.addPage();
  }
  doc.moveDown(0.2);
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(17).text(text, { width: CONTENT_W });
  doc.moveDown(0.3);
  doc.strokeColor(C.accent).lineWidth(2).moveTo(MARGIN, doc.y).lineTo(MARGIN + 72, doc.y).stroke();
  doc.moveDown(0.45);
}

function h2(text) {
  ensureSpace(32);
  doc.moveDown(0.2);
  doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(12.5).text(text, { width: CONTENT_W });
  doc.moveDown(0.25);
}

function para(text) {
  ensureSpace(26);
  doc.fillColor(C.ink).font("Helvetica").fontSize(10).text(text, { width: CONTENT_W, lineGap: 2 });
  doc.moveDown(0.3);
}

function bullet(items) {
  for (const item of items) {
    ensureSpace(20);
    doc.fillColor(C.ink).font("Helvetica").fontSize(10).text(`•  ${item}`, { width: CONTENT_W, lineGap: 1.5 });
    doc.moveDown(0.12);
  }
  doc.moveDown(0.2);
}

function tip(label, text) {
  ensureSpace(48);
  const startY = doc.y;
  doc.font("Helvetica").fontSize(9.5);
  const height = doc.heightOfString(text, { width: CONTENT_W - 28 }) + 22;
  ensureSpace(height + 8);
  doc.roundedRect(MARGIN, startY, CONTENT_W, height, 5).fillAndStroke(C.tip, C.tipBorder);
  doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(8.5).text(label, MARGIN + 12, startY + 7);
  doc.fillColor(C.ink).font("Helvetica").fontSize(9.5).text(text, MARGIN + 12, startY + 18, { width: CONTENT_W - 24 });
  doc.y = startY + height + 8;
}

function pageSection(title, purpose, functions, ledger) {
  h2(title);
  para(purpose);
  if (functions?.length) {
    doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(9).text("Key functions");
    doc.moveDown(0.15);
    bullet(functions);
  }
  if (ledger?.length) {
    doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(9).text("Ledger / stock effect");
    doc.moveDown(0.15);
    bullet(ledger);
  }
}

/** Simple 4-column table: Event | Debit | Credit | Notes */
function eventTable(rows) {
  const cols = [140, 70, 70, CONTENT_W - 140 - 70 - 70];
  const headers = ["Event code", "Debit", "Credit", "Meaning / tax"];
  ensureSpace(28);
  let x = MARGIN;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(C.white);
  doc.rect(MARGIN, doc.y, CONTENT_W, 16).fill(C.navy);
  headers.forEach((h, i) => {
    doc.fillColor(C.white).text(h, x + 3, doc.y + 4, { width: cols[i] - 6, lineBreak: false });
    x += cols[i];
  });
  doc.y += 18;

  rows.forEach((row, idx) => {
    const cells = [row.code, row.dr, row.cr, row.note];
    doc.font("Helvetica").fontSize(8);
    const heights = cells.map((c, i) => doc.heightOfString(c, { width: cols[i] - 6 }));
    const rowH = Math.max(14, ...heights) + 6;
    ensureSpace(rowH + 2);
    if (idx % 2 === 1) {
      doc.rect(MARGIN, doc.y, CONTENT_W, rowH).fill(C.rowAlt);
    }
    x = MARGIN;
    const y = doc.y + 3;
    cells.forEach((c, i) => {
      doc.fillColor(C.ink).text(c, x + 3, y, { width: cols[i] - 6 });
      x += cols[i];
    });
    doc.y += rowH;
  });
  doc.moveDown(0.4);
}

// ——— Cover ———
{
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.navy);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(26);
  doc.text("Solar Accounting", MARGIN, 200, { width: CONTENT_W });
  doc.fontSize(20).text("Accountant Guide", MARGIN, doc.y + 8, { width: CONTENT_W });
  doc.font("Helvetica").fontSize(12).fillColor("#B8C9DC");
  doc.text(
    "Posting engine, chart mappings, and every screen\nexplained for accountants and controllers.",
    MARGIN,
    doc.y + 22,
    { width: CONTENT_W, lineGap: 4 },
  );
  doc.fontSize(11).fillColor("#8FA8C4").text(
    "Ledger truth · Event catalog · Dual control · Period lock",
    MARGIN,
    660,
    { width: CONTENT_W },
  );
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fillColor(C.white).fontSize(9).text("Confidential", MARGIN, PAGE_H - 36, {
    width: CONTENT_W,
    align: "right",
    lineBreak: false,
  });
  doc.page.margins.bottom = prevBottom;
}

doc.addPage();

// 1 How to use
h1("1. How to use this guide");
para(
  "This guide is for accountants, financial controllers, and head-office reviewers. It explains what each page is for, which functions change the books, and which accounting rules the posting engine applies.",
);
bullet([
  "The separate End-User Guide (staff PDF) covers click-by-click paths for sales, stock, and expenses without ledger jargon.",
  "The How-It-Works PowerPoint is a slide overview. This PDF is the detailed rulebook.",
  "Amounts are Nigerian Naira with four decimal places in storage. Reports round for display but the ledger keeps exact values.",
  "If a button is missing, the user’s role lacks the permission — that is intentional dual control, not a bug.",
]);
tip("CONTROL RULE", "Dashboard KPIs, trial balance, P&L, aging, and inventory valuation are built only from posted journal lines. Draft documents never invent profit.");

// 2 Company model
h1("2. Company model");
h2("One legal entity, many branches");
para(
  "The platform runs one company chart of accounts and one set of fiscal periods. Branches are operating locations (shops, warehouses, project sites). Head office can see company-wide data; branch users are limited to assigned branches.",
);
bullet([
  "Header branch filter scopes lists, totals, and many reports to All, one, or several allowed branches.",
  "Journal lines always carry a branch id so branch P&L and cash can be cut without splitting the chart.",
  "Customers and suppliers are company masters; sales and purchases still post on the operating branch.",
  "Document numbers (invoices, POs, journals) stay unique so every entry is traceable.",
]);
h2("Money rules");
bullet([
  "Every journal must balance: sum of debits equals sum of credits.",
  "Modules never edit posted ledger lines directly; they call the accounting posting engine.",
  "Failed postings leave no silent half-updated books — the document stays unposted and a posting attempt is recorded when applicable.",
]);

// 3 Chart of accounts
h1("3. Chart of accounts");
para(
  "The Chart of Accounts screen lists seeded and company accounts. Accountants maintain the structure; day-to-day staff rarely post here. Control accounts (AR, AP, inventory, cash/bank) should receive activity through mapped business events, not casual manual journals.",
);
bullet([
  "Postable accounts can appear on journal lines; non-postable headers organize the tree.",
  "Control flags mark accounts that summarize subledgers (AR, AP) — keep them reconciled to aging.",
  "Bank accounts in Banking each link to a GL cash or bank account so book balance matches the ledger.",
  "Expense categories must map to postable expense accounts — never inventory or fixed-asset accounts.",
]);
h2("Where mappings live");
para(
  "Settings → Accounting holds event mappings: for each event code, which account is debited, which is credited, and optional tax account. Wrong mappings mean wrong books even when staff follow the correct workflow. Changes are audited.",
);

// 4 Posting engine deep
h1("4. The posting engine");
para(
  "One accounting service posts every movement of money and inventory cost: sales, purchases, expenses, banking, projects, payroll summaries, fixed assets, opening imports, manual journals, and reversals. Modules prepare the business document; the engine writes balanced debit and credit lines.",
);

h2("Lifecycle");
bullet([
  "Staff create a draft document (invoice, goods receipt, expense, transfer, payroll summary, and so on).",
  "Finalize or approve (often by a second person) triggers the engine.",
  "The engine looks up the event mapping (or uses explicit lines for multi-line system documents).",
  "It validates period status, balance, branch scope, and stock rules when stock moves are attached.",
  "On success: journal is posted (or held pending approval for restricted manual work), stock moves apply in the same step when needed, and reports refresh from posted lines thereafter.",
  "On failure: nothing silent is left half-posted; failed or suspicious attempts are available in the Accounting review queues.",
]);

h2("Event mapping path (postEvent)");
para(
  "For simple two-sided events the engine loads the company mapping for the event code. Net amount must be greater than zero. Optional tax uses the mapped tax account and tax side:",
);
bullet([
  "Tax side credit (typical sales VAT): debit gross on the debit account; credit net on the credit account; credit tax on the tax account.",
  "Tax side debit (typical input tax on inventory purchases): debit net + tax lines as configured; credit gross on the credit account.",
  "Missing mapping, missing tax account when tax > 0, or unrecognized event codes reject the posting.",
]);

h2("System documents (multi-line)");
para(
  "Sales finalize, purchase receipts/bills, and similar flows often call a system-document path with fully built lines (and optional stock moves). The same journal rules apply: balance, open period, branch scope, and immutability after post.",
);

h2("Manual journals");
bullet([
  "Created from the Accounting workspace; typically pending approval.",
  "The creator cannot approve their own journal (separation of duties).",
  "Closed periods reject ordinary manuals unless flagged as a closed-period adjustment and approved under that rule.",
]);

h2("Reversals");
bullet([
  "Posted journals cannot be edited or deleted.",
  "A reversal creates a new journal with debit and credit swapped on each line, linked to the original.",
  "The same journal cannot be reversed twice.",
  "If the original period is closed, the reversal is treated as a closed-period adjustment path.",
]);

h2("Opening balances");
bullet([
  "Imported or entered opening packs must reconcile detail kinds (cash, bank, inventory, AR invoices, AP bills, assets, depreciation, loans, equity) to the journal lines.",
  "Unbalanced opening trial balances cannot be approved or committed through Data Import.",
  "Opening stock can carry quantity and unit cost so weighted-average cost starts correctly.",
]);

h2("Fiscal periods");
bullet([
  "Periods for the current year start open.",
  "A closed period rejects ordinary posting.",
  "Only an approved closed-period adjustment may post into a closed period.",
  "Year-end close can roll income and expense into retained earnings and open the next year after statements are stored (Closing module).",
]);

h2("Stock moves with journals");
para(
  "When inventory is involved, stock movements (sales issue, purchase receipt, transfer out/in, customer return, project issue, adjustment) travel with the posting transaction so quantity, weighted-average cost, and COGS stay aligned with the ledger.",
);
bullet([
  "sales_issue — reduces sellable qty at the branch warehouse; COGS uses weighted-average unit cost (catalog cost only if average is still zero).",
  "purchase_receipt — increases qty and recalculates weighted-average cost.",
  "customer_return — restores qty at the cost used on the original sale line.",
  "transfer_out / transfer_in — moves value through Inventory in Transit; company inventory total unchanged.",
  "project_issue / project_return — moves stock to WIP or project cost and back at issued cost.",
  "adjustment_in / adjustment_out — count variances and controlled write-ons/offs.",
]);

h2("How the platform stays in sync");
bullet([
  "Finalize or approve a document → document status changes (draft to posted/paid/received).",
  "If stock is involved → warehouse quantities and average cost update in the same step.",
  "The engine posts the journal → every report that reads journals reflects the new lines.",
  "Dashboard, aging, trial balance, P&L, balance sheet, cash book, and project profitability stay aligned because they share one ledger.",
  "Branch filter only changes which slice you view — it does not create a second set of books.",
]);
tip(
  "INTEGRITY",
  "Never invent a “corrected” total outside the system. Investigate with trial balance, document drill-down, and posting attempt queues.",
);

h1("4b. Default account code legend");
para("Seeded chart codes referenced by the default event catalog (remap in Settings if your chart differs):");
bullet([
  "1000 Cash · 1100 Bank · 1200 Accounts receivable · 1300 Inventory · 1500 Prepaid / input tax (typical) · 1600 Fixed assets · 1650 Accumulated depreciation",
  "2000 Accounts payable · 2100 Customer advances · 2200 Accrued expenses · 2300 Salaries payable · 2400 Output tax / VAT payable · 2600 Loans",
  "4000 Sales revenue · 5000 Cost of sales · 6000 Salary expense · 6700 Depreciation expense · 6900 Operating expenses (generic)",
]);
para(
  "GRNI (Goods Received Not Invoiced) is the accrual clearing account used between goods receipt and supplier bill. Interbranch clearing appears on branch balance sheets so Assets = Liabilities + Equity; at company level it nets to zero.",
);

// 5 Event catalog
h1("5. Event mapping catalog");
para(
  "Default seeded account codes (company mappings can be remapped in Settings). Codes below match the accounting-rules catalog shipped with the product.",
);
eventTable([
  { code: "cash_sale", dr: "1000", cr: "4000", note: "Cash/bank ← Revenue; tax 2400 credit" },
  { code: "cash_sale_cogs", dr: "5000", cr: "1300", note: "COGS ← Inventory" },
  { code: "credit_sale", dr: "1200", cr: "4000", note: "AR ← Revenue; tax 2400 credit" },
  { code: "credit_sale_cogs", dr: "5000", cr: "1300", note: "COGS ← Inventory" },
  { code: "customer_payment", dr: "1100", cr: "1200", note: "Bank ← AR (no new revenue)" },
  { code: "customer_advance", dr: "1100", cr: "2100", note: "Bank ← Customer advances" },
  { code: "customer_advance_applied", dr: "2100", cr: "1200", note: "Advances ← AR" },
  { code: "supplier_invoice_inventory", dr: "1300", cr: "2000", note: "Inventory ← AP; tax 1500 debit" },
  { code: "supplier_payment", dr: "2000", cr: "1100", note: "AP ← Bank" },
  { code: "operating_expense_paid", dr: "6900", cr: "1000", note: "Expense ← Cash" },
  { code: "accrued_expense", dr: "6900", cr: "2200", note: "Expense ← Accrued expenses" },
  { code: "bank_transfer", dr: "1100", cr: "1000", note: "Bank ← Cash (or linked accounts)" },
  { code: "inventory_cost", dr: "5000", cr: "1300", note: "Generic inventory cost" },
  { code: "fixed_asset_purchase", dr: "1600", cr: "1100", note: "Fixed asset ← Bank" },
  { code: "depreciation", dr: "6700", cr: "1650", note: "Depreciation expense ← Accum. dep." },
  { code: "salary_accrual", dr: "6000", cr: "2300", note: "Salary expense ← Salaries payable" },
  { code: "salary_payment", dr: "2300", cr: "1100", note: "Salaries payable ← Bank" },
]);
para(
  "Purchase goods receipt typically debits Inventory and credits GRNI before the supplier bill clears GRNI into AP. Sales finalize posts revenue and a separate COGS journal with stock issue. Receipts never re-post revenue.",
);

h1("5b. Worked posting examples");
para(
  "Illustrative NGN amounts using default seeded codes. Your live mappings may differ — always confirm Settings → Accounting.",
);
h2("Example A — Credit sale of goods (finalize invoice)");
para("Invoice net 100,000; VAT 7,500; COGS at weighted average 60,000.");
bullet([
  "Journal 1 (credit_sale): Dr 1200 AR 107,500 · Cr 4000 Revenue 100,000 · Cr 2400 VAT 7,500.",
  "Journal 2 (credit_sale_cogs): Dr 5000 COGS 60,000 · Cr 1300 Inventory 60,000; stock move sales_issue.",
  "Customer statement shows 107,500 outstanding until receipt.",
]);
h2("Example B — Customer receipt allocated to that invoice");
bullet([
  "customer_payment: Dr 1100 Bank 107,500 · Cr 1200 AR 107,500.",
  "No revenue line. Aging clears. Cash book shows the receipt.",
]);
h2("Example C — Purchase receive then bill");
bullet([
  "Goods receipt (PO cost 50,000): Dr 1300 Inventory 50,000 · Cr GRNI 50,000; stock purchase_receipt; average cost updates.",
  "Supplier bill same cost: Dr GRNI 50,000 · Cr 2000 AP 50,000 (plus input tax 1500 if billed with VAT on taxSide debit).",
  "If bill cost is 52,000, the 2,000 difference posts as mapped purchase price variance — investigate before close.",
]);
h2("Example D — Expense approve then pay");
bullet([
  "Approval: Dr 6900 (or category account) · Cr 2200 Accrued expenses (tax to prepaid tax if applicable).",
  "Payment by another user: Dr 2200 · Cr 1000/1100 cash or bank.",
  "Rejection after draft: no journal. Second payment blocked.",
]);
h2("Example E — Inter-branch transfer");
bullet([
  "Ship: Inventory at source ↓ · Inventory in Transit ↑ (valuation preserved).",
  "Receive: Transit ↓ · Destination inventory ↑; company inventory total unchanged.",
  "Approve ship/receive under dual control; stock in transit is not sellable.",
]);
h2("Example F — Closed period correction");
bullet([
  "Ordinary finalize into a closed month is rejected.",
  "Controller raises a closed-period adjustment journal (or reversal flagged for closed period), second person approves.",
  "Original posted history remains; the adjustment/reversal is the new permanent trail.",
]);

// 6 Page by page
h1("6. Page-by-page reference");
para(
  "For each sidebar area: purpose, key functions accountants care about, and when the ledger or stock updates. Staff click paths are in the End-User Guide.",
);

pageSection(
  "6.1 Dashboard",
  "Live picture of the books for the selected branch filter and date range.",
  [
    "Change date preset or custom range.",
    "Set branch filter (All / one / several).",
    "Open a KPI card to see underlying journal lines.",
    "Review pending approvals that need accounting attention.",
  ],
  [
    "Sales, purchases, gross profit, expenses, cash, AR, AP, and inventory valuation come from posted journals only.",
    "Net profit = revenue − cost of sales − operating expenses from those lines.",
    "Empty books show zeros — never placeholder profit.",
  ],
);

pageSection(
  "6.2 Customers",
  "Master data for parties who buy. Statements and credit terms support AR control.",
  ["Add/edit customer (type, branch link, credit limit, payment terms).", "Open customer statement."],
  [
    "Creating a customer posts nothing.",
    "AR and aging move when invoices and receipts post.",
    "Credit limits constrain sales operations; they are not ledger accounts.",
  ],
);

pageSection(
  "6.3 Sales",
  "Quotations, invoices, receipts, and returns — revenue recognition and cash collection without double-counting.",
  [
    "Tabs: Invoices, Quotations, Receipts, Returns.",
    "New quotation → later convert/accept into draft invoice.",
    "New invoice: branch, customer, lines, preview totals, save draft, finalize.",
    "New receipt: allocate to invoices or record advance.",
    "New return / credit note for goods or charges.",
    "PDF download for invoices and quotations.",
  ],
  [
    "Quotation: no journal.",
    "Finalize cash invoice: cash_sale (+ tax) and cash_sale_cogs with stock issue at weighted-average (or catalog cost if average still zero).",
    "Finalize credit invoice: credit_sale (+ tax) and credit_sale_cogs with stock issue.",
    "Receipt: customer_payment or customer_advance / apply — settles AR; does not post revenue again.",
    "Credit notes reverse revenue, tax, and inventory cost at original line cost; stock returns when applicable.",
  ],
);
h2("Sales — accountant checklist");
bullet([
  "Confirm revenue hits 4000 (or mapped revenue) once per finalize — never again on receipt.",
  "Confirm COGS and inventory move together; serial-tracked items must have an in-stock serial at the selling branch.",
  "Credit limits and payment terms are operational controls on the customer master; aging proves the AR control account.",
  "Product rankings and customer statements follow posted sales documents only.",
]);

pageSection(
  "6.4 Suppliers",
  "Master data for vendors. Statements support AP control.",
  ["Add/edit supplier.", "Open supplier statement."],
  ["Creating a supplier posts nothing.", "AP moves when bills and payments post."],
);

pageSection(
  "6.5 Purchases",
  "Order → approve → receive → bill → pay. Dual control on orders and payments.",
  [
    "Tabs: orders, requisitions, receive, bill, pay.",
    "New order/requisition → Submit → Approve (different user).",
    "Receive goods on approved orders.",
    "Bill with match check, then Post bill.",
    "Post payment against supplier.",
    "PDF for purchase orders.",
  ],
  [
    "PO / requisition: no journal until goods or bill.",
    "Goods receipt: Inventory Dr, GRNI Cr; stock rises at branch main warehouse; weighted-average updates.",
    "Supplier bill: clears GRNI, records price differences, AP Cr (supplier_invoice_inventory pattern with input tax on debit side when mapped).",
    "Payment: supplier_payment — AP Dr, Bank Cr.",
    "Dashboard payable aging follows posted bills, not open POs alone.",
  ],
);
h2("Purchases — three-way match mindset");
bullet([
  "PO quantity/price is the commitment; receipt proves goods; bill proves supplier claim.",
  "Price differences on bill vs receipt cost post as mapped variance — investigate before period close.",
  "Branch approvers work up to the company purchase limit; larger amounts need a company-wide approver.",
  "Supplier deposits (if used) sit as prepayments until applied — do not expense them twice.",
]);

pageSection(
  "6.6 Inventory",
  "Quantities, warehouses, transfers, counts, and serial lookup.",
  [
    "Stock list by branch/warehouse.",
    "New transfer (draft → approve → ship → receive).",
    "Record stock count; variance posted by a different user.",
    "Serial lookup for tracked items.",
  ],
  [
    "Sellable qty excludes in-transit warehouse balances.",
    "Transfer ship: Inventory → Inventory in Transit; receive lands at destination. Company inventory total unchanged.",
    "Count variance: shortage to expense, surplus to income, against inventory.",
    "Serials: one in-stock serial per unit at selling branch; cannot sell twice.",
  ],
);

pageSection(
  "6.7 Expenses",
  "Claims with dual control, optional budgets, then accrual and payment.",
  [
    "New expense draft (category, branch, amount, receipt).",
    "Submit; creator cannot approve own claim.",
    "Approve within branch limit or escalate company-wide.",
    "Different user pays from cash/bank.",
  ],
  [
    "Approval: accrued_expense pattern — expense Dr, accrued expenses Cr (tax may hit prepaid tax).",
    "Rejection: no journal.",
    "Payment: clears accrual from cash/bank (operating_expense_paid or payment clearing); second payment blocked.",
    "Monthly budget can block approval when category would overspend.",
  ],
);

pageSection(
  "6.8 Banking",
  "Cash book, bank accounts, statements, and reconciliation.",
  [
    "Maintain bank accounts and cash drawers linked to ledger accounts.",
    "Record same-day transfers/deposits or later-dated transfers that use Bank Transfers in Transit.",
    "Import or enter statement lines; accept suggested matches or match by hand.",
    "Post bank charges and interest when they appear on the statement.",
    "Have a different user lock the statement when reconciliation is complete.",
    "Cash count: compare counted cash to the drawer; another user posts shortage or overage.",
  ],
  [
    "Book balances are calculated only from posted cash and bank journal lines.",
    "Transfers move value between asset accounts — they do not hit income or expense.",
    "Charges and interest post through the engine to the mapped accounts.",
    "A locked statement rejects further changes.",
    "Cash book shows opening, receipts, payments, and closing for the selected scope.",
    "Matching does not change invoice status by itself — receipts and payments do.",
  ],
);

pageSection(
  "6.9 Projects",
  "Installation / contract projects: materials, deposits, milestones, WIP.",
  [
    "Open a project with contract value, quotation link, and budget.",
    "Reserve materials, then have a different user approve the issue.",
    "Take customer deposits against the project.",
    "Raise milestone invoices as work is recognized.",
    "Link expenses to the project when they belong in WIP.",
  ],
  [
    "Installation issues debit work in progress and credit inventory; maintenance can debit installation cost immediately.",
    "Returns put quantity back at the issued cost.",
    "Deposits debit cash/bank and credit customer advances — not revenue.",
    "Milestone invoices debit AR and credit installation/maintenance revenue; cost is recognized from remaining WIP in proportion to the milestone.",
    "Dashboard project counts and profitability use journals inside your date range.",
  ],
);

pageSection(
  "6.10 Accounting workspace",
  "Manual journals, review queues, reversals, and opening balance import UI.",
  [
    "Review pending manuals, reversals, closed-period adjustments, failed and suspicious attempts.",
    "Submit manual journal for approval.",
    "Reverse a posted journal with a reason.",
    "Import opening balance pack with detail kinds.",
  ],
  [
    "Approve posts pending journals (not by creator).",
    "Reversal swaps Dr/Cr on a new journal.",
    "Opening import posts when period open and details reconcile.",
  ],
);

pageSection(
  "6.11 Chart of Accounts (screen)",
  "Browse and maintain the account tree used by all postings.",
  ["View account codes, names, types, postable/control flags.", "Add or adjust accounts within policy."],
  ["Changing an account does not rewrite history; future mappings and manuals use the new structure."],
);

pageSection(
  "6.12 Reports",
  "Management packs from the same journals — never a parallel ledger.",
  [
    "Trial balance and profit and loss on screen.",
    "Compare periods, YTD, branches, and statement budget where available.",
    "Export CSV, PDF, spreadsheet; print.",
  ],
  [
    "P&L: revenue and expense classes; balance sheet includes current-year profit.",
    "On a branch balance sheet, interbranch clearing keeps Assets = Liabilities + Equity; at company level it nets to zero.",
    "Cash flow uses the indirect method; internal cash↔bank transfers do not inflate profit or company cash.",
    "Exports are snapshots of the same figures — not a second set of books.",
  ],
);

pageSection(
  "6.13 Closing",
  "Daily branch packs and month/period lock with dual review.",
  [
    "Daily close: store sales, collections, credit sales, expenses, refunds, inventory exceptions, pending approvals, cash-count difference for the day.",
    "A reviewer who is not the preparer signs off the day; stored figures stay for audit.",
    "Month close: move period open → closing with checklist results; another person approves the lock.",
    "Reopening requires reopen permission and a written reason.",
    "Year-end lock can store statements, close income/expense to retained earnings, and open the next year.",
  ],
  [
    "After lock, ordinary posting is rejected.",
    "Closed-period adjustments remain the controlled exception path for true late corrections.",
    "Daily figures come from posted activity — not a separate manual sheet that can drift.",
  ],
);

pageSection(
  "6.14 Payroll",
  "External payroll summaries posted under control — not a full HR suite.",
  [
    "Employees carry branch/department/status — not salary amounts on the person record.",
    "Enter an approved summary from the external payroll process.",
    "A different person must approve the summary before it posts.",
    "Record salary payments (including partial settlement) against one or more summaries.",
    "Post only into an open fiscal period.",
  ],
  [
    "Approval posts gross salary expense, deduction liabilities, and salaries payable (salary_accrual pattern).",
    "Payments clear salaries payable from cash or bank (salary_payment).",
    "Outstanding totals should agree with the salaries payable control account.",
    "Nothing posts until the second person approves.",
  ],
);

pageSection(
  "6.15 Branches, departments, employees",
  "Organization structure for scoping and reporting dimensions.",
  [
    "Branches: create, activate/deactivate, manager, settings (warehouses, bank links, ceilings).",
    "Departments: company-wide or branch-limited.",
    "Employees: branch membership and link to sign-in user — no payroll amounts stored on the employee master.",
  ],
  ["These masters post nothing by themselves; they dimension journals and approvals."],
);

pageSection(
  "6.16 Users & Roles",
  "Invitations, role/branch assignment, suspension, session revoke.",
  [
    "Invite staff (token shown once; activation via /activate).",
    "Assign roles and branches.",
    "Suspend users; revoke sessions.",
  ],
  [
    "No ledger effect.",
    "Roles gate who can finalize sales, approve purchases, approve journals, close periods, and edit mappings — the control environment around the books.",
  ],
);

pageSection(
  "6.17 Settings",
  "Company profile, document templates, account mappings, approvals, documents, audit search.",
  [
    "Company: legal name, fiscal year start, purchase approval limit, notifications flag.",
    "Templates: invoice footer, quotation terms, payment advice.",
    "Accounting: event mappings, tax codes, fiscal period list (lock/reopen on Closing).",
    "Approvals: expense policies, delegations (revocable), separation rules.",
    "Documents and audit search by entity type.",
  ],
  [
    "Mapping changes redirect future postings; they do not rewrite posted journals.",
    "Audit is append-only — updates/deletes of audit rows are rejected at the database.",
  ],
);

pageSection(
  "6.18 Data Import",
  "Go-live CSV pipeline with dual control.",
  ["Upload → Parse → Validate → Preview → Approve (other user) → Commit → Report."],
  [
    "Masters commit through domain services.",
    "Opening financials commit through importOpeningBalances on the posting engine.",
    "Unbalanced opening TB / bank opening batches cannot be approved or committed.",
  ],
);

pageSection(
  "6.19 Notifications",
  "Bell alerts for work needing attention.",
  ["Refresh alerts.", "Mark read / mark all read.", "Open linked screens."],
  ["Typical accountant alerts: journal approvals, overdue AR, low stock, posting failures."],
);

// 7 Cross-cutting
h1("7. Cross-cutting controls");
bullet([
  "Separation of duties: creators cannot approve their own restricted actions (journals, transfers, expenses, many purchase steps).",
  "Branch vs company-wide approvers: amounts over the company purchase limit need company-wide authority.",
  "Approval policies, delegations, and separation rules are maintained under Settings → Approvals.",
  "Approval delegations can temporarily move authority; revoke when the cover period ends.",
  "Suspended users cannot sign in; invited users must activate before login.",
  "Privileged finance roles may require authenticator (MFA) before they can work in the books.",
  "Company-wide roles are not limited to a branch list; everyone else only sees assigned branches.",
]);

h1("7b. Notifications accountants care about");
bullet([
  "Approval requests and outcomes — so dual control does not stall sales, purchases, or expenses.",
  "Overdue customer invoices — collections focus.",
  "Low stock — purchasing and transfer planning.",
  "Supplier bills due — cash planning and AP.",
  "Failed postings — investigate before month end.",
  "Period-closing reminders — checklist and lock on time.",
]);

// 8 Integrity
h1("8. Integrity quick reference");
h2("What never changes after posting");
bullet([
  "Posted journal lines (edit/delete blocked).",
  "Original document numbers and links from journals to source documents.",
  "Audit events (append-only).",
  "No silent edit of a posted journal — reverse and, if needed, enter a new correct document.",
  "No second receipt that “adds” the same revenue again — receipts settle AR or advances only.",
  "No posting into a closed period without an approved closed-period adjustment.",
  "No self-approval where dual control is required.",
  "No selling serials or quantities the branch does not hold (including stock still in transit).",
  "No unbalanced opening import — the books must balance before commit.",
]);
h2("When the books update (module → effect)");
bullet([
  "Finalize invoice → AR or cash, revenue (+ tax), inventory ↓, cost of sales.",
  "Customer receipt → cash/bank ↑, AR ↓ or customer advances ↑ (no new revenue).",
  "Goods receipt → inventory ↑, GRNI ↑; supplier bill → GRNI ↓, AP ↑ (variance as mapped).",
  "Supplier / expense payment → AP or accruals ↓, cash/bank ↓.",
  "Expense approval → expense ↑, accrued expenses ↑; payment clears the accrual.",
  "Bank transfer → one cash/bank ↑, another ↓ (or via transfers in transit).",
  "Project issue → WIP or project cost ↑, inventory ↓; milestone invoice → AR + revenue + cost recognition.",
  "Payroll summary approve → salary expense + deductions + salaries payable; payment clears payable.",
  "Stock count variance → inventory and expense/income as mapped after second-person post.",
  "Manual journal approve → whatever lines you balanced; same permanence rules.",
]);
h2("What to check when something looks wrong");
bullet([
  "Branch filter and date range on Dashboard/Reports.",
  "Document still draft or pending approval.",
  "Period closed without adjustment flag.",
  "Missing or wrong account mapping for the event.",
  "Posting attempt / suspicious queue on Accounting.",
  "Stock insufficient or serial missing on sales issue.",
  "Opening import not yet committed or failed validation.",
  "AR/AP/inventory subledger vs control account difference — prove with aging and stock valuation.",
]);

h1("8b. Month-end suggested order");
bullet([
  "1. Clear failed posting attempts and pending approvals.",
  "2. Finish goods receipts and bills; match GRNI to zero or explain.",
  "3. Complete bank reconciliations and cash counts for each branch.",
  "4. Review AR/AP aging vs control accounts; chase overdue.",
  "5. Confirm inventory valuation vs stock reports; resolve count variances.",
  "6. Post payroll summaries and payments for the period.",
  "7. Run trial balance and P&L; investigate unusual mappings.",
  "8. Daily closes signed for the month; then period checklist and second-person lock.",
]);

// 9 Close
h1("9. Related materials");
para(
  "Use the How-It-Works PowerPoint (`pnpm pptx:how-it-works`) for an executive slide walkthrough of the same topics. Use the End-User Guide PDF (`pnpm tutorial:pdf`) to train branch staff on clicks without teaching the ledger. This Accountant Guide (`pnpm tutorial:accountant-pdf`) is the detailed rulebook for controllers who own the chart, mappings, close, and integrity of the books.",
);
tip(
  "REMEMBER",
  "The posting engine is the single path into the ledger. If a module cannot post a balanced journal under the period and mapping rules, the books must not move.",
);

// Footers
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(range.start + i);
  if (i === 0) continue;
  const label = String(i);
  const y = PAGE_H - 28;
  doc.save();
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H).fill(C.navy);
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fillColor(C.white).fontSize(9).font("Helvetica");
  doc.text("Solar Accounting · Accountant Guide · Confidential", MARGIN, y, {
    width: CONTENT_W - 40,
    lineBreak: false,
  });
  doc.text(label, MARGIN, y, { width: CONTENT_W, align: "right", lineBreak: false });
  doc.page.margins.bottom = prevBottom;
  doc.restore();
}

doc.end();

await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
});

console.log(`Wrote ${outFile} (${range.count} pages)`);
