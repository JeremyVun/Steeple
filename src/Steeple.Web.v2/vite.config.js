// The dev server stands in for steeple's BFF.
//
// The API carries no CORS headers on purpose — nothing is meant to reach it
// from a browser origin of its own (CONTRACT4 §5). In development the proxy is
// that missing server: same-origin /api/v1 requests, forwarded to the local
// API. With the API down the proxy answers the failure quickly and the catalog
// falls back to its bundled seed.

import { defineConfig } from 'vite';

// The API normally listens on :5200. `STEEPLE_API_ORIGIN` moves the target for
// the cases where it cannot — a second API beside a running one, or a container
// mapped elsewhere — without editing this file.
const target = process.env.STEEPLE_API_ORIGIN ?? 'http://localhost:5200';

const proxy = {
  '/api': { target, changeOrigin: true },
  // Photographs are served by the API itself in local-disk media mode, so they
  // travel the same proxy as the wire does.
  '/media': { target, changeOrigin: true },
};

export default defineConfig({
  // Relative build assets keep the SPA deployable at either / or a stripped
  // reverse-proxy prefix such as /steeple/.
  base: './',
  server: { proxy },
  // A built bundle has to be walked through against the real API too — the flat
  // build (`npm run build:flat`) is verified by serving it, not by reading it.
  preview: { proxy },
});
