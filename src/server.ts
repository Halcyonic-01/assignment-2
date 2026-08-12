import { buildApp } from './app.js';
import { outboxPoller } from './modules/events/outbox.poller.js';

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

start();
