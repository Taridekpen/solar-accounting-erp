/**
 * Contract for a future payroll module. That module must call
 * PayrollService.createSummary / approveSummary / createPayment and must
 * post journals only through AccountingPostingService. It must not embed
 * PAYE or pension formulas in the browser.
 */
export interface PayrollRunPort {
  createSummary(input: {
    branchId: string;
    departmentId?: string;
    periodStart: string;
    periodEnd: string;
    grossAmount: string;
    netAmount: string;
    approvalReference: string;
    summaryFileName: string;
    summaryFileBase64: string;
    deductions: { accountId: string; description: string; amount: string }[];
  }): Promise<{ id: string; summaryNumber: string }>;

  approveSummary(id: string): Promise<{ id: string; status: string }>;

  createPayment(input: {
    branchId: string;
    paymentDate: string;
    paymentAccountId: string;
    bankReference: string;
    allocations: { summaryId: string; amount: string }[];
  }): Promise<{ id: string; paymentNumber: string }>;
}
