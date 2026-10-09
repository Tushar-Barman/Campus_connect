import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { isDbConnected } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import aiRoutes from './routes/ai.js';
import campusRoutes from './routes/campuses.js';
import { notFound, errorHandler } from './middleware/error.js';
import { HttpError } from './utils/http.js';

/**
 * Builds the Express app (no listening, no DB connection) so it can be
 * started by index.js and reasoned about on its own.
 */
export function createApp() {
  const app = express();

  // Render / Vercel sit behind one proxy: needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header = not a browser (curl, server-to-server). CORS is a browser protection.
        if (!origin || env.clientUrls.includes(origin)) return callback(null, true);
        return callback(new HttpError(403, 'Origin not allowed'));
      },
    })
  );
  app.use(express.json({ limit: '100kb' }));

  // features tells the frontend which optional buttons to show (upload, Chat Memory).
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      db: isDbConnected() ? 'connected' : 'disconnected',
      features: { uploads: Boolean(env.cloudinary), ai: env.aiEnabled },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/campuses', campusRoutes); // Round 2

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
