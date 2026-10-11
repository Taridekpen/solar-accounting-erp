-- Section 15: administration, audit support, documents, notifications

ALTER TABLE "companies"
  ADD COLUMN "inventory_costing_method" TEXT NOT NULL DEFAULT 'weighted_average',
  ADD COLUMN "money_rounding_mode" TEXT NOT NULL DEFAULT 'half_up',
  ADD COLUMN "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "document_templates" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "invoice_footer" TEXT NOT NULL DEFAULT '',
  "quotation_terms" TEXT NOT NULL DEFAULT '',
  "payment_advice" TEXT NOT NULL DEFAULT '',
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_templates_company_id_key" ON "document_templates"("company_id");

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_templates"
  ADD CONSTRAINT "document_templates_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "managed_documents" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "branch_id" UUID,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "document_kind" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "uploaded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "managed_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "managed_documents_company_id_entity_type_entity_id_idx"
  ON "managed_documents"("company_id", "entity_type", "entity_id");

CREATE INDEX "managed_documents_branch_id_idx" ON "managed_documents"("branch_id");

ALTER TABLE "managed_documents"
  ADD CONSTRAINT "managed_documents_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "managed_documents"
  ADD CONSTRAINT "managed_documents_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "managed_documents"
  ADD CONSTRAINT "managed_documents_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "link_path" TEXT,
  "branch_scope" JSONB,
  "read_at" TIMESTAMPTZ(6),
  "email_queued_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_recipient_user_id_created_at_idx"
  ON "notifications"("recipient_user_id", "created_at");

CREATE INDEX "notifications_recipient_user_id_type_entity_id_idx"
  ON "notifications"("recipient_user_id", "type", "entity_id");

CREATE INDEX "notifications_unread_idx"
  ON "notifications"("recipient_user_id")
  WHERE "read_at" IS NULL;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipient_user_id_fkey"
  FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "document_templates" ("id", "company_id", "invoice_footer", "quotation_terms", "payment_advice")
SELECT gen_random_uuid(), c."id", '', '', ''
FROM "companies" c
WHERE NOT EXISTS (
  SELECT 1 FROM "document_templates" t WHERE t."company_id" = c."id"
);
