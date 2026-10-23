import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env instead of env(): `prisma generate` must work without a
    // database URL (e.g. during the deploy build). Migrate commands still fail
    // with a clear error if it is missing.
    url: process.env.DATABASE_URL,
  },
});
