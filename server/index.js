'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { router: authRoutes, startPasswordApplyJob } = require('./routes/auth');
const contactRoutes = require('./routes/contact');
const reportRoutes = require('./routes/report');
const followRoutes = require('./routes/follow');


const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const hasClientBuild = fs.existsSync(DIST_DIR);
const trustProxyValue =
  process.env.TRUST_PROXY !== undefined
    ? process.env.TRUST_PROXY
    : isProduction
      ? '1'
      : false;

app.disable('x-powered-by');
app.set('trust proxy', trustProxyValue);

// ── CORS ──────────────────────────────────────────────────────────────────────
const defaultAllowedOrigins = isProduction ? '' : 'http://localhost:8080';
const allowedOrigins = (process.env.FRONTEND_ORIGIN || defaultAllowedOrigins)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOriginSet = new Set(allowedOrigins.map((origin) => origin.toLowerCase()));

const normalizeOrigin = (value) => {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return '';
  }
};

const isSameHostOrigin = (origin, req) => {
  try {
    return new URL(origin).host.toLowerCase() === (req.get('host') || '').toLowerCase();
  } catch {
    return false;
  }
};

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
});

app.use((req, res, next) => {
  return cors(
    {
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }

        const normalizedOrigin = normalizeOrigin(origin);
        if (
          (normalizedOrigin && allowedOriginSet.has(normalizedOrigin)) ||
          isSameHostOrigin(origin, req)
        ) {
          return callback(null, true);
        }

        callback(new Error(`CORS: origin "${origin}" not allowed`));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    },
  )(req, res, next);
});

app.use(express.json({ limit: '32kb' }));

// ── Global rate limiter ───────────────────────────────────────────────────────
// Applied broadly; tighter limits exist on auth routes themselves.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/contact', contactRoutes);
app.use('/report', reportRoutes);
app.use('/follow', followRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (hasClientBuild) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      maxAge: isProduction ? '1h' : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store');
          return;
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  app.get('*', (req, res, next) => {
    if (/^\/(?:auth|contact|follow|health|healthz|report)(?:\/|$)/.test(req.path)) {
      return next();
    }

    return res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[cyberx-auth] Server running on http://localhost:${PORT}`);
  console.log(`[cyberx-auth] Supabase URL: ${process.env.SUPABASE_URL || '(not set)'}`);
  console.log(`[cyberx-auth] Serving client build: ${hasClientBuild ? 'yes' : 'no'}`);

  // Start background job that applies confirmed password changes after 5 minutes
  startPasswordApplyJob();
  console.log('[cyberx-auth] Password apply job started (runs every 30s)');
});
