// Starts the API. Settings come from the environment (.env.example lists them all).
// Local settings live in .env (never committed). Real environments set the variables themselves.
try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}
import { buildApp } from './app';

const app = await buildApp();
await app.server.listen({ port: app.cfg.PORT, host: '0.0.0.0' });

// Finish the requests in flight, then stop.
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    app.close().finally(() => process.exit(0));
  });
