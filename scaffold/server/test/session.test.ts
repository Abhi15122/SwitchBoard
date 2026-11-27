import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCookies, serializeCookie, sessionIdFrom } from '../src/session.js';

test('parses several cookies, trims, and decodes values', () => {
  assert.deepEqual(parseCookies('a=1; b=hello%20world;c=3'), { a: '1', b: 'hello world', c: '3' });
});

test('the first value wins for a repeated name', () => {
  assert.equal(parseCookies('sb_sid=first; sb_sid=second').sb_sid, 'first');
});

test('tolerates junk, quotes, bad escapes and a missing header', () => {
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies('novalue; =x; ok="q"; bad=%E0%A4%A'), { ok: 'q', bad: '%E0%A4%A' });
});

test('keeps an equals sign inside the value', () => {
  assert.equal(parseCookies('t=a=b==').t, 'a=b==');
});

test('only a well-formed session id is accepted', () => {
  const id = 'A'.repeat(43);
  assert.equal(sessionIdFrom(`x=1; sb_sid=${id}`), id);
  assert.equal(sessionIdFrom('sb_sid=short'), null);
  assert.equal(sessionIdFrom(`sb_sid=${id}*`), null);
  assert.equal(sessionIdFrom(undefined), null);
});

test('the session cookie is HttpOnly, SameSite=Lax and scoped by path', () => {
  const c = serializeCookie('sb_sid', 'v', { maxAgeSec: 60, path: '/' });
  assert.match(c, /^sb_sid=v; Path=\/; Max-Age=60; HttpOnly; SameSite=Lax/);
});
