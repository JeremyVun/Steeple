// The dev server stands in for steeple's BFF.
//
// The API carries no CORS headers on purpose — nothing is meant to reach it
// from a browser origin of its own (CONTRACT4 §5). In development the proxy is
// that missing server: same-origin /api/v1 requests, forwarded to the local
// API. With the API down the proxy answers the failure quickly and the catalog
// falls back to its bundled seed.

import { defineConfig } from 'vite';

const proxy = {
  '/api': {
    target: 'http://localhost:5200',
    changeOrigin: true,
  },
};

export default defineConfig({
  server: { proxy },
  // A built bundle has to be walked through against the real API too — the flat
  // build (`npm run build:flat`) is verified by serving it, not by reading it.
  preview: { proxy },
});
