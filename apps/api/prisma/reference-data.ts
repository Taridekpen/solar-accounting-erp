export const DEVELOPMENT_COMPANY = {
  singletonKey: "default",
  legalName: "Solar & Inverter Co.",
  tradingName: "Solar & Inverter Co.",
  country: "Nigeria",
  baseCurrency: "NGN",
  timezone: "Africa/Lagos",
  fiscalYearStartMonth: 1,
} as const;

export const HEAD_OFFICE = {
  branchCode: "HO",
  name: "Head Office",
  city: "Lagos",
  state: "Lagos",
  country: "Nigeria",
  isHeadOffice: true,
} as const;

export const DEFAULT_DEPARTMENTS = [
  { code: "SALES", name: "Sales" },
  { code: "FIN", name: "Finance" },
  { code: "PROC", name: "Procurement" },
  { code: "INV", name: "Inventory" },
  { code: "INST", name: "Installation" },
  { code: "MAINT", name: "Maintenance" },
  { code: "ADMIN", name: "Administration" },
] as const;

export const DOCUMENT_TYPES = [
  { documentType: "sales_invoice", prefix: "INV" },
  { documentType: "quotation", prefix: "QT" },
  { documentType: "customer", prefix: "CUS" },
  { documentType: "credit_note", prefix: "CN" },
  { documentType: "supplier", prefix: "SUP" },
  { documentType: "requisition", prefix: "REQ" },
  { documentType: "supplier_bill", prefix: "PIN" },
  { documentType: "stock_transfer", prefix: "TRF" },
  { documentType: "stock_count", prefix: "CNT" },
  { documentType: "purchase_order", prefix: "PO" },
  { documentType: "goods_receipt", prefix: "GRN" },
  { documentType: "customer_receipt", prefix: "RCT" },
  { documentType: "supplier_payment", prefix: "PAY" },
  { documentType: "expense", prefix: "EXP" },
  { documentType: "bank_transfer", prefix: "BTR" },
  { documentType: "cash_count", prefix: "CSH" },
  { documentType: "journal", prefix: "JRN" },
  { documentType: "project", prefix: "PRJ" },
  { documentType: "fixed_asset", prefix: "AST" },
  { documentType: "salary_summary", prefix: "PAYR" },
  { documentType: "salary_payment", prefix: "SPAY" },
] as const;

export const SEPARATION_ACTIONS = [
  "purchases.approve",
  "purchases.receive",
  "expenses.approve",
  "expenses.pay",
  "accounting.journal.approve",
  "sales.approve",
] as const;

export const COMPANY_WIDE_ROLES = [
  "super_administrator",
  "managing_director",
  "finance_manager",
  "central_accountant",
  "auditor",
] as const;

export const PRIVILEGED_ROLES = [
  "super_administrator",
  "managing_director",
  "finance_manager",
  "central_accountant",
] as const;

export const PERMISSIONS = [
  "dashboard.view",
  "sales.create",
  "sales.view",
  "sales.approve",
  "sales.reverse",
  "sales.discount",
  "expenses.create",
  "expenses.view",
  "expenses.approve",
  "expenses.pay",
  "purchases.create",
  "purchases.view",
  "purchases.approve",
  "purchases.receive",
  "inventory.view",
  "inventory.transfer",
  "inventory.adjust",
  "inventory.count",
  "accounting.view",
  "accounting.journal.view",
  "accounting.journal.create",
  "accounting.journal.approve",
  "accounting.period.close",
  "accounting.period.reopen",
  "closing.view",
  "closing.daily.prepare",
  "closing.daily.review",
  "reports.view",
  "reports.branch.view",
  "reports.company.view",
  "banking.reconcile",
  "banking.transfer",
  "customers.view",
  "suppliers.view",
  "accounts.view",
  "users.view",
  "users.manage",
  "branches.view",
  "branches.manage",
  "settings.view",
  "settings.manage",
  "audit.view",
  "notifications.view",
  "documents.view",
  "documents.manage",
  "projects.view",
  "projects.create",
  "projects.issue",
  "projects.approve",
  "payroll.view",
  "payroll.create",
  "payroll.approve",
  "payroll.pay",
  "imports.view",
  "imports.manage",
] as const;

