-- CreateTable
CREATE TABLE "lot_images" (
    "lot_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "source_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_images_pkey" PRIMARY KEY ("lot_id")
);

-- AddForeignKey
ALTER TABLE "lot_images" ADD CONSTRAINT "lot_images_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
