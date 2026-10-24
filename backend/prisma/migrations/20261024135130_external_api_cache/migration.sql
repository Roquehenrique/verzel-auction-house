-- CreateTable
CREATE TABLE "external_api_cache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_api_cache_pkey" PRIMARY KEY ("key")
);
