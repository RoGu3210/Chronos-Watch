/**
 * Chronos — Local-dev backend
 *
 * Serves the static landing site and exposes the same API surface that
 * Vercel hosts in production:
 *
 *   POST /api/contact         — orchestrates row insert + welcome email + log
 *   POST /api/email-event     — Resend webhook receiver
 *   GET  /api/unsubscribe     — unsubscribe link target
 *   GET  /api/cron/followups  — daily cron (call manually for testing)
 *
 * The endpoint handlers live in api/*.js and are imported here so the same
 * code runs locally and on Vercel. This file is local-dev only — `npm start`.
 *
 *   1. cp .env.example .env  (then fill in keys)
 *   2. npm install
 *   3. npm start
 *   4. open http://localhost:3000
 */

import express from 'express';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import contactHandler from './api/contact.js';
import emailEventHandler from './api/email-event.js';
import unsubscribeHandler from './api/unsubscribe.js';
import followupsHandler from './api/cron/followups.js';
import dashboardLoginHandler from './api/dashboard/login.js';
import dashboardStatsHandler from './api/dashboard/stats.js';
import dashboardSubmissionsHandler from './api/dashboard/submissions.js';
import dashboardInteractionsHandler from './api/dashboard/interactions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '64kb' }));

// CORS preflight + permissive origin for browser-driven POSTs.
app.use(['/api/contact', '/api/email-event'], (req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, svix-signature, svix-id, svix-timestamp');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Vercel handlers expect (req, res) with req.query populated from the URL.
// Express provides req.query out of the box, so wiring is one-to-one.
app.post('/api/contact', (req, res) => contactHandler(req, res));
app.post('/api/email-event', (req, res) => contactHandler && emailEventHandler(req, res));
app.get('/api/unsubscribe', (req, res) => unsubscribeHandler(req, res));
app.all('/api/cron/followups', (req, res) => followupsHandler(req, res));
app.post('/api/dashboard/login', (req, res) => dashboardLoginHandler(req, res));
app.get('/api/dashboard/stats', (req, res) => dashboardStatsHandler(req, res));
app.get('/api/dashboard/submissions', (req, res) => dashboardSubmissionsHandler(req, res));
app.get('/api/dashboard/interactions', (req, res) => dashboardInteractionsHandler(req, res));

app.use(express.static(__dirname, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Chronos server running at http://localhost:${PORT}`);
  const checks = [
    ['SUPABASE_URL',              !!process.env.SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', !!process.env.SUPABASE_SERVICE_ROLE_KEY],
    ['RESEND_API_KEY',            !!process.env.RESEND_API_KEY],
    ['RESEND_WEBHOOK_SECRET',     !!process.env.RESEND_WEBHOOK_SECRET],
    ['CRON_SECRET',               !!process.env.CRON_SECRET]
  ];
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  }
});
