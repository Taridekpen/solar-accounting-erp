# Critical workflows

Operational paths that must stay correct before go-live. Amounts always come from posted journals and document services on the API.

## Sales to cash

1. Create or import a customer.
2. Post a cash or credit invoice (stock issues for products).
3. Collect a receipt; allocations settle invoices without posting revenue again.
4. Confirm AR aging and the trial balance control account.

## Purchase to pay

1. Create or import a supplier.
2. Receive goods (inventory and GRNI), then bill (AP).
3. Pay the bill; confirm AP aging and cash/bank movement.

## Inventory and transfers

1. Opening stock or goods receipt sets weighted-average cost.
2. Inter-branch transfer: draft → approve → ship → receive.
3. Company inventory total is unchanged by transfer; valuation reports use movement costs.

## Banking

1. Import or enter bank statement lines.
2. Match to receipts/payments/transfers.
3. Reconcile; unresolved differences remain visible on banking reports.

## Period close

1. Prepare the daily closing figures from posted activity.
2. Close the fiscal period when checklists pass.
3. Posting into a closed period requires an approved closed-period adjustment.

## Historical data import

1. Upload CSV (`POST /imports`).
2. Parse → validate → preview.
3. A different user with `imports.manage` approves.
4. Commit applies masters through domain services and opening financials through `AccountingPostingService.importOpeningBalances`.
5. Unbalanced opening trial balance / bank opening batches cannot be approved or committed.
6. Read the stored import report after commit.

## Payroll and projects

- Payroll runs post salary journals for an open period.
- Project material issues post inventory and project cost through the posting engine.
