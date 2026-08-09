#!/usr/bin/env node
// Production-provider smoke: build the real production graph with both SSO providers configured,
// serve it, open the shared identity panel, and prove both provider controls are rendered. Google's
// remote SDK is replaced with its smallest compatible local stand-in; the assertion is about this
// build's configuration and DOM, not third-party availability.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited ${code ?? signal}`));
    });
  });
}

async function openPort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForServer(url) {
  const expires = Date.now() + 30_000;
  while (Date.now() < expires) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`preview did not answer at ${url}`);
}

await run('npm', ['run', 'build:debug'], {
  cwd: root,
  env: {
    ...process.env,
    VITE_GOOGLE_CLIENT_ID: 'google-production-smoke.apps.exampleusercontent.com',
    VITE_APPLE_CLIENT_ID: 'com.example.steeple.web',
    VITE_APPLE_REDIRECT_URI: 'https://steeple.example/auth/apple/callback',
  },
});

const port = await openPort();
const origin = `http://127.0.0.1:${port}`;
const preview = spawn(
  resolve(root, 'node_modules/.bin/vite'),
  ['preview', '--outDir', 'dist-debug', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: root,
    env: { ...process.env, STEEPLE_API_ORIGIN: 'http://127.0.0.1:1' },
    stdio: 'inherit',
  }
);

let browser;
try {
  await waitForServer(origin);
  browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url() === 'https://accounts.google.com/gsi/client') {
      void request.respond({
        contentType: 'application/javascript',
        body: `globalThis.google={accounts:{id:{initialize(){},renderButton(host){
          const button=document.createElement('button');
          button.type='button';button.textContent='Continue with Google';host.append(button);
        }}}};`,
      });
      return;
    }
    void request.continue();
  });

  await page.goto(`${origin}/?world=off`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__steepleReady === true', { timeout: 60_000 });
  await page.evaluate('__steeple.roll.set(1)');
  await page.waitForFunction('__steeple.state.roll === 1', { timeout: 20_000 });
  await page.click('.account');
  await page.waitForSelector('.signin .identity__providers', { timeout: 20_000 });
  await page.waitForSelector('.signin .identity__google button', { timeout: 20_000 });

  const labels = await page.evaluate(() => ({
    google: document.querySelector('.signin .identity__google button')?.textContent?.trim(),
    apple: document.querySelector('.signin .provider--apple')?.textContent?.trim(),
  }));
  if (labels.google !== 'Continue with Google' || labels.apple !== 'Continue with Apple') {
    throw new Error(`provider controls did not render: ${JSON.stringify(labels)}`);
  }

  console.log('ok  production build renders Google and Apple sign-in controls');
} finally {
  await browser?.close().catch(() => {});
  preview.kill('SIGTERM');
}
