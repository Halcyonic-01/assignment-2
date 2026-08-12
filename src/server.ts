import { buildApp } from './app.js';
import { outboxPoller } from './modules/events/outbox.poller.js';
import sql from './db/index.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = buildApp();

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 Reneo Backend API listening on http://${HOST}:${PORT}`);
    console.log(`📚 API Documentation (Swagger) available at http://${HOST}:${PORT}/docs`);

    // Start event poller (B3)
    outboxPoller.start(3000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Fix 9: Graceful shutdown hooks — stop poller and DB connection on exit
async function shutdown(signal: string) {
  console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);
  outboxPoller.stop();
  await app.close();
  await sql.end();
  console.log('✅ Server shut down cleanly.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
