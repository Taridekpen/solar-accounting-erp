# Development progress

## Completed modules

### Section 1 — Project foundation and architecture

- pnpm workspace with `apps/web`, `apps/api`, `packages/shared`, and `packages/accounting-rules`.
- NestJS API with validated environment configuration, structured Pino logs, and a global exception filter.
- Prisma migration `20261009180000_init_system_metadata` and a repeatable seed for `system_metadata`.
- Health check for PostgreSQL, Redis, and the BullMQ system queue.
- Swagger UI at `/api/docs` when `NODE_ENV` is not `production`.
- React shell matching the reference layout: navy sidebar, header, breadcrumbs, light and dark themes, responsive navigation.
- Dashboard route bound to `GET /dashboard/summary`. Totals are decimal strings from the API. With no ledger, they are zero and the lists are empty.
- Shared money formatting for Nigerian Naira using `decimal.js`.
- Docker Compose for PostgreSQL 16, Redis 7, the API, and the web app.

### Section 2 — Company structure

- One legal company, branches, departments, employees, document sequences, reference roles and permissions, and the default chart of accounts.
- Soft delete is reserved for master records. Deactivating a branch changes status and leaves the row readable.
- Document numbers are allocated with `SELECT … FOR UPDATE` so concurrent requests receive distinct numbers.
- Branch lists and changes use the signed-in user's branch assignments. A restricted user cannot read another branch.
- Settings edits the company profile. Branches, departments, and employees are maintained from the shell. Departments and employees are linked from Settings and are not extra sidebar items.
- The header branch selector lists the signed-in user's branches, including inactive branches. A selected branch is sent as `X-Branch-Ids` and can only narrow that user's own assignments.

### Section 3 — Authentication, roles, and permissions

- HTTP-only session cookies, a readable CSRF cookie, Argon2id passwords, and TOTP enrollment for privileged roles before other protected routes.
- Five failed logins lock the account for 15 minutes. Login errors use the same message whether or not the email exists.
- Staff are invited by an administrator. The invitation token is returned once. There is no public registration and no mail server, so password reset stores only a hashed token and always returns the same accepted response.
- Users, sessions, invitation and reset tokens, role assignments, branch assignments, approval delegations, separation rules, and append-only audit events. A database trigger rejects updates and deletes of audit rows. Password hashes, tokens, and authenticator secrets are not written into audit payloads.
- Company-wide roles are not limited to branch rows. Other roles are limited to `user_branch_assignments`. `X-Branch-Scope` is no longer trusted.
- Protected routes require a session and the matching permission. Health, login, invitation activation, forgot-password, and reset-password stay public.
- Separation rules reject an originator approving their own restricted action. Background jobs on the system queue are rejected and audited when the user lacks the required permission.
- The login page sits outside the shell. Navigation uses the signed-in user's permissions. Users & Roles supports invitations, role and branch assignment, suspension, and session revocation.

### Section 4 — Accounting engine and chart of accounts

- One posting service records every journal. Sales, purchases, expenses, and banking modules are not built here; their event mappings are ready for those modules to call.
- Fiscal periods for the current year are seeded open. A closed period rejects posting unless the journal is an approved closed-period adjustment.
- Posted journals cannot be edited or deleted. A reversal is a new journal that preserves the original and cannot be repeated.
- Account balances, the trial balance, and dashboard sales, purchases, gross profit, and expenses come from posted journal lines. With no journals the dashboard totals stay `0.0000`.
- Opening balances must reconcile to the control accounts, including inventory quantity and value.
- Chart of Accounts and the accounting review workspace replace the Section 4 placeholders.

### Section 5 — Dashboards and navigation

- Dashboard sales, profit, expenses, cash, receivables, payables, and inventory valuation come from posted journal lines. Net profit is revenue minus cost of sales and operating expenses.
- The header can select all assigned branches, one branch, or several branches. The dashboard and its detail pages follow that selection.
- Charts for revenue, expenses, branch sales, branch profit, and cash movement use the selected date range. Each financial card opens the journal lines that add up to it. Pending approvals open the accounting review page.

