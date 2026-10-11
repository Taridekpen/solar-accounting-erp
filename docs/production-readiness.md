# Production readiness (Section 16.7)

Automated gates run in CI and local verification. Human acceptance items stay unchecked until an accountant or operator completes them.

## Automated (agent / CI)

- [x] Schema version 16 with import batches and rows
- [x] Import pipeline rejects unbalanced opening financials before approve/commit
- [x] Import commit uses the posting engine for opening balances (no direct journal-line writes)
- [x] Security pack: unauthenticated 401, cross-branch 403, permission deny, CSRF on unsafe methods, document MIME/size reject, Prisma parameterized access, duplicate payment reject, concurrent document-number uniqueness
- [x] April 2028 accounting scenario pack asserts TB, inventory, AR/AP, bank, P&L, balance sheet equation, and cash flow vs cash movement
- [x] Backup dump/restore into a throwaway database with `schema_version` present
- [x] `GET /health` includes BullMQ depth and failed job count
- [x] Production compose, example env, migration entrypoint, and deployment docs

## Human checklist (not marked done by automation)

- [ ] Accountant acceptance of opening balances and control accounts after real import
- [ ] Independent review/sign-off of management reports for the go-live period
- [ ] Secrets rotated from development defaults (`SESSION_SECRET`, database password, admin password)
- [ ] TLS certificates installed (not lab self-signed) for the public origin
- [ ] Log shipping and on-call alert routes confirmed for `/health` failures and elevated failed job counts
- [ ] Backup schedule and restore drill recorded with restore time objective
- [ ] Separation-of-duties users confirmed for import approve vs create, and for payment approvals
