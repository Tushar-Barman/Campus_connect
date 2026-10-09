import http from 'node:http';
import { env } from './config/env.js'; // loads .env first, as P3's socket CORS reads CLIENT_URL
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js'; // P3: socket auth, rooms, presence, typing, receipts

const app = createApp();
const httpServer = http.createServer(app);

try {
  await connectDB(env.mongodbUri);
} catch (err) {
  console.error(
    `\n[db] Could not connect to MongoDB: ${err.message}\n` +
      '[db] Check MONGODB_URI, the database user/password, and that your IP is allowed\n' +
      '[db] in Atlas → Network Access (use 0.0.0.0/0 during the hackathon).\n'
  );
  process.exit(1);
}

// Once per process (it marks every user offline on boot). Run a SINGLE instance:
// presence is tracked in memory, so don't scale to 2+ instances on Render.
initSocket(httpServer);

httpServer.listen(env.port, () => {
  console.log(`[server] CampusConnect API on http://localhost:${env.port} (${env.nodeEnv})`);
  console.log(`[server] Allowed client origins: ${env.clientUrls.join(', ')}`);
});

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  httpServer.close();
  await disconnectDB();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
