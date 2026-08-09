// The dev server stands in for steeple's BFF.
//
// The API carries no CORS headers on purpose — nothing is meant to reach it
// from a browser origin of its own (CONTRACT4 §5). In development the proxy is
// that missing server: same-origin /api/v1 requests, forwarded to the local
// API. With the API down the proxy answers the failure quickly and the catalog
// falls back to its bundled seed.
//
// It also stands in for nginx. The clean routes are served by the edge in
// production (nginx.conf), and a dev origin that answered them differently
// would be a dev origin every route bug hides in — so the same route table,
// the same depth-correct boot documents and the same 502-with-a-body contract
// are implemented here for `vite dev` and `vite preview` alike
// (docs/contracts/seo.md SEO-D3, Delivery ownership).
//
// One thing is deliberately NOT mirrored: the unknown-path 404. Vite's own
// fallback serves index.html, and this file does not fight it — production
// nginx is the 404 authority, and a dev server that faked one would only let
// the real one rot untested. tools/seo-route-test.mjs checks that case against
// compose, where it is real.

import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

// The API normally listens on :5200. `STEEPLE_API_ORIGIN` moves the target for
// the cases where it cannot — a second API beside a running one, or a container
// mapped elsewhere — without editing this file.
const target = process.env.STEEPLE_API_ORIGIN ?? 'http://localhost:5200';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The clean routes that are not listings, and the boot document each one needs.
 *
 * `depth` is the number of path segments, which is how many `../` steps that
 * document's own <base> climbs to reach the deployment root — the one thing
 * that differs between public/route-documents/app-depth-{1,2,3}.html. `store`
 * mirrors design §8: public routes may be revalidated, addresses behind a
 * sign-in never enter a shared cache.
 */
const APP_ROUTES = [
  { pattern: /^\/browse$/, depth: 1, robots: 'noindex, follow', store: 'no-cache' },
  { pattern: /^\/venue\/[^/]+$/, depth: 2, robots: 'noindex, follow', store: 'no-cache' },
  { pattern: /^\/apply\/[^/]+\/[^/]+$/, depth: 3, robots: 'noindex, nofollow', store: 'no-store' },
  { pattern: /^\/journal$/, depth: 1, robots: 'noindex, nofollow', store: 'no-store' },
  { pattern: /^\/desk$/, depth: 1, robots: 'noindex, nofollow', store: 'no-store' },
  { pattern: /^\/desk\/[^/]+$/, depth: 2, robots: 'noindex, nofollow', store: 'no-store' },
  { pattern: /^\/letter\/[^/]+$/, depth: 2, robots: 'noindex, nofollow', store: 'no-store' },
];

// Vite matches a `^`-prefixed proxy key as a regular expression against the
// whole `req.url` — query string included. Anchoring on `$` alone would send
// /space/v/r?world=off to the SPA instead of the API, which is exactly the
// visit every harness makes.
const END = '(\\?|$)';

/** The listing route, in the one shape the API answers (SEO-D9's trailing slash included). */
const LISTING_ROUTE = `^/space/[^/]+/[^/]+/?${END}`;
const SITEMAP_ROUTE = `^/sitemap\\.xml${END}`;
// robots.txt is rendered by the API too, because its `Sitemap:` line has to be
// an absolute URL and only the API knows this deployment's public base
// (design.md §7). There is no static copy in public/ any more — one robots.txt
// truth, and a dev origin that served a second one would be a dev origin the
// relative-URL bug could come back in.
const ROBOTS_ROUTE = `^/robots\\.txt${END}`;

/**
 * A boot document, read from public/ — which is where they live and what Vite
 * copies verbatim into the build output, so dev and preview read the same
 * bytes the built bundle ships.
 */
function bootDocument(depth) {
  return readFileSync(resolvePath(here, 'public', `route-documents/app-depth-${depth}.html`), 'utf8');
}

function sendDocument(res, status, html, { robots, store }) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', store);
  if (robots) res.setHeader('X-Robots-Tag', robots);
  res.end(html);
}

/** nginx's step 4, plus the internal-only part of the boot documents' contract. */
function cleanRoutes() {
  return (req, res, next) => {
    const path = (req.url ?? '/').split('?')[0];

    // The boot documents have no public address of their own; nginx makes that
    // true with `internal`, and Vite would otherwise serve them out of public/.
    if (path.startsWith('/route-documents/')) {
      res.statusCode = 404;
      res.end();
      return;
    }

    const route = APP_ROUTES.find((candidate) => candidate.pattern.test(path));
    if (!route) {
      next();
      return;
    }

    sendDocument(res, 200, bootDocument(route.depth), route);
  };
}

/**
 * The listing proxy's failure contract, and the reason it is a `configure` hook
 * rather than one line of proxy table: when the API cannot be reached the
 * status stays 502 and the body becomes the deepest boot document, so a browser
 * can still open the app over it and a crawler is told the truth rather than a
 * false 200 or 404 (SEO-D3, design §10). Vite's own proxy error answer is a 500
 * with a stack trace in it.
 */
const listingProxy = (proxy) => {
  proxy.on('error', (error, req, res) => {
    if (!res || typeof res.writeHead !== 'function' || res.writableEnded) return;
    console.log(`  [proxy] ${req?.url ?? ''} — ${error?.message ?? error}`);
    sendDocument(res, 502, bootDocument(3), { robots: 'noindex', store: 'no-store' });
  });
};

const proxy = {
  '/api': { target, changeOrigin: true },
  // Photographs are served by the API itself in local-disk media mode, so they
  // travel the same proxy as the wire does.
  '/media': { target, changeOrigin: true },
  // The listing document, path preserved and — deliberately — Host preserved
  // too. The API's Development fallback builds its canonical, og:url and <base>
  // from the request's own scheme and host, so leaving the Host alone is what
  // makes a locally rendered document name *this* origin rather than the API's,
  // which is in turn what makes its handoff, assets and `api/v1` resolve.
  [LISTING_ROUTE]: { target, changeOrigin: false, configure: listingProxy },
  // Only nginx exposed this before, so a dev origin had no sitemap to check a
  // route matrix against. Same Host rule, same reason: <loc> has to name the
  // origin that was asked.
  [SITEMAP_ROUTE]: { target, changeOrigin: false, rewrite: () => '/api/v1/sitemap.xml' },
  // Same Host rule again, and no rewrite: the API answers /robots.txt at its own
  // root, exactly as nginx proxies it (nginx.conf `location = /robots.txt`).
  [ROBOTS_ROUTE]: { target, changeOrigin: false },
};

export default defineConfig({
  // Relative build assets keep the SPA deployable at either / or a stripped
  // reverse-proxy prefix such as /steeple/.
  base: './',
  server: { proxy },
  // A built bundle has to be walked through against the real API too — the flat
  // build (`npm run build:flat`) is verified by serving it, not by reading it.
  preview: { proxy },
  plugins: [
    {
      name: 'steeple-clean-routes',
      configureServer(server) {
        server.middlewares.use(cleanRoutes());
      },
      configurePreviewServer(server) {
        server.middlewares.use(cleanRoutes());
      },
    },
  ],
});
