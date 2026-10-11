# Future payroll integration

Full payroll runs stay outside this application. Accountants enter an approved summary from an external payroll process and settle salaries payable through the existing posting engine.

A future payroll module must:

- Call `PayrollService` for draft summaries, approval, and payments.
- Post journals only through `AccountingPostingService.postSystemDocument`.
- Keep PAYE, pension, payslip, and leave calculations outside the browser and outside this ledger.
- Reuse the `PayrollRunPort` contract in `apps/api/src/modules/payroll/payroll-port.ts` for the summary and payment inputs.
