#!/bin/sh
# Start-up of the API container: secrets, migrations, demo data, server.
set -e

# 1. Secrets. Values given in the environment always win. Otherwise they are
#    generated once and kept in a volume: the bid signing key must never change,
#    or the audit would flag every existing bid as tampered.
#    On hosts with an ephemeral disk (e.g. Render free plan) generated secrets
#    would be lost on every deploy, so REQUIRE_SECRETS=true makes the start-up
#    fail instead of silently creating new keys.
SECRETS_FILE=/app/secrets/generated.env
if [ -z "$JWT_SECRET" ] || [ -z "$BID_SIGNING_PRIVATE_KEY" ] || [ -z "$PSEUDONYM_SECRET" ]; then
  if [ "$REQUIRE_SECRETS" = "true" ]; then
    echo "ERROR: JWT_SECRET, BID_SIGNING_PRIVATE_KEY and PSEUDONYM_SECRET must be set (REQUIRE_SECRETS=true)." >&2
    exit 1
  fi
  if [ ! -f "$SECRETS_FILE" ]; then
    echo "Generating secrets (first start) in $SECRETS_FILE"
    mkdir -p "$(dirname "$SECRETS_FILE")"
    {
      node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
      npx tsx scripts/generate-keys.ts
    } > "$SECRETS_FILE"
  fi
  # Only fill the variables that were not provided.
  while IFS='=' read -r key value; do
    eval "current=\${$key}"
    if [ -z "$current" ]; then export "$key=$value"; fi
  done < "$SECRETS_FILE"
fi

# 2. Database (created if missing) and schema (non-destructive).
npx tsx scripts/ensure-database.ts
npx prisma migrate deploy

# 3. Demo data, only on an empty database.
npx tsx scripts/seed-if-empty.ts

# 4. API.
exec node dist/main.js
