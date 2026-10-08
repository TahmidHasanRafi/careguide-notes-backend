import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';

try {
  await connectDB();
} catch {
  process.exit(1); // reason already printed by connectDB()
}

const app = createApp();
const server = app.listen(env.port, env.host, () => {
  const shown = env.host === '0.0.0.0' || env.host === '127.0.0.1' ? 'localhost' : env.host;
  console.log(`API listening on http://${env.host}:${env.port} (${env.nodeEnv})`);
  if (env.serveFrontend) console.log(`\n  Open the app:  http://${shown}:${env.port}\n`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
