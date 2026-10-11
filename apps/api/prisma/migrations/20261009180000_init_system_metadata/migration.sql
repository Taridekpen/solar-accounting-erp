CREATE TABLE "system_metadata" (
    "id" UUID NOT NULL,
    "application_name" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_metadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_metadata_application_name_key" ON "system_metadata"("application_name");
