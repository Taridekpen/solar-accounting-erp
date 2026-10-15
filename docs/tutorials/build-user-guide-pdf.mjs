/**
 * End-user tutorial PDF (non-accountant, click-by-click).
 * Run: node docs/tutorials/build-user-guide-pdf.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(__dirname, "Solar-Accounting-User-Guide.pdf");

const C = {
  navy: "#0B1F3A",
  accent: "#1B6CA8",
  teal: "#0E7C7B",
  ink: "#1A2332",
  muted: "#5B6B7C",
  soft: "#F2F6FA",
  tip: "#E8F4F3",
  tipBorder: "#0E7C7B",
  white: "#FFFFFF",
};

const MARGIN = 54;
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
    Title: "Solar Accounting — End-User Guide",
    Author: "Solar & Inverter Co.",
    Subject: "How to use the application day to day",
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
  ensureSpace(48);
  doc.moveDown(0.4);
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(18).text(text, { width: CONTENT_W });
  doc.moveDown(0.35);
  doc.strokeColor(C.accent).lineWidth(2).moveTo(MARGIN, doc.y).lineTo(MARGIN + 80, doc.y).stroke();
  doc.moveDown(0.55);
}

function h2(text) {
  ensureSpace(36);
  doc.moveDown(0.25);
  doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(13).text(text, { width: CONTENT_W });
  doc.moveDown(0.3);
}

function para(text) {
  ensureSpace(28);
  doc.fillColor(C.ink).font("Helvetica").fontSize(10.5).text(text, { width: CONTENT_W, align: "left", lineGap: 2 });
  doc.moveDown(0.35);
}

function bullet(items) {
  for (const item of items) {
    ensureSpace(22);
    doc.fillColor(C.ink).font("Helvetica").fontSize(10.5);
    doc.text(`•  ${item}`, { width: CONTENT_W, indent: 0, lineGap: 2 });
    doc.moveDown(0.15);
  }
  doc.moveDown(0.25);
}

function steps(items) {
  items.forEach((item, i) => {
    ensureSpace(28);
    const label = `${i + 1}.`;
    doc.fillColor(C.teal).font("Helvetica-Bold").fontSize(10.5).text(label, { continued: true });
    doc.fillColor(C.ink).font("Helvetica").text(`  ${item}`, { width: CONTENT_W - 12, lineGap: 2 });
    doc.moveDown(0.2);
  });
  doc.moveDown(0.3);
}

function tip(text) {
  ensureSpace(52);
  const startY = doc.y;
  doc.font("Helvetica").fontSize(10);
  const height = doc.heightOfString(text, { width: CONTENT_W - 28 }) + 18;
  doc.roundedRect(MARGIN, startY, CONTENT_W, height, 6).fillAndStroke(C.tip, C.tipBorder);
  doc.fillColor(C.teal).font("Helvetica-Bold").fontSize(9).text("TIP", MARGIN + 12, startY + 8);
  doc.fillColor(C.ink).font("Helvetica").fontSize(10).text(text, MARGIN + 12, startY + 20, {
    width: CONTENT_W - 24,
  });
  doc.y = startY + height + 10;
}

function whyWhat(why, what) {
  h2("Why this page exists");
  para(why);
  h2("What you can do here");
  bullet(what);
}

// ——— Cover ———
{
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.navy);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(28);
  doc.text("Solar Accounting", MARGIN, 220, { width: CONTENT_W });
  doc.fontSize(22).text("End-User Guide", MARGIN, doc.y + 8, { width: CONTENT_W });
  doc.font("Helvetica").fontSize(12).fillColor("#B8C9DC");
  doc.text(
    "A plain-language tutorial for everyday staff.\nWhat each page is for, and exactly what to click.",
    MARGIN,
    doc.y + 24,
    { width: CONTENT_W, lineGap: 4 },
  );
  doc.fontSize(11).text("Sell · Buy · Stock · Expenses · Projects · Day-to-day work", MARGIN, 680, {
    width: CONTENT_W,
  });
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

// 2 Before you start
h1("1. Before you start");
para(
  "This guide is for people who use the system every day: sales staff, cashiers, branch managers, storekeepers, and office staff. You do not need to be an accountant.",
);
bullet([
  "Open the web address your company gave you (local or online).",
  "You only see menu items your role allows. A missing button usually means you need a different permission—ask your admin.",
  "Money amounts are in Nigerian Naira (NGN). The system calculates totals for you—do not invent your own totals on paper and ignore the screen.",
  "Many actions need a second person to approve. That is normal and keeps mistakes and fraud down.",
]);
tip("If you get stuck, check the last chapter “If something fails,” or ask finance / your branch manager.");

// 3 Sign in
h1("2. Sign in");
whyWhat("Keeps your work private and shows only the pages you are allowed to use.", [
  "Sign in with email and password",
  "Complete authenticator setup if the system asks (privileged roles)",
  "Sign out when you leave a shared computer",
]);
h2("What to click");
steps([
  "Open the login page (you are not inside the main menu yet).",
  "Type your email and password.",
  "Click Sign in.",
  "If you see “Enable authenticator” or a code box: open your authenticator app on your phone. If a secret is shown on screen, add it once in the app. Enter the 6-digit code, then continue.",
  "When sign-in works, you land on the Dashboard (or the first page your role can open).",
]);
tip("Wrong password several times can lock the account for a short time. Wait and try again, or ask an admin to help.");

// 4 Screen layout
h1("3. The screen layout");
para("After login you see three main parts.");
bullet([
  "Left sidebar — list of pages (Dashboard, Sales, Purchases, and so on). On a phone, open it with the menu (hamburger) button.",
  "Top header — branch filter, sometimes date controls, notifications (bell), and your account menu.",
  "Main area — the page content. Scroll here; the sidebar stays available.",
]);
h2("Account menu");
steps([
  "Click your account / profile control in the header.",
  "Change password if needed, or sign out.",
]);

// 5 Branch filter
h1("4. Branch filter (very important)");
whyWhat(
  "Your company may have several locations. The filter decides which branch’s sales, stock, and totals you are looking at—so you do not mix another shop’s numbers into yours.",
  [
    "View all branches you are allowed to see",
    "Focus on one branch",
    "Compare a few branches at once",
  ],
);
h2("What to click");
steps([
  "In the header, open the branch selector.",
  "Choose All branches, one branch, or several branches from your list.",
  "Lists, dashboards, and reports refresh for that choice.",
]);
tip("If you only work at one shop, leave that branch selected all day so you do not post a sale to the wrong place.");

// 6 Dashboard
h1("5. Dashboard");
whyWhat(
  "A quick picture of how the business is doing for the dates and branches you selected: sales, purchases, profit, expenses, cash, customers who owe you, suppliers you owe, and stock value.",
  [
    "Change the date range (this month, custom dates, and similar presets)",
    "Read the big number cards",
    "Click a card to open the detail lines behind that number",
  ],
);
h2("What the main cards mean (plain words)");
bullet([
  "Total Sales — money from selling goods/services in the period (from finished sales in the system).",
  "Total Purchases — buying activity reflected in the books for the period.",
  "Gross Profit — sales after the cost of the goods sold.",
  "Total Expenses — operating costs that were approved/posted.",
  "Cash and bank — money in cash and bank accounts per the books.",
  "Accounts receivable — customers still owe you.",
  "Accounts payable — you still owe suppliers.",
  "Inventory valuation — value of stock on hand.",
]);
h2("What to click");
steps([
  "Open Dashboard in the sidebar (or Home).",
  "Set the branch filter in the header if needed.",
  "Use the date control to pick This month or a custom range.",
  "Click any KPI card (for example Total Sales) to see the supporting lines.",
  "Use Back to dashboard when you are done with the detail page.",
]);
tip("Empty or zero numbers usually mean nothing was posted yet for that filter—not that the screen is broken.");

// 7 Customers
h1("6. Customers");
whyWhat("Keep a list of people and companies you sell to, so invoices and receipts have the right name and contact details.", [
  "Search the customer list",
  "Add a new customer",
  "Edit a customer",
  "Open a customer statement (what they owe)",
]);
h2("Add a customer");
steps([
  "Click Customers in the sidebar.",
  "Click + Add Customer.",
  "Fill in name and other fields shown (phone, email, branch link, credit limit if asked).",
  "Click Save customer.",
  "Find them in the list (use search if the list is long).",
]);
h2("Edit or statement");
steps([
  "On the customer row, click Edit to change details, then Save.",
  "Click Statement to see outstanding and overdue balances and recent invoices.",
]);

// 8 Sales
h1("7. Sales");
whyWhat(
  "Record quotes, sales invoices, money collected from customers, and returns. Finalizing an invoice records the sale and reduces stock for products.",
  [
    "Switch tabs: Invoices, Quotations, Receipts, Returns",
    "Create quotations, invoices, receipts, and returns",
    "Preview totals before saving",
    "Finalize a draft invoice",
    "Download a PDF when the button is shown",
  ],
);
h2("Create a quotation (no sale yet)");
steps([
  "Open Sales → click Quotations (or use New quotation).",
  "Click New quotation.",
  "Choose branch and customer; add product lines (quantity and price).",
  "Click Save quotation.",
  "Use PDF on the row if you need a printable quote.",
]);
h2("Create and finish an invoice (the actual sale)");
steps([
  "Open Sales → Invoices → + New invoice.",
  "Select Branch and Customer.",
  "Set the invoice date and payment terms if shown.",
  "Choose credit (customer pays later) or cash (paid now), and cash method if cash.",
  "Add lines: product, quantity, unit price, discount and tax if needed. Add more lines as required.",
  "Click Preview — check the totals the system calculated.",
  "Click Save draft.",
  "On the invoice list, click Finalize when the sale is agreed. This records the sale and issues stock for products.",
  "Optional: click PDF to download the invoice.",
]);
h2("Record a receipt (customer pays)");
steps([
  "Open Sales → click New receipt (or Receipts tab).",
  "Choose customer and branch; enter amount and how it was paid.",
  "Allocate to open invoices if the form asks, or leave as advance if they prepaid.",
  "Click Save receipt.",
]);
tip("A receipt does not create a second sale. It only records that money came in against invoices or as an advance.");
h2("Customer return");
steps([
  "Open Sales → New return.",
  "Pick the original invoice and the line/quantity being returned.",
  "Save the return request and follow any approval steps your company uses.",
]);

// 9 Suppliers
h1("8. Suppliers");
whyWhat("Keep records of companies you buy from, before you raise purchase orders or record bills.", [
  "Search and browse suppliers",
  "Add or edit a supplier",
  "View a supplier statement",
]);
h2("What to click");
steps([
  "Open Suppliers → + Add Supplier.",
  "Enter business name, branch, phone/email/address, payment terms.",
  "If collecting bank details, fill bank name, account name, and account number (later you may only see the last digits).",
  "Click Save supplier.",
  "Use Edit or Statement on a row when needed.",
]);

// 10 Purchases
h1("9. Purchases");
whyWhat(
  "Ask for goods (requisition), order from a supplier (purchase order), receive stock into the warehouse, record the supplier’s bill, and pay them.",
  [
    "Tabs/sections: orders, requisitions, receipts, bills, payments",
    "Create and submit orders or requisitions",
    "Approve (if you are an approver)",
    "Receive goods, post bills, record payments",
  ],
);
h2("Raise a purchase order");
steps([
  "Open Purchases → Orders (or switch section to orders).",
  "Click + New order.",
  "Choose delivery branch, supplier, warehouse if asked, and product lines with quantities/costs.",
  "Click Preview to check totals, then Save draft.",
  "On the list, click Submit so an approver can review.",
  "If you are an approver (and not the person who created it), open the order and click Approve.",
]);
h2("Receive goods, bill, and pay");
steps([
  "When the order is approved: click Receive on the order → confirm quantities → Record receipt. Stock increases at that branch.",
  "Click Bill (or open bills flow) → check the match/preview → Post bill. This records what you owe the supplier.",
  "Click Pay → enter payment details → Post payment.",
]);
tip("A purchase order alone does not change the books. Receiving and billing are the steps that update stock and amounts owed.");

// 11 Inventory
h1("10. Inventory");
whyWhat("See how much stock sits in each warehouse, move stock between branches, count stock, and look up serial numbers.", [
  "View stock by warehouse",
  "Create a transfer between branches",
  "Record a stock count",
  "Look up a serial number",
]);
h2("Read stock");
steps([
  "Open Inventory → Stock.",
  "Read warehouse, product, quantity, available quantity, and value columns.",
  "Remember: stock still “in transit” between branches is not available to sell yet.",
]);
h2("Transfer stock to another branch");
steps([
  "Open Inventory → Transfers → New transfer.",
  "Choose source branch/warehouse and destination branch/warehouse.",
  "Add product and quantity; set the date.",
  "Save. Another user may need to approve.",
  "After approval, shipping and receiving steps move stock through “in transit” to the destination.",
]);
h2("Stock count");
steps([
  "Open Inventory → Counts → Record count.",
  "Choose branch, warehouse, product, and counted quantity.",
  "Save. A different user posts any difference (shortage or surplus) when your process requires it.",
]);
h2("Serial lookup");
steps([
  "Open Inventory → Serials.",
  "Type the serial number → search/lookup.",
  "Confirm it is in stock at the right branch before selling a serial-tracked item.",
]);

// 12 Expenses
h1("11. Expenses");
whyWhat("Claim or record business costs (fuel, repairs, office costs, and so on) with a receipt, then get them approved and paid.", [
  "Create a new expense",
  "View the expense list and simple reports",
  "Wait for someone else to approve or pay (if that is not your role)",
]);
h2("What to click");
steps([
  "Open Expenses → New expense.",
  "Select branch and category; enter date, description, amount, and tax if shown.",
  "Attach or name the receipt if the form asks for a file.",
  "Save. The expense starts as a draft or goes for approval depending on your process.",
  "You normally cannot approve your own expense. An approver reviews it; a different person may record payment.",
]);
tip("If approval is blocked for “budget,” the category is over the monthly limit—ask your manager or finance.");

// 13 Banking
h1("12. Banking");
whyWhat("See bank and cash balances from the books, review the cash book, and work with bank statements.", [
  "View bank accounts and cash drawers",
  "Open the cash book for a period",
  "Browse statements (import/match/lock depending on your role)",
]);
h2("What to click");
steps([
  "Open Banking → Accounts to see each account and its book balance.",
  "Open Cash book to see opening balance, receipts, payments, and closing.",
  "Open Statements to see imported or entered statement periods and their status.",
]);
tip("Book balance means “according to this system,” not necessarily the SMS balance from the bank until statements are matched.");

// 14 Projects
h1("13. Projects (installations)");
whyWhat("Track solar installation or maintenance jobs: customer, branch, contract value, and status—so materials and progress stay tied to the job.", [
  "List projects",
  "Create a new project",
]);
h2("What to click");
steps([
  "Open Projects → create/new project (button on the page).",
  "Choose customer and branch; enter contract or budget details the form asks for.",
  "Save. Later, materials issues, customer deposits, and milestone invoices may be handled by staff with those permissions—follow your company’s process.",
]);

// 15 Accounting / CoA / Reports
h1("14. Accounting, Chart of Accounts, and Reports");
para(
  "These pages are used mostly by finance and managers. Day-to-day sellers may never open them. Here is what they are for in simple terms.",
);
h2("Accounting");
whyWhat("A workspace to review recent postings, approval queues for manual journals, and (for accountants) enter special journals.", [
  "Glance at recent posted activity and pending journal requests if you have access",
  "Leave manual journals and reversals to trained finance staff unless you were trained to do them",
]);
h2("Chart of Accounts");
para("A list of all account names and codes (like Cash, Sales, Inventory). Balances come from finished transactions. Usually view-only for most staff.");
h2("Reports");
steps([
  "Open Reports.",
  "Choose Trial balance or Profit and loss.",
  "Read the on-screen figures for the period shown.",
  "Use CSV, PDF, Spreadsheet, or Print if you need a copy for a meeting.",
]);

// 16 Closing
h1("15. Closing (end of day / month)");
whyWhat("Pack up the day’s figures for a branch, and manage whether a month is still open for new entries.", [
  "View daily closing figures for a branch day",
  "See which fiscal periods are open, closing, or locked",
]);
h2("Typical flow (branch)");
steps([
  "Open Closing.",
  "Review the daily report numbers (sales, collections, expenses, cash difference).",
  "One person prepares; a different person reviews—do not review your own pack if the system blocks it.",
  "Month close and reopen are for finance with special permission. If a period is locked, ordinary new entries for that month are blocked.",
]);

// 17 Payroll
h1("16. Payroll");
whyWhat("Show salary summary totals that finance entered from an outside payroll process, and how much salary payable is still outstanding.", [
  "View outstanding salaries payable",
  "Browse salary summary rows (number, branch, period, amounts, status)",
]);
para("Entering or approving payroll summaries is normally an accountant task. If you only need to check a figure, open Payroll and read the cards and table.");

// 18 Admin records
h1("17. Branches, Departments, Employees, Users & Roles");
para("These pages are mostly for administrators and managers who set up the company structure and staff access.");
h2("Branches");
steps([
  "Open Branches → + Add Branch.",
  "Enter name, code, location, manager if asked → Save.",
  "Use Edit or status controls to update; open settings on a branch when you need linked banks or policies.",
]);
h2("Departments & Employees");
steps([
  "Departments: add a department (company-wide or for one branch).",
  "Employees: add staff name, number, branch, department, status. This is an HR-style list—not where net pay is calculated.",
]);
h2("Users & Roles");
steps([
  "Open Users & Roles → Invite staff.",
  "Enter their email and create the invitation; share the activation link/token your process uses.",
  "On a user row, click Manage to set role and branch assignment, then Save assignments.",
  "Use Suspend to block access when someone leaves.",
]);
tip("Company-wide roles can see all branches. Other roles only see assigned branches—set this carefully.");

// 19 Settings
h1("18. Settings");
whyWhat("Company-wide setup: profile, document look, account mappings, approvals, uploaded files, and audit history.", [
  "Company tab — legal name, currency, timezone, logo, notification flags",
  "Accounting-related tabs — templates, mappings, tax, fiscal period overview (finance)",
  "Approvals — policies, delegations, separation rules",
  "Documents — managed uploads",
  "Audit — searchable history of important changes (needs audit permission)",
]);
h2("Audit search (if you can see it)");
steps([
  "Open Settings → Audit.",
  "Optional: type an Entity type (for example company or session).",
  "Optional: use Search action or reason to find words in the action name, entity type, reason, or id.",
  "Click a row to expand previous/next values.",
]);
tip("Do not change mappings or tax codes unless finance asked you to—wrong settings can mis-post every future sale.");

// 20 Data import
h1("19. Data Import");
whyWhat("Load starting customers, stock, or opening balances from CSV when the company goes live or catches up history.", [
  "Upload a CSV for a chosen import type",
  "Run parse → validate → preview",
  "Have a different user approve",
  "Commit and read the import report",
]);
h2("What to click");
steps([
  "Open Data Import.",
  "Choose Import type → choose CSV file → upload/create the batch.",
  "Select the batch in the list.",
  "Click Parse, then Validate, then open Preview and check the numbers.",
  "A different user with import permission clicks Approve.",
  "Click Commit. Read the stored report. Unbalanced opening balances will be rejected—fix them before approve/commit.",
]);

// 21 Notifications
h1("20. Notifications");
whyWhat("Alerts so you do not miss approvals, overdue invoices, low stock, bills due, or period-close reminders.", [
  "Open the bell in the header",
  "Read and open related items",
  "Mark as read when your product allows it",
]);
h2("What to click");
steps([
  "Click the notifications icon in the header.",
  "Open an item that needs you (for example an approval).",
  "Complete the work on that page, then return to the list as needed.",
]);

// 22 Common day paths
h1("21. Common day paths");
h2("A. Sell something today");
steps([
  "Set your branch in the header.",
  "Confirm the customer exists (Customers), or add them.",
  "Sales → New invoice → fill lines → Preview → Save draft → Finalize.",
  "If they pay now or later, use New receipt when money arrives.",
]);
h2("B. Buy and receive stock");
steps([
  "Suppliers → ensure the supplier exists.",
  "Purchases → New order → Submit → (approver) Approve.",
  "Receive on the order when goods arrive.",
  "Bill and Pay when finance/your role does those steps.",
  "Check Inventory → Stock for the new quantities.",
]);
h2("C. Claim an expense");
steps([
  "Expenses → New expense → fill and save.",
  "Ask your approver to approve; payment is often a second person.",
]);
h2("D. End of day");
steps([
  "Dashboard → today’s or this month’s dates → your branch.",
  "Glance at sales, cash, and any pending approvals or low-stock alerts.",
  "Closing → review daily pack if that is your job; a different person reviews.",
]);

// 23 Failures
h1("22. If something fails");
bullet([
  "Permission / page missing — your role does not include it. Ask an admin for Users & Roles changes.",
  "Cannot approve — you created the document, or you are not an approver / over the amount limit. Ask a company-wide or higher approver.",
  "Finalize or post blocked — period may be closed, stock may be insufficient, serial missing, or a required field is empty. Read the red error text on screen.",
  "Totals look wrong — check branch filter and date range first; do not type a “corrected” total outside the system.",
  "Login / authenticator issues — confirm email, wait out a lockout, or ask admin to reset access.",
]);
tip("The system is the source of truth for money and stock. If paper and screen disagree, investigate with finance—do not override silently.");

// End
h1("Thank you");
para(
  "You now have a map of every main page and the usual clicks for selling, buying, stock, expenses, and daily checks. For deeper ledger rules, ask finance or see the accountant How-It-Works presentation in the company docs folder.",
);

// Footers on buffered pages (skip full-bleed cover)
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(range.start + i);
  if (i === 0) continue;
  const label = String(i); // cover = 0; first content page = 1
  const y = PAGE_H - 28;
  doc.save();
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H).fill(C.navy);
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fillColor(C.white).fontSize(9).font("Helvetica");
  doc.text("Solar Accounting · User Guide · Confidential", MARGIN, y, {
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