### Section 6 — Customers, sales, and invoicing

- Customers belong to the company and are linked to branches. Duplicate phone numbers and email addresses are rejected.
- Quotations do not post revenue. An accepted quotation can become a draft invoice.
- Invoice totals, tax, and discounts are calculated by the API. Finalizing posts one journal and issues product stock. A receipt settles invoices or records an advance and does not post revenue again.
- Customer statements, aging, overdue invoices, product rankings, and revenue by category come from posted sales documents.
- Credit notes reverse revenue, tax, and inventory cost at the invoice line cost.

### Section 7 — Suppliers and procurement

- Suppliers belong to the company and are linked to branches. A second active supplier with the same phone or email is rejected. Bank account numbers are stored separately and responses show only the last four characters.
- Each branch has one main warehouse used as the goods-receipt destination.
- A requisition or purchase order can be submitted and approved by a different user. A branch approver can approve up to the company limit. A company-wide approver can approve any amount. Central procurement requires a company-wide user.
- A purchase order does not post a journal. A goods receipt increases stock and debits inventory against goods received not invoiced. A supplier bill clears that accrual, records a price difference, and creates Accounts Payable. A payment settles bills or records a supplier deposit.
- Supplier statements, procurement reports, and dashboard supplier aging come from posted bills.

### Section 8 — Inventory, warehouses, and costing

- Each branch has a main warehouse and an in-transit warehouse. Warehouse quantities show where stock sits. The quantity a sale can issue remains the branch balance, which excludes stock in transit.
- Receipts, opening lines, and customer returns recalculate the branch weighted-average cost. A sale stores that average on the invoice line and uses it for cost of sales. When the average is still zero, the sale uses the product's catalog cost.
- A transfer is drafted, approved by a different user, shipped, and received. Shipping debits Inventory in Transit and credits Inventory at the source. Receiving debits Inventory at the destination and credits Inventory in Transit. The company inventory total does not change.
- A stock count records the book quantity. A different user posts the variance. A shortage debits other operating expenses and credits inventory. A surplus does the opposite.
- Serial-tracked products need one in-stock serial at the selling branch for each unit. The sale stores the customer and invoice line. The same serial cannot be sold again.
- The inventory screen lists stock by warehouse with the available quantity and average cost from the API. Dashboard low-stock alerts, pending transfers, and inventory by category come from stock records. Category totals use movements inside the selected dates.

### Section 9 — Expenses and approval workflows

- Expense categories map to existing postable accounts. Inventory and fixed-asset accounts cannot be used as expense categories.
- A draft stores the receipt. Submitting sends it for approval. The creator cannot approve it. A branch approver can approve up to the company purchase limit. A company-wide approver can approve a larger amount. A later approval level, when one matches, must be a different user.
- Approval debits the category account and credits accrued expenses. Tax debits prepaid expenses. Rejection posts nothing. Payment by a different user clears the accrual from a postable cash account. A second payment is rejected.
- Expense reports cover branch, category, department, month, project, pending requests, unpaid approvals, and budget versus actual. A budget blocks approval when the month would go over it.

### Section 10 — Banking, cash, and reconciliation

- Each bank account maps to a general ledger account. The operating account uses the bank control account. Another bank account gets its own postable child account. Cash drawers and petty cash use the posted cash accounts. Book amounts are calculated from journals.
- A same-day transfer or deposit debits the destination account and credits the source. A transfer received on a later date uses Bank Transfers in Transit. Neither journal uses an income or expense account.
- A cash count compares the counted amount with the drawer balance. A different user posts a shortage to other operating expenses or an overage to other operating income.
- The cash book lists posted cash and bank lines and returns the opening balance, receipts, payments, and closing balance.
- A statement imports CSV rows or a manual line, suggests a match within three days, and can be matched by hand. Bank charges and interest post through the journal engine. A different user locks the statement. A locked statement rejects further changes. Matching does not read invoice status.

### Section 11 — Solar installation projects

