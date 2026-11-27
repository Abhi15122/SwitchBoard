import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { test } from 'node:test';
import { identityFrom, verifyIdToken, type Jwk } from '../src/oidc.js';

const ISS = 'http://idp.test';
const AUD = 'switchboard-web';
const NOW = 1_800_000_000;

const b64 = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const keypair = (kid: string) => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' } as Jwk };
};

function token(privateKey: KeyObject, kid: string, claims: Record<string, unknown>, alg = 'RS256') {
  const head = b64({ alg, typ: 'JWT', kid });
  const body = b64({ iss: ISS, aud: AUD, sub: 'u_ben', exp: NOW + 3600, nonce: 'n1', ...claims });
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}

function expecting(published: Jwk[][], over: Record<string, unknown> = {}) {
  const calls: boolean[] = [];
  const expect = {
    issuer: ISS,
    audience: AUD,
    nonce: 'n1',
    nowSec: NOW,
    getKeys: async (refresh: boolean) => {
      calls.push(refresh);
      return published[Math.min(refresh ? 1 : 0, published.length - 1)]!;
    },
    ...over,
  };
  return { expect, calls };
}

const main = keypair('k1');

test('a valid token yields its claims', async () => {
  const { expect } = expecting([[main.jwk]]);
  const claims = await verifyIdToken(token(main.privateKey, 'k1', {}), expect);
  assert.equal(claims.sub, 'u_ben');
});

test('a token signed by another key is rejected', async () => {
  const other = keypair('k1');
  const { expect } = expecting([[main.jwk]]);
  await assert.rejects(verifyIdToken(token(other.privateKey, 'k1', {}), expect), /signature/);
});

test('a tampered payload is rejected', async () => {
  const { expect } = expecting([[main.jwk]]);
  const [h, , s] = token(main.privateKey, 'k1', {}).split('.');
  const forged = `${h}.${b64({ iss: ISS, aud: AUD, sub: 'u_asha', exp: NOW + 3600, nonce: 'n1' })}.${s}`;
  await assert.rejects(verifyIdToken(forged, expect), /signature/);
});

test('wrong audience, issuer, nonce and expiry are rejected', async () => {
  const { expect } = expecting([[main.jwk]]);
  await assert.rejects(verifyIdToken(token(main.privateKey, 'k1', { aud: 'someone-else' }), expect), /audience/);
  await assert.rejects(verifyIdToken(token(main.privateKey, 'k1', { iss: 'http://evil.test' }), expect), /issuer/);
  await assert.rejects(verifyIdToken(token(main.privateKey, 'k1', { nonce: 'other' }), expect), /nonce/);
  await assert.rejects(verifyIdToken(token(main.privateKey, 'k1', { exp: NOW - 3600 }), expect), /expired/);
});

test('an audience list that includes the client is accepted', async () => {
  const { expect } = expecting([[main.jwk]]);
  await verifyIdToken(token(main.privateKey, 'k1', { aud: ['x', AUD] }), expect);
});

test('alg none and HS256 are rejected', async () => {
  const { expect } = expecting([[main.jwk]]);
  const none = `${b64({ alg: 'none', kid: 'k1' })}.${b64({ iss: ISS, aud: AUD, sub: 'x', exp: NOW + 60, nonce: 'n1' })}.`;
  await assert.rejects(verifyIdToken(none, expect), /header/);
  await assert.rejects(verifyIdToken(token(main.privateKey, 'k1', {}, 'HS256'), expect), /header/);
});

test('an unknown kid triggers exactly one refetch and then succeeds with the rotated key', async () => {
  const rotated = keypair('k2');
  const { expect, calls } = expecting([[main.jwk], [rotated.jwk]]);
  const claims = await verifyIdToken(token(rotated.privateKey, 'k2', {}), expect);
  assert.equal(claims.sub, 'u_ben');
  assert.deepEqual(calls, [false, true]);
});

test('a kid that is still unknown after the refetch is rejected', async () => {
  const stranger = keypair('k9');
  const { expect, calls } = expecting([[main.jwk]]);
  await assert.rejects(verifyIdToken(token(stranger.privateKey, 'k9', {}), expect), /unknown signing key/);
  assert.deepEqual(calls, [false, true]);
});

test('workspaces come from the claim and malformed entries are dropped', () => {
  const me = identityFrom({ sub: 'u_eli', name: 'Eli', email: 'e@x', workspaces: [{ id: 'ws_acme', role: 'agent' }, { id: 'ws_x', role: 'root' }, 'junk', { role: 'admin' }] });
  assert.deepEqual(me.workspaces, [{ id: 'ws_acme', role: 'agent' }]);
});
