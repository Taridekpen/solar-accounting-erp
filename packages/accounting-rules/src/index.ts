export const FINANCIAL_AUTHORITY = "api" as const;
export const POSTING_ENGINE_SECTION = 4 as const;

export interface PostingEventDefinition {
  code: string;
  debitAccountCode: string;
  creditAccountCode: string;
  taxAccountCode?: string;
  taxSide?: "debit" | "credit";
}

export const POSTING_EVENTS: readonly PostingEventDefinition[] = [
  { code: "cash_sale", debitAccountCode: "1000", creditAccountCode: "4000", taxAccountCode: "2400", taxSide: "credit" },
  { code: "cash_sale_cogs", debitAccountCode: "5000", creditAccountCode: "1300" },
  { code: "credit_sale", debitAccountCode: "1200", creditAccountCode: "4000", taxAccountCode: "2400", taxSide: "credit" },
  { code: "credit_sale_cogs", debitAccountCode: "5000", creditAccountCode: "1300" },
  { code: "customer_payment", debitAccountCode: "1100", creditAccountCode: "1200" },
  { code: "customer_advance", debitAccountCode: "1100", creditAccountCode: "2100" },
  { code: "customer_advance_applied", debitAccountCode: "2100", creditAccountCode: "1200" },
  { code: "supplier_invoice_inventory", debitAccountCode: "1300", creditAccountCode: "2000", taxAccountCode: "1500", taxSide: "debit" },
  { code: "supplier_payment", debitAccountCode: "2000", creditAccountCode: "1100" },
  { code: "operating_expense_paid", debitAccountCode: "6900", creditAccountCode: "1000" },
  { code: "accrued_expense", debitAccountCode: "6900", creditAccountCode: "2200" },
  { code: "bank_transfer", debitAccountCode: "1100", creditAccountCode: "1000" },
  { code: "inventory_cost", debitAccountCode: "5000", creditAccountCode: "1300" },
  { code: "fixed_asset_purchase", debitAccountCode: "1600", creditAccountCode: "1100" },
  { code: "depreciation", debitAccountCode: "6700", creditAccountCode: "1650" },
  { code: "salary_accrual", debitAccountCode: "6000", creditAccountCode: "2300" },
  { code: "salary_payment", debitAccountCode: "2300", creditAccountCode: "1100" },
];

export function postingEvent(code: string): PostingEventDefinition | undefined {
  return POSTING_EVENTS.find((event) => event.code === code);
}
