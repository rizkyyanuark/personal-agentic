import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLabState } from './ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_DIST = process.env.OFFICE_DIST_DIR || path.join(__dirname, '../../dist');

export function createApp({ stateReader = readLabState, distDirectory = DEFAULT_DIST } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Production serves only the Vite build, never source, tests, or private files.
  const appAssets = {
    dotfiles: 'deny',
    index: false,
    redirect: false,
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  };
  app.use(
    '/assets',
    express.static(path.join(distDirectory, 'assets'), {
      ...appAssets,
      maxAge: '7d',
      immutable: true
    })
  );
  app.get(['/', '/index.html'], (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(distDirectory, 'index.html'));
  });
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  app.get('/api/state', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const state = stateReader();
    res.status(state.connection === 'error' ? 503 : 200).json(state);
  });

  // Status is a projection of the SQLite ledger. Browser requests cannot inject
  // events or approve actions.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}
