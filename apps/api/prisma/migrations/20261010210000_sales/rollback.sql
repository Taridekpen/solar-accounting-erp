ALTER TABLE "journal_lines" DROP CONSTRAINT IF EXISTS "journal_lines_customer_id_fkey";

DROP TABLE IF EXISTS "sales_return_lines";
DROP TABLE IF EXISTS "sales_credit_note_lines";
DROP TABLE IF EXISTS "sales_credit_notes";
DROP TABLE IF EXISTS "sales_return_requests";
DROP TABLE IF EXISTS "customer_receipt_allocations";
DROP TABLE IF EXISTS "customer_receipt_methods";
DROP TABLE IF EXISTS "customer_receipts";
DROP TABLE IF EXISTS "sales_invoice_allocations";
DROP TABLE IF EXISTS "sales_invoice_taxes";
DROP TABLE IF EXISTS "sales_invoice_lines";
DROP TABLE IF EXISTS "sales_invoices";
DROP TABLE IF EXISTS "sales_quotation_lines";
DROP TABLE IF EXISTS "sales_quotations";
DROP TABLE IF EXISTS "stock_balances";
DROP TABLE IF EXISTS "stock_movements";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "product_categories";
DROP TABLE IF EXISTS "customer_branches";
DROP TABLE IF EXISTS "customers";

DROP TYPE IF EXISTS "return_settlement";
DROP TYPE IF EXISTS "return_status";
DROP TYPE IF EXISTS "receipt_method";
DROP TYPE IF EXISTS "sale_settlement";
DROP TYPE IF EXISTS "invoice_status";
DROP TYPE IF EXISTS "quotation_status";
DROP TYPE IF EXISTS "stock_movement_type";
DROP TYPE IF EXISTS "product_type";
DROP TYPE IF EXISTS "customer_type";

DELETE FROM "document_sequences" WHERE "document_type" IN ('customer', 'credit_note');
