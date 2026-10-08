/**
 * Vercel entry point. Vercel imports this file and runs the exported Express app as one
 * serverless function (https://vercel.com/docs/frameworks/backend/express).
 * Locally and on a normal server, `npm run dev` / `npm start` run src/server.js instead.
 */
import express from 'express';
import mongoose from 'mongoose';
import { env } from './src/config/env.js';
import { createApp } from './src/app.js';

mongoose.set('strictQuery', true);

// One MongoDB connection per function instance, reused across requests.
let connecting = null;
function ensureDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connecting) {
    connecting = mongoose
      .connect(env.mongoUri, { dbName: env.mongoDb, serverSelectionTimeoutMS: 8000, maxPoolSize: 5 })
      .catch((err) => {
        connecting = null; // let the next request try again
        throw err;
      });
  }
  return connecting;
}

const app = express();
app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

// Only API routes need the database. The health check still answers (with db: "disconnected")
// so it shows what is wrong instead of failing.
app.use('/api', async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    if (req.path === '/health' || req.path === '/') return next();
    res.status(503).json({ error: { message: 'Database is not reachable right now. Please try again shortly.' } });
  }
});
app.use(createApp());

export default app;
