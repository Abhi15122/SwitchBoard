import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import express from 'express';
import { createAccess, csrfGuard, memberRole } from '../src/access.js';
import { canRelease } from '../src/conversations.js';
import { config } from '../src/config.js';
import type { SessionData } from '../src/session.js';

const ben: SessionData = { sub: 'u_ben', name: 'Ben', email: 'b@x', workspaces: [{ id: 'ws_acme', role: 'agent' }] };
const asha: SessionData = { sub: 'u_asha', name: 'Asha', email: 'a@x', workspaces: [{ id: 'ws_acme', role: 'admin' }] };
const ghost: SessionData = { sub: 'u_ghost', name: 'Ghost', email: 'g@x', workspaces: [{ id: 'ws_nowhere', role: 'agent' }] };
const people: Record<string, SessionData> = { ben, asha, ghost };

const { requireSession, requireMember } = createAccess(async (req) => people[req.get('x-test-user') ?? ''] ?? null);

const app = express();
app.use(express.json(), csrfGuard);
app.get('/me', requireSession, (req, res) => res.json({ sub: req.session!.sub }));
app.get('/inbox', requireMember, (req, res) => res.json({ workspace: req.auth!.workspace, role: req.auth!.role }));
app.post('/inbox', requireMember, (req, res) => res.json({ workspace: req.auth!.workspace }));

let server: Server;
let base = '';
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

const call = (path: string, user?: string, init: RequestInit = {}) => fetch(base + path, { ...init, headers: { ...(user ? { 'x-test-user': user } : {}), ...(init.headers as object) } });

test('no session is 401 everywhere', async () => {
  assert.equal((await call('/me')).status, 401);
  assert.equal((await call('/inbox?workspace=ws_acme')).status, 401);
});

test('a member gets in and the workspace comes from verified membership', async () => {
  const res = await call('/inbox?workspace=ws_acme', 'ben');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { workspace: 'ws_acme', role: 'agent' });
});

test('a signed-in non-member is 403, also for unknown workspaces and for forged claims of one', async () => {
  assert.equal((await call('/inbox?workspace=ws_globex', 'ben')).status, 403);
  assert.equal((await call('/inbox?workspace=ws_unknown', 'ben')).status, 403);
  assert.equal((await call('/inbox?workspace=ws_nowhere', 'ghost')).status, 403);
});

test('a missing workspace is a 400, and a body workspace is checked like a query one', async () => {
  assert.equal((await call('/inbox', 'ben')).status, 400);
  const post = (workspace: string) => call('/inbox', 'ben', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace }) });
  assert.equal((await post('ws_acme')).status, 200);
  assert.equal((await post('ws_globex')).status, 403);
});

test('a state-changing request from a foreign origin is refused, same-site and header-less are allowed', async () => {
  const post = (origin?: string) => call('/inbox?workspace=ws_acme', 'ben', { method: 'POST', headers: origin ? { origin } : {} });
  assert.equal((await post('http://evil.example')).status, 403);
  assert.equal((await post(config.webOrigin)).status, 200);
  assert.equal((await post(base)).status, 200);
  assert.equal((await post()).status, 200);
  assert.equal((await call('/inbox?workspace=ws_acme', 'ben', { headers: { origin: 'http://evil.example' } })).status, 200);
});

test('memberRole reads the role from the session', () => {
  assert.equal(memberRole(asha, 'ws_acme'), 'admin');
  assert.equal(memberRole(ben, 'ws_acme'), 'agent');
  assert.equal(memberRole(ben, 'ws_globex'), null);
  assert.equal(memberRole(ben, undefined), null);
});

test('release is for the holder or an admin; an unassigned conversation can be released by anyone', () => {
  assert.equal(canRelease('agent', 'u_ben', 'u_ben'), true);
  assert.equal(canRelease('agent', 'u_ben', 'u_eli'), false);
  assert.equal(canRelease('admin', 'u_asha', 'u_eli'), true);
  assert.equal(canRelease('agent', 'u_ben', null), true);
});