export const ROLES: { code: string; name: string; permissions: readonly string[] }[] = [
  { code: "super_administrator", name: "Super Administrator", permissions: PERMISSIONS },
  {
    code: "managing_director",
    name: "Managing Director",
    permissions: ["dashboard.view", "reports.company.view", "reports.branch.view", "reports.view", "sales.approve", "purchases.approve", "expenses.approve", "notifications.view"],
  },
  {
    code: "finance_manager",
    name: "Finance Manager",
    permissions: ["dashboard.view", "accounting.view", "accounting.journal.view", "accounting.journal.approve", "accounting.period.close", "accounting.period.reopen", "closing.view", "closing.daily.review", "expenses.approve", "expenses.pay", "banking.reconcile", "banking.transfer", "reports.company.view", "reports.view", "accounts.view", "projects.approve", "payroll.view", "payroll.approve", "payroll.pay", "settings.view", "audit.view", "notifications.view", "documents.view", "documents.manage", "imports.view", "imports.manage"],
  },
  {
    code: "central_accountant",
    name: "Central Accountant",
    permissions: ["dashboard.view", "accounting.view", "accounting.journal.view", "accounting.journal.create", "accounting.journal.approve", "accounting.period.close", "closing.view", "closing.daily.prepare", "reports.company.view", "reports.branch.view", "reports.view", "accounts.view", "banking.reconcile", "projects.view", "payroll.view", "payroll.create", "settings.view", "audit.view", "notifications.view", "documents.view", "documents.manage", "imports.view", "imports.manage"],
  },
  {
    code: "branch_manager",
    name: "Branch Manager",
    permissions: ["dashboard.view", "reports.branch.view", "reports.view", "closing.view", "closing.daily.review", "expenses.approve", "sales.view", "purchases.view", "purchases.approve", "inventory.view", "branches.view", "projects.approve", "payroll.view", "notifications.view", "documents.view"],
  },
  {
    code: "branch_accountant",
    name: "Branch Accountant",
    permissions: ["dashboard.view", "accounting.journal.view", "accounting.journal.create", "reports.branch.view", "closing.view", "closing.daily.prepare", "expenses.view", "banking.reconcile", "accounts.view", "projects.view", "payroll.view", "payroll.create", "notifications.view", "documents.view"],
  },
  {
    code: "sales_officer",
    name: "Sales Officer",
    permissions: ["sales.create", "sales.view", "sales.discount", "customers.view", "notifications.view"],
  },
  {
    code: "procurement_officer",
    name: "Procurement Officer",
    permissions: ["purchases.create", "purchases.view", "suppliers.view", "notifications.view"],
  },
  {
    code: "inventory_officer",
    name: "Inventory Officer",
    permissions: ["inventory.view", "inventory.transfer", "inventory.count", "purchases.receive", "notifications.view"],
  },
  {
    code: "project_manager",
    name: "Project Manager",
    permissions: ["dashboard.view", "inventory.view", "expenses.create", "expenses.view", "projects.view", "projects.create", "projects.issue", "notifications.view"],
  },
  {
    code: "auditor",
    name: "Auditor",
    permissions: ["dashboard.view", "sales.view", "purchases.view", "inventory.view", "accounting.view", "accounting.journal.view", "reports.view", "reports.branch.view", "reports.company.view", "accounts.view", "customers.view", "suppliers.view", "branches.view", "users.view", "settings.view", "projects.view", "audit.view", "notifications.view", "documents.view", "imports.view"],
  },
];

export type AccountSeed = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  subtype: string;
  parentCode?: string;
  normalBalance: "debit" | "credit";
  postable?: boolean;
  control?: boolean;
};

export const PRODUCT_CATEGORIES = [
  "Solar Panels",
  "Inverters",
  "Lithium Batteries",
  "Tubular Batteries",
  "Charge Controllers",
  "Mounting Equipment",
  "Cables",
  "Breakers",
  "Electrical Accessories",
  "Installation Consumables",
] as const;

export const EXPENSE_CATEGORIES = [
  { name: "Transportation", accountCode: "6200" },
  { name: "Fuel", accountCode: "6200" },
  { name: "Rent", accountCode: "6100" },
  { name: "Utilities", accountCode: "6300" },
  { name: "Internet", accountCode: "6300" },
  { name: "Office Supplies", accountCode: "6900" },
  { name: "Repairs", accountCode: "6500" },
  { name: "Marketing", accountCode: "6400" },
  { name: "Staff Reimbursements", accountCode: "6900" },
  { name: "Installation Expenses", accountCode: "5100" },
  { name: "Bank Charges", accountCode: "6600" },
  { name: "Miscellaneous Operating Expenses", accountCode: "6900" },
] as const;

export const SEEDED_PRODUCTS = [
  { sku: "PNL-001", name: "Solar Panel", category: "Solar Panels", productType: "product" as const, sellingPrice: "150000.0000", cost: "100000.0000", revenueCode: "4000" },
  { sku: "INV-001", name: "Inverter", category: "Inverters", productType: "product" as const, sellingPrice: "250000.0000", cost: "180000.0000", revenueCode: "4100" },
  { sku: "INS-001", name: "Installation service", category: "Installation Consumables", productType: "service" as const, sellingPrice: "50000.0000", cost: "0.0000", revenueCode: "4400" },
];

