// Migrations are generated from src/db/schema.ts: `npm run db:generate`. They are applied by the API on start.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