- A project stores the contract, quotation, and budget. Profit, work in progress, and customer advances are calculated from posted journals.
- Reserving materials reduces the available quantity. A different user approves the issue. An installation issue debits work in progress and credits inventory once. Maintenance and repairs debit installation cost immediately. A return puts the quantity back at the issued cost.
- A customer deposit debits cash or bank and credits customer advances. It also creates a customer advance receipt. The deposit does not credit revenue.
- A milestone invoice debits accounts receivable and credits installation or maintenance revenue. The recognized cost is the remaining work in progress times the milestone amount divided by the contract value, capped at the remaining work in progress. Gross profit is recognized revenue minus installation cost.
- An expense linked to a milestone project accrues to work in progress. An expense without a project keeps the category account.
- The dashboard counts projects whose dates overlap the selected range and lists profitability from journals inside that range.

### Section 12 — Accounting books and financial reports

- The general journal, general ledger, trial balance, profit and loss, balance sheet, and cash flow are calculated from posted journal lines. Manual adjustments still use the existing journal approval path.
- Profit and loss can compare another period, the year to date, branches, and a statement budget. The balance sheet includes the current-year profit. A branch statement shows interbranch clearing so the accounting equation holds. Company clearing is zero.
- Cash flow uses the indirect method. Transfers between cash and bank accounts do not change profit or the company cash total.
- Receivable and payable ledgers agree with their control accounts. The inventory ledger lists quantity and value by product and warehouse.
- A fixed asset acquisition, straight-line depreciation, and disposal post through the journal. Tax codes carry an effective date, and a tax payment outside those dates is rejected.
- PDF, spreadsheet, and CSV downloads use the same rows as the on-screen report.

### Section 13 — Daily closing and financial periods

- A branch day stores sales, collections, credit sales, expenses, refunds, inventory exceptions, pending approvals, and the cash-count difference. Review is a different person, and the stored figures stay with the day.
- A month close moves a period from open to closing, records the twelve checklist results, and locks only after another person approves. Closed periods still reject posting. Reopening requires the reopen permission and a reason.
- Locking the last month of a year stores the statements first, then closes income and expense into retained earnings and opens the next year. The snapshot keeps the profit from before that transfer.

### Section 14 — Employees and basic salary accounting

- The employee directory keeps branch, department, employment status, and an optional sign-in link. Payroll amounts are not stored on the employee record.
- An accountant enters an approved external payroll summary. Approval posts gross salary expense, deduction liabilities, and salaries payable. A different person must approve.
- Salary payments settle one or more summaries, including partial settlement. Outstanding totals agree with account 2300.
- Future payroll runs must use the posting engine. See `docs/payroll-integration.md`.

### Section 15 — Administration, audit and configuration

- Settings is a hub for company profile, document templates, accounting mappings, tax codes, fiscal period status, approval policies, delegations, separation rules, managed documents, and searchable audit history.
- Company changes, branch changes, mapping edits, tax codes, templates, and document uploads write immutable audit events with sensitive values redacted.
- In-app notifications cover approval requests and outcomes, overdue invoices, low stock, supplier bills due, failed postings, and period-closing reminders. Optional email is a queue flag only.
- Managed documents enforce MIME type, a 2 MB size limit, and branch-aware access. The company logo is stored as a managed document.

### Section 16 — Data import, testing, and deployment

- Staged CSV import batches and rows (`import_batches`, `import_rows`) with permissions `imports.view` / `imports.manage`. Schema version **16**.
- Pipeline: upload → parse → validate → preview → approve (different user) → commit → report. Unbalanced opening trial balance / bank opening batches cannot be approved or committed. Commit uses domain services and `AccountingPostingService.importOpeningBalances` (no direct journal-line writes).
- Web **Data Import** page at `/imports` with amounts from the API only.
- Test packs: unit, integration orchestration, security, April 2028 accounting scenario, import pipeline, and backup restore.
- Production compose (`docker-compose.prod.yml`), `.env.production.example`, Postgres backup/restore scripts, CI workflow, `/health` queue depth metrics, and docs for deployment, critical workflows, and production readiness (human AAT items remain checklist-only).