export const DEFAULT_ACCOUNTS: AccountSeed[] = [
  { code: "1000", name: "Cash on Hand", type: "asset", subtype: "cash", normalBalance: "debit" },
  { code: "1010", name: "Petty Cash", type: "asset", subtype: "cash", normalBalance: "debit" },
  { code: "1100", name: "Bank Accounts", type: "asset", subtype: "bank", normalBalance: "debit", postable: false, control: true },
  { code: "1110", name: "Bank Transfers in Transit", type: "asset", subtype: "bank", parentCode: "1100", normalBalance: "debit" },
  { code: "1200", name: "Accounts Receivable", type: "asset", subtype: "receivable", normalBalance: "debit", control: true },
  { code: "1300", name: "Inventory", type: "asset", subtype: "inventory", normalBalance: "debit", control: true },
  { code: "1310", name: "Goods Received Not Invoiced", type: "asset", subtype: "grni", normalBalance: "debit" },
  { code: "1320", name: "Inventory in Transit", type: "asset", subtype: "inventory", normalBalance: "debit" },
  { code: "1400", name: "Installation Work in Progress", type: "asset", subtype: "wip", normalBalance: "debit" },
  { code: "1500", name: "Prepaid Expenses", type: "asset", subtype: "prepayment", normalBalance: "debit" },
  { code: "1600", name: "Fixed Assets", type: "asset", subtype: "fixed_asset", normalBalance: "debit", control: true },
  { code: "1650", name: "Accumulated Depreciation", type: "asset", subtype: "contra_asset", parentCode: "1600", normalBalance: "credit" },
  { code: "2000", name: "Accounts Payable", type: "liability", subtype: "payable", normalBalance: "credit", control: true },
  { code: "2100", name: "Customer Advances", type: "liability", subtype: "advance", normalBalance: "credit" },
  { code: "2200", name: "Accrued Expenses", type: "liability", subtype: "accrual", normalBalance: "credit" },
  { code: "2300", name: "Salaries Payable", type: "liability", subtype: "payroll", normalBalance: "credit" },
  { code: "2310", name: "PAYE Payable", type: "liability", subtype: "payroll", normalBalance: "credit" },
  { code: "2320", name: "Pension Payable", type: "liability", subtype: "payroll", normalBalance: "credit" },
  { code: "2400", name: "Tax Payable", type: "liability", subtype: "tax", normalBalance: "credit" },
  { code: "2500", name: "Supplier Deposits", type: "liability", subtype: "deposit", normalBalance: "credit" },
  { code: "2600", name: "Loans Payable", type: "liability", subtype: "loan", normalBalance: "credit" },
  { code: "3000", name: "Share Capital", type: "equity", subtype: "capital", normalBalance: "credit" },
  { code: "3100", name: "Retained Earnings", type: "equity", subtype: "retained_earnings", normalBalance: "credit" },
  { code: "3200", name: "Current Year Earnings", type: "equity", subtype: "current_earnings", normalBalance: "credit" },
  { code: "4000", name: "Solar Panel Sales", type: "revenue", subtype: "sales", normalBalance: "credit" },
  { code: "4100", name: "Inverter Sales", type: "revenue", subtype: "sales", normalBalance: "credit" },
  { code: "4200", name: "Battery Sales", type: "revenue", subtype: "sales", normalBalance: "credit" },
  { code: "4300", name: "Accessories Sales", type: "revenue", subtype: "sales", normalBalance: "credit" },
  { code: "4400", name: "Installation Revenue", type: "revenue", subtype: "service", normalBalance: "credit" },
  { code: "4500", name: "Maintenance Revenue", type: "revenue", subtype: "service", normalBalance: "credit" },
  { code: "4900", name: "Other Operating Income", type: "revenue", subtype: "other_income", normalBalance: "credit" },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", subtype: "cost_of_sales", normalBalance: "debit" },
  { code: "5100", name: "Installation Direct Costs", type: "expense", subtype: "cost_of_sales", normalBalance: "debit" },
  { code: "6000", name: "Salaries", type: "expense", subtype: "operating", normalBalance: "debit" },
  { code: "6100", name: "Rent", type: "expense", subtype: "operating", normalBalance: "debit" },
  { code: "6200", name: "Transportation", type: "expense", subtype: "operating", normalBalance: "debit" },
  { code: "6300", name: "Utilities", type: "expense", subtype: "operating", normalBalance: "debit" },
  { code: "6400", name: "Marketing", type: "expense", subtype: "operating", normalBalance: "debit" },
  { code: "6500", name: "Repairs", type: "expense", subtype: "operating", normalBalance: "debit" },
  { code: "6600", name: "Bank Charges", type: "expense", subtype: "finance", normalBalance: "debit" },
  { code: "6700", name: "Depreciation", type: "expense", subtype: "depreciation", normalBalance: "debit" },
  { code: "6800", name: "Tax Expense", type: "expense", subtype: "tax_expense", normalBalance: "debit" },
  { code: "6900", name: "Other Operating Expenses", type: "expense", subtype: "operating", normalBalance: "debit" },
  { code: "2420", name: "Withholding Tax Payable", type: "liability", subtype: "tax", normalBalance: "credit" },
];
