-- Uploaded files kept in the database (persistent across redeployments). Additive only.
-- CreateTable
CREATE TABLE "stored_files" (
    "key" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("key")
);


-- Bounded size (uploads are limited to 4 MB by the app; the host refuses larger request bodies anyway).
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 5242880 AND octet_length("content") = "byte_size");
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_key_check" CHECK ("key" ~ '^[0-9a-f-]{36}$');
