-- CreateEnum
CREATE TYPE "Role" AS ENUM ('AUCTIONEER', 'BIDDER');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEPOSIT', 'PURCHASE', 'SALE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "user_id" UUID NOT NULL,
    "balance_cents" INTEGER NOT NULL DEFAULT 0,
    "committed_cents" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "lot_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "auctioneer_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "external_source" TEXT NOT NULL,
    "external_id" TEXT,
    "starting_bid_cents" INTEGER NOT NULL,
    "min_increment_cents" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "original_ends_at" TIMESTAMPTZ(3) NOT NULL,
    "current_bid_cents" INTEGER,
    "current_leader_id" UUID,
    "bid_count" INTEGER NOT NULL DEFAULT 0,
    "last_bid_hash" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "settled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "bidder_id" UUID NOT NULL,
    "bidder_pseudonym" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "winner_id" UUID NOT NULL,
    "winner_pseudonym" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "share_code" TEXT NOT NULL,
    "chain_head_hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "ledger_entries_user_id_created_at_idx" ON "ledger_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "lots_auctioneer_id_idx" ON "lots"("auctioneer_id");

-- CreateIndex
CREATE INDEX "lots_starts_at_idx" ON "lots"("starts_at");

-- CreateIndex
CREATE INDEX "lots_ends_at_idx" ON "lots"("ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "bids_hash_key" ON "bids"("hash");

-- CreateIndex
CREATE INDEX "bids_bidder_id_idx" ON "bids"("bidder_id");

-- CreateIndex
CREATE UNIQUE INDEX "bids_lot_id_sequence_key" ON "bids"("lot_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_lot_id_key" ON "receipts"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_share_code_key" ON "receipts"("share_code");

-- CreateIndex
CREATE INDEX "receipts_winner_id_idx" ON "receipts"("winner_id");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_auctioneer_id_fkey" FOREIGN KEY ("auctioneer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_current_leader_id_fkey" FOREIGN KEY ("current_leader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants enforced by the database itself (added manually: Prisma
-- does not generate CHECK constraints). They protect the data even if the
-- application has a bug.

-- Wallet: available = balance - committed can never be negative.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance_cents" >= 0);
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_committed_non_negative" CHECK ("committed_cents" >= 0);
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_committed_within_balance" CHECK ("committed_cents" <= "balance_cents");

-- Ledger: the entry type gives the direction, so the amount is always positive.
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount_cents" > 0);

-- Lots
ALTER TABLE "lots" ADD CONSTRAINT "lots_starting_bid_positive" CHECK ("starting_bid_cents" > 0);
ALTER TABLE "lots" ADD CONSTRAINT "lots_min_increment_positive" CHECK ("min_increment_cents" > 0);
ALTER TABLE "lots" ADD CONSTRAINT "lots_ends_after_start" CHECK ("ends_at" > "starts_at" AND "original_ends_at" > "starts_at");
ALTER TABLE "lots" ADD CONSTRAINT "lots_ends_not_before_original" CHECK ("ends_at" >= "original_ends_at");
ALTER TABLE "lots" ADD CONSTRAINT "lots_bid_count_non_negative" CHECK ("bid_count" >= 0);
-- Either the lot has no bids (no current bid, no leader, no chain head) or it has all of them.
ALTER TABLE "lots" ADD CONSTRAINT "lots_current_bid_consistent" CHECK (
    ("bid_count" = 0 AND "current_bid_cents" IS NULL AND "current_leader_id" IS NULL AND "last_bid_hash" IS NULL)
    OR
    ("bid_count" > 0 AND "current_bid_cents" IS NOT NULL AND "current_leader_id" IS NOT NULL AND "last_bid_hash" IS NOT NULL)
);
ALTER TABLE "lots" ADD CONSTRAINT "lots_current_bid_above_starting" CHECK ("current_bid_cents" IS NULL OR "current_bid_cents" >= "starting_bid_cents");

-- Bids
ALTER TABLE "bids" ADD CONSTRAINT "bids_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "bids" ADD CONSTRAINT "bids_sequence_positive" CHECK ("sequence" >= 1);

-- Receipts
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_amount_positive" CHECK ("amount_cents" > 0);
