-- Reverse the procurement migration. Prisma does not run this file automatically.

ALTER TABLE "journal_lines" DROP CONSTRAINT IF EXISTS "journal_lines_supplier_id_fkey";
DROP TABLE IF EXISTS "procurement_approvals";
DROP TABLE IF EXISTS "supplier_payment_allocations";
DROP TABLE IF EXISTS "supplier_payments";
DROP TABLE IF EXISTS "supplier_bill_lines";
DROP TABLE IF EXISTS "supplier_bills";
DROP TABLE IF EXISTS "goods_receipt_serials";
DROP TABLE IF EXISTS "goods_receipt_lines";
DROP TABLE IF EXISTS "goods_receipts";
DROP TABLE IF EXISTS "purchase_order_lines";
DROP TABLE IF EXISTS "purchase_orders";
DROP TABLE IF EXISTS "purchase_requisition_lines";
DROP TABLE IF EXISTS "purchase_requisitions";
DROP TABLE IF EXISTS "warehouses";
DROP TABLE IF EXISTS "supplier_bank_details";
DROP TABLE IF EXISTS "supplier_branches";
DROP TABLE IF EXISTS "suppliers";
DROP TYPE IF EXISTS "supplier_payment_method";
DROP TYPE IF EXISTS "supplier_payment_status";
DROP TYPE IF EXISTS "supplier_bill_status";
DROP TYPE IF EXISTS "purchase_order_status";
DROP TYPE IF EXISTS "procurement_mode";
DROP TYPE IF EXISTS "requisition_status";
DROP TYPE IF EXISTS "procurement_priority";
DELETE FROM "document_sequences" WHERE "document_type" IN ('supplier', 'requisition', 'supplier_bill');
ALTER TABLE "companies" DROP COLUMN IF EXISTS "purchase_approval_limit";
UPDATE "accounts" SET "account_subtype" = 'inventory' WHERE "account_code" = '1310';
