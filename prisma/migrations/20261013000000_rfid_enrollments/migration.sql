-- CreateTable
CREATE TABLE "rfid_enrollments" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "card_uid" TEXT,
    "failure" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfid_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rfid_enrollments_device_id_expires_at_idx" ON "rfid_enrollments"("device_id", "expires_at");

-- AddForeignKey
ALTER TABLE "rfid_enrollments" ADD CONSTRAINT "rfid_enrollments_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "scanner_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_enrollments" ADD CONSTRAINT "rfid_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

