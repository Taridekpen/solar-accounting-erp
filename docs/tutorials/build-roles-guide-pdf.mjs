/**
 * Roles & permissions reference PDF.
 * Run: node docs/tutorials/build-roles-guide-pdf.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(__dirname, "Solar-Accounting-Roles-Guide.pdf");

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

const ROLES = [
  {
    name: "Super Administrator",
    code: "super_administrator",
    purpose: "Full system owner. Configures the company, users, and every module. Use sparingly for break-glass and setup work.",
    does: [
      "Opens every menu and performs every action in the product.",
      "Creates users, assigns roles, and manages company settings.",
      "Can create, approve, and pay expenses — but must not approve or pay documents they themselves created (separation of duties).",
    ],
    permissionsNote: "All permissions in the catalogue.",
  },
  {
    name: "Managing Director",
    code: "managing_director",
    purpose: "Executive oversight. Reviews company and branch reports and gives final commercial approvals.",
    does: [
      "Views dashboard and company/branch reports.",
      "Approves sales, purchases, and expenses after staff submit them.",
      "Opens Sales, Purchases, and Expenses lists to act on pending items.",
    ],
    permissionsNote: "View + approve for sales, purchases, and expenses; company and branch reporting; notifications.",
  },
  {
    name: "Finance Manager",
    code: "finance_manager",
    purpose: "Controls the ledger, banking, payroll payouts, and high-value expense/project approvals.",
    does: [
      "Reviews and approves journals; closes and reopens accounting periods.",
      "Approves and pays expenses (not ones they created).",
      "Approves project materials and milestones; views project detail.",
      "Reconciles banks, transfers cash, runs company reports, and manages documents/imports.",
    ],
    permissionsNote: "Accounting, expenses (view/approve/pay), projects (view/approve), banking, payroll approve/pay, settings/audit/imports.",
  },
  {
    name: "Central Accountant",
    code: "central_accountant",
    purpose: "Day-to-day company accounting: journals, closing prep, and reporting without expense payment authority.",
    does: [
      "Creates and approves journals; prepares daily closing packs.",
      "Views expenses and projects for reconciliation context.",
      "Reconciles banks and prepares payroll runs (does not approve payroll payments).",
    ],
    permissionsNote: "Accounting create/approve, expenses.view, projects.view, banking reconcile, payroll.create, reports, documents/imports.",
  },
  {
    name: "Branch Manager",
    code: "branch_manager",
    purpose: "Runs a branch: reviews branch activity and approves purchases, expenses, and projects for that branch.",
    does: [
      "Views sales, purchases, inventory, expenses, and projects for the branch.",
      "Approves purchases, expenses, and project materials/milestones.",
      "Reviews branch reports and daily closing.",
    ],
    permissionsNote: "Branch reports, expenses view/approve, purchases view/approve, projects view/approve, inventory/sales view, documents.",
  },
  {
    name: "Branch Accountant",
    code: "branch_accountant",
    purpose: "Branch bookkeeping support: journals, closing prep, and expense visibility without approval rights.",
    does: [
      "Creates journals and prepares daily closing for the branch.",
      "Views expenses, projects, accounts, and payroll drafts.",
      "Reconciles bank activity for the branch.",
    ],
    permissionsNote: "Journal create/view, expenses.view, projects.view, payroll.create, branch reports, banking reconcile.",
  },
  {
    name: "Sales Officer",
    code: "sales_officer",
    purpose: "Front-line selling: quotes, invoices, and customer records.",
    does: [
      "Creates and views sales documents.",
      "Applies allowed discounts.",
      "Maintains customer visibility for billing.",
    ],
    permissionsNote: "sales.create/view/discount, customers.view, notifications.",
  },
  {
    name: "Procurement Officer",
    code: "procurement_officer",
    purpose: "Buys goods: purchase orders and supplier records.",
    does: [
      "Creates and views purchase documents.",
      "Works with supplier master data.",
    ],
    permissionsNote: "purchases.create/view, suppliers.view, notifications.",
  },
  {
    name: "Inventory Officer",
    code: "inventory_officer",
    purpose: "Warehouse control: stock moves, counts, and goods receipts.",
    does: [
      "Views inventory positions.",
      "Transfers stock and performs counts.",
      "Receives goods against purchases.",
    ],
    permissionsNote: "inventory.view/transfer/count, purchases.receive, notifications.",
  },
  {
    name: "Project Manager",
    code: "project_manager",
    purpose: "Runs installation projects and raises related costs and material requests.",
    does: [
      "Creates projects (draft or active) and requests material issues.",
      "Creates expense drafts and submits them for approval.",
      "Cannot approve their own expenses, materials, or milestones (another role must approve).",
    ],
    permissionsNote: "projects.view/create/issue, expenses.create/view, inventory.view, dashboard, notifications.",
  },
  {
    name: "Auditor",
    code: "auditor",
    purpose: "Read-only assurance across commercial, stock, and ledger data.",
    does: [
      "Views sales, purchases, inventory, accounting, projects, and reports.",
      "Reviews users, branches, settings, audit log, and documents.",
      "Cannot create, approve, or pay operational documents.",
    ],
    permissionsNote: "Broad *.view permissions plus audit.view; no create/approve/pay actions.",
  },
];

const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: MARGIN, bottom: FOOTER_H + 16, left: MARGIN, right: MARGIN },
  bufferPages: true,
  info: {
    Title: "Solar Accounting — Roles & Permissions Guide",
    Author: "Solar & Inverter Co.",
    Subject: "What each role does and which permissions it holds",
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
  doc.moveDown(0.3);
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(18).text(text, { width: CONTENT_W });
  doc.moveDown(0.3);
  doc.strokeColor(C.accent).lineWidth(2).moveTo(MARGIN, doc.y).lineTo(MARGIN + 80, doc.y).stroke();
  doc.moveDown(0.5);
}

function h2(text) {
  ensureSpace(36);
  doc.moveDown(0.2);
  doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(13).text(text, { width: CONTENT_W });
  doc.moveDown(0.25);
}

function para(text) {
  ensureSpace(28);
  doc.fillColor(C.ink).font("Helvetica").fontSize(10.5).text(text, { width: CONTENT_W, lineGap: 2 });
  doc.moveDown(0.3);
}

function bullet(items) {
  for (const item of items) {
    ensureSpace(22);
    doc.fillColor(C.ink).font("Helvetica").fontSize(10.5).text(`•  ${item}`, { width: CONTENT_W, lineGap: 2 });
    doc.moveDown(0.12);
  }
  doc.moveDown(0.2);
}

function tip(label, text) {
  ensureSpace(52);
  const startY = doc.y;
  doc.font("Helvetica").fontSize(9.5);
  const height = doc.heightOfString(text, { width: CONTENT_W - 28 }) + 24;
  ensureSpace(height + 8);
  doc.roundedRect(MARGIN, startY, CONTENT_W, height, 5).fillAndStroke(C.tip, C.tipBorder);
  doc.fillColor(C.teal).font("Helvetica-Bold").fontSize(8.5).text(label, MARGIN + 12, startY + 8);
  doc.fillColor(C.ink).font("Helvetica").fontSize(9.5).text(text, MARGIN + 12, startY + 20, { width: CONTENT_W - 24 });
  doc.y = startY + height + 10;
}

function roleBlock(role) {
  ensureSpace(120);
  const headerY = doc.y;
  doc.roundedRect(MARGIN, headerY, CONTENT_W, 28, 4).fill(C.soft);
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(12).text(role.name, MARGIN + 10, headerY + 8, { width: CONTENT_W - 20 });
  doc.y = headerY + 36;
  doc.fillColor(C.muted).font("Helvetica").fontSize(9).text(`Role code: ${role.code}`, { width: CONTENT_W });
  doc.moveDown(0.35);
  para(role.purpose);
  doc.fillColor(C.navy).font("Helvetica-Bold").fontSize(10).text("What this role does");
  doc.moveDown(0.2);
  bullet(role.does);
  doc.fillColor(C.muted).font("Helvetica-Oblique").fontSize(9).text(`Permissions summary: ${role.permissionsNote}`, {
    width: CONTENT_W,
    lineGap: 1.5,
  });
  doc.moveDown(0.55);
}

// Cover
doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.navy);
doc.fillColor(C.white).font("Helvetica-Bold").fontSize(28).text("Solar Accounting", MARGIN, 220, { width: CONTENT_W });
doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(18).text("Roles & Permissions Guide", MARGIN, 265, { width: CONTENT_W });
doc.fillColor("#B8C7D9").font("Helvetica").fontSize(11).text(
  "Plain-language reference for every built-in role: what it is for, what staff do day to day, and which permissions unlock the screens.",
  MARGIN,
  310,
  { width: CONTENT_W, lineGap: 3 },
);
doc.fillColor("#8FA3B8").font("Helvetica").fontSize(9).text(`Generated ${new Date().toISOString().slice(0, 10)}`, MARGIN, 720);

doc.addPage();
h1("How roles work");
para(
  "Each user is assigned one or more roles. The session permissions are the union of those roles. Menus appear only when the matching *.view permission is present. Action buttons (Submit, Approve, Pay, Issue) also check create/approve/pay/issue permissions and separation of duties.",
);
tip(
  "Separation of duties",
  "The creator of an expense cannot approve, reject, or pay it. The requester of a project material or milestone cannot approve or recognize it. Assign a second person with the approve/pay role for those steps.",
);
para("Typical expense path: Project Manager creates and submits → Branch Manager or Finance Manager approves → Finance Manager (different user) pays from a cash account.");
para("Typical project path: Project Manager creates/activates and requests materials → Branch Manager or Finance Manager approves materials → Project Manager issues stock → Project Manager adds milestones → approver recognizes revenue.");

h1("Built-in roles");
for (const role of ROLES) {
  roleBlock(role);
}

h1("Quick matrix — expenses & projects");
para("Who can open the module vs who can act:");
bullet([
  "Open Expenses list: any role with expenses.view (Managing Director, Finance Manager, Central Accountant, Branch Manager, Branch Accountant, Project Manager, Super Admin).",
  "Create / Submit expense: expenses.create (Project Manager, Super Admin).",
  "Approve / Reject expense: expenses.approve and not the creator (Managing Director, Finance Manager, Branch Manager, Super Admin).",
  "Pay expense: expenses.pay and not the creator (Finance Manager, Super Admin).",
  "Open Projects: projects.view (Finance Manager, Central Accountant, Branch Manager, Branch Accountant, Project Manager, Auditor, Super Admin).",
  "Create / Activate / Add milestone: projects.create (Project Manager, Super Admin).",
  "Request / Issue materials: projects.issue (Project Manager, Super Admin).",
  "Approve material / Recognize milestone: projects.approve and not the requester (Finance Manager, Branch Manager, Super Admin).",
]);

tip(
  "After updating roles",
  "Run pnpm db:seed so new role permissions are linked in the database. Users must sign out and sign back in (or refresh session) to pick up the updated permission set.",
);

const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i += 1) {
  doc.switchToPage(i);
  if (i === range.start) continue;
  doc.fillColor(C.muted).font("Helvetica").fontSize(8);
  doc.text("Solar Accounting — Roles & Permissions Guide", MARGIN, PAGE_H - 28, { width: CONTENT_W / 2, align: "left" });
  doc.text(`Page ${i}`, MARGIN + CONTENT_W / 2, PAGE_H - 28, { width: CONTENT_W / 2, align: "right" });
}

doc.end();

await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
});

console.log(`Wrote ${outFile}`);
