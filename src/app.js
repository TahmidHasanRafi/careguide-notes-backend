import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.trustProxy); // TRUST_PROXY: false locally, 1 on Vercel (see config/env.js)
  app.disable('x-powered-by');
  app.use(
    helmet({
      // Locally the site runs on plain http://localhost, so don't force https sub-requests.
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: env.isProd ? [] : null } },
    })
  );
  // Auth uses a Bearer token (no cookies), so CORS only decides which websites may call the API.
  const vercelApp = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
  const allowedOrigin = (origin, cb) => {
    if (!origin) return cb(null, true); // curl, server-to-server, same-origin
    const ok = env.corsOrigins.includes(origin) || (env.corsAllowVercelApp && vercelApp.test(origin));
    cb(null, ok);
  };
  app.use(
    cors({
      origin: env.corsOrigins.length ? allowedOrigin : true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(express.json({ limit: '100kb' }));

  // One log line per API request, e.g.  POST /api/auth/register 201 84ms
  // Makes it easy to see in the terminal that the frontend is talking to this API.
  app.use('/api', (req, res, next) => {
    if (process.env.LOG_REQUESTS === 'false') return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const origin = req.headers.origin ? `  (origin: ${req.headers.origin})` : '';
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms${origin}`);
    });
    next();
  });

  app.get('/api', (_req, res) => {
    res.json({ name: 'Secure Notes API', health: '/api/health', docs: 'See README.md in the repository' });
  });
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
  });

  app.use('/api', apiRouter);

  // Serve the frontend from the same origin, so locally everything runs on one URL.
  // The frontend's config.js is replaced so it calls this server at /api.
  if (env.serveFrontend && fs.existsSync(env.frontendDir)) {
    app.get('/config.js', (_req, res) => {
      res.type('application/javascript').send("window.APP_CONFIG = { API_BASE: '/api' };\n");
    });
    app.use(express.static(env.frontendDir, { index: 'index.html', maxAge: env.isProd ? '1h' : 0 }));
  } else {
    app.get('/', (_req, res) => res.redirect('/api'));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
