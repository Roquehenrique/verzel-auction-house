# API (NestJS + Prisma). Single stage on purpose: the start-up script runs
# migrations and the seed, which need the Prisma CLI and tsx (dev dependencies).
FROM node:20-slim

# OpenSSL is required by the Prisma schema engine (migrations).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first (cached layer). The postinstall runs `prisma generate`,
# which needs the schema and the Prisma config.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=3001
EXPOSE 3001

# Uses $PORT: hosting platforms (e.g. Render) choose the port at runtime.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
