import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Creates a standard Express app for a VTT lab mini-app.
 * @param {object} opts
 * @param {string} opts.name - App display name
 * @param {number} opts.port - Port to listen on
 * @param {string} opts.importMetaUrl - Pass import.meta.url from calling module
 * @param {function} [opts.setupRoutes] - Optional function(app) to add custom routes
 * @returns {express.Application}
 */
export function createApp({ name, port, importMetaUrl, setupRoutes }) {
  const app = express();
  const __dirname = path.dirname(fileURLToPath(importMetaUrl));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Health check
  app.get('/api/health', (req, res) => res.json({ status: 'ok', app: name }));

  // Custom routes
  if (setupRoutes) setupRoutes(app);

  app.listen(port, () => {
    console.log(`\n  🎲 ${name}`);
    console.log(`  → http://localhost:${port}\n`);
  });

  return app;
}
