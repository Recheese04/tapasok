-- Profile pictures stored in the database (persistent across redeployments). One row per account.
CREATE TABLE "profile_photos" (
    "user_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_photos_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only processed images of a bounded size are ever stored.
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_mime_check" CHECK ("mime" IN ('image/webp', 'image/jpeg', 'image/png'));
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 1048576 AND octet_length("content") = "byte_size");
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_dims_check" CHECK ("width" BETWEEN 1 AND 2048 AND "height" BETWEEN 1 AND 2048);
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_version_check" CHECK ("version" >= 1);