## Database migrations

| Migration | Purpose |
| --- | --- |
| `20261009180000_init_system_metadata` | Application metadata only. No financial tables. |
| `20261009213000_organization` | Company, branches, departments, employees, document sequences, roles, permissions, and accounts. Rollback SQL is stored beside the migration. |
| `20261010010000_authentication` | Users, sessions, auth tokens, role and branch assignments, approval delegations, separation rules, and immutable audit events. Rollback SQL is stored beside the migration. |
| `20261010140000_accounting_engine` | Fiscal periods, journals, journal lines, account mappings, posting attempts, and opening balances. Rollback SQL is stored beside the migration. |
| `20261010210000_sales` | Customers, products, stock quantities, quotations, invoices, receipts, credit notes, and returns. |
| `20261010220000_procurement` | Suppliers, warehouses, requisitions, purchase orders, goods receipts, supplier bills, and supplier payments. Rollback SQL is stored beside the migration. |
| `20261010230000_inventory` | Warehouse types and quantities, average cost, serial status, stock transfers, and stock counts. |
| `20261010240000_expenses` | Expense categories, approval policies, budgets, expenses, and approval history. |
| `20261010250000_banking` | Bank accounts, cash drawers, transfers, cash counts, and bank statements. |
| `20261010260000_projects` | Installation projects, quotations, budgets, material requests, and milestones. |
| `20261010270000_financial_reports` | Tax codes, statement budgets, fixed assets, and warehouse links on stock movements. |
| `20261010280000_period_closing` | Daily closings, period checklist tasks, close approvals, and statement snapshots. |
| `20261010290000_salary_accounting` | Payroll summaries, deductions, salary payments, and PAYE and pension payable accounts. |
| `20261010300000_administration` | Company accounting defaults, document templates, managed documents, and notifications. |
| `20261010310000_data_import` | Import batches, import rows, and staged historical CSV import workflow. |

