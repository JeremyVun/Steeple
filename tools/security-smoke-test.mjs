#!/usr/bin/env node

// Deployment smoke test: the former public Compose key must never authenticate. Usage:
// node tools/security-smoke-test.mjs https://steeple.example.com
import { createHmac, randomUUID } from 'node:crypto'

const origin = process.argv[2]?.replace(/\/$/, '')
if (!origin) throw new Error('Pass the deployed web origin as the only argument.')

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const header = encode({ alg: 'HS256', typ: 'JWT' })
const payload = encode({
  iss: 'steeple-api',
  aud: 'steeple',
  sub: randomUUID(),
  sid: randomUUID(),
  iat: now,
  nbf: now - 5,
  exp: now + 300,
})
const repositoryKey = Buffer.from('4kdPT0yylVMLDzUyD9BXXtDNbjM01xd1Cx3BgDMHo9Q=', 'base64')
const signature = createHmac('sha256', repositoryKey).update(`${header}.${payload}`).digest('base64url')

const response = await fetch(`${origin}/api/v1/me`, {
  headers: { Authorization: `Bearer ${header}.${payload}.${signature}` },
})

if (response.status !== 401) {
  throw new Error(`Repository-key token returned ${response.status}; expected 401.`)
}

console.log('PASS repository-known JWT signing key is rejected (401)')