## API endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Checks PostgreSQL, Redis, and the queue connection. |
| GET | `/dashboard/summary` | Sales, profit, balances, and charts come from posted journal lines for the selected branches and dates. They are `0.0000` when nothing is posted. |
| GET | `/dashboard/details` | Journal lines that add up to a dashboard card. |
| GET, POST, PATCH | `/customers` | Customer records, branch links, and statements. |
| GET, POST | `/sales/quotations`, `/sales/invoices`, `/sales/receipts`, `/sales/returns` | Quotations, invoices, receipts, and returns. Invoice preview and PDF totals come from stored amounts. |
| GET, POST, PATCH | `/suppliers` | Supplier records, masked bank details, and statements. |
| GET, POST | `/purchases/orders`, `/purchases/receipts`, `/purchases/bills`, `/purchases/payments` | Purchase orders, goods receipts, supplier bills, and payments. Order and bill totals come from the API. |
| GET, POST | `/inventory/stock`, `/inventory/transfers`, `/inventory/counts`, `/inventory/serials` | Warehouse stock, transfers, counts, and serial lookup. Transfer and count journals are posted by the accounting service. |
| GET, POST | `/expenses` | Expense requests, approval, payment, receipts, and reports. Journals are posted by the accounting service. |
| GET, POST | `/banking` | Bank accounts, cash drawers, transfers, the cash book, and statement reconciliation. Journals are posted by the accounting service. |
| GET, POST | `/projects` | Installation projects, material issues, deposits, and milestone invoices. Journals are posted by the accounting service. A draft does not post. |
| GET, POST | `/reports` | Financial statements, subledgers, fixed assets, tax codes, and PDF, spreadsheet, and CSV exports. Totals come from posted journals. |
| GET, POST | `/closing` | Daily branch closings, month-end checklist, period lock, and authorized reopening. The year-end transfer posts through the accounting service. |
| GET, POST | `/payroll` | External payroll summaries, approval posting, and salary payments against account 2300. |
| GET, PATCH | `/employees/:id` | Employee profile, employment status, and linked sign-in. |
| GET, POST, PATCH | `/company` | Reads and updates the single company. A second company is rejected. |
| GET, POST, PATCH | `/branches` | Paginated branch maintenance. Deactivate through `PATCH /branches/:id/status`. |
| GET, POST, PATCH | `/departments` | Company-wide or branch departments. |
| GET, POST, PATCH | `/employees` | Employees without payroll amounts. |
| POST | `/document-numbers` | Allocates the next number for a branch and document type. |
| GET, POST, PATCH | `/accounts` | Chart of accounts with balances from posted lines. Creating an account requires `settings.manage`. |
| GET, POST | `/journals` | Manual journals wait for approval. Posted journals can be reversed. |
| POST | `/accounting/post` | Posts a mapped accounting event. |
| GET | `/accounting/review`, `/accounting/trial-balance` | Review queues and the trial balance. |
| POST | `/opening-balances`, `/fiscal-periods/:id/close` | Opening-balance import and period close. |
| GET | `/roles`, `/permissions` | Read-only reference data from the seed. Requires a session. |
| POST | `/auth/login`, `/auth/logout` | Creates and revokes an HTTP-only session. Mutations require the CSRF token. |
| POST | `/auth/forgot-password`, `/auth/reset-password`, `/auth/activate` | Public password recovery and invitation activation. Tokens are stored as hashes. |
| GET, DELETE | `/auth/sessions` | Lists and revokes sessions. |
| GET, POST, PATCH | `/users` | Staff list, invitation, role and branch assignment, and suspension. |
| POST | `/approvals/authorize` | Checks permission, branch scope, delegation, and separation of duties. |
| GET | `/audit-events` | Searchable audit history for `audit.view`, including redacted before and after values. |
| GET, PATCH | `/admin/*` | Document templates, account mappings, tax codes, fiscal periods, expense policies, delegations, separation rules, and branch settings. |
| GET, POST | `/documents` | Branch-aware managed document upload and download. |
| GET, POST | `/notifications` | In-app notification list, refresh, and mark-read. |
| GET, POST | `/imports` | Staged CSV import upload, parse, validate, preview, approve, commit, and report. |
| GET | `/api/docs` | Swagger UI in development and test only. |

## Tests

- `@solar/shared`: naira formatting and decimal-string rejection.
- `@solar/accounting-rules`: financial authority stays on the API.
- `@solar/api`: environment validation, Swagger visibility, health controller, dashboard totals from posted journals, branch scope, company timezone periods, organization rules, authentication, inventory costing, and the accounting engine against `solar_accounting_test`.
- `@solar/web`: permission-filtered navigation, dashboard display of API totals, form validation, table filtering, confirmation dialog.

## Accounting decisions

- Display currency is Nigerian Naira. Amounts crossing the API are decimal strings, not JavaScript numbers.
- Dashboard presets use the company timezone. The seeded timezone is `Africa/Lagos`. Custom ranges are passed through unchanged.
- Gross profit is not calculated in the browser. The API returns sales minus cost of sales from posted journal lines.
- `packages/accounting-rules` lists the posting events. The API is the only component that writes journals.

## Known limitations

- Authentication uses server sessions. Privileged accounts must enroll an authenticator before using the rest of the application. The development administrator is created from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` and its password is not overwritten on later seeds.
- Customers, suppliers, sales, and procurement are in place. Journal lines store customer and supplier ids, and opening-balance detail is checked against the control accounts.
- Later module routes show an explicit empty state. They do not call unfinished business APIs.
- PDF and Excel export of financial reports is Section 12.
- On this machine, host port 5432 is already used by another PostgreSQL server. Compose publishes the project database on port 5433. Inside Docker the API still uses the `postgres` hostname on port 5432.
- Chart axes, when data exists, convert posted decimal strings to numbers for scale only. They do not add or subtract amounts.

## Outstanding issues

None that block the Section 16 acceptance criteria. Section 17 has not started.
