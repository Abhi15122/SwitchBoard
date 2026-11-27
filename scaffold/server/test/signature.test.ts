import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { verifyPigeonSignature } from '../src/signature.js';
import { statusRank } from '../src/store.js';

const SECRET = 'whsec_pigeon_dev';
const NOW = 1_800_000_000;
const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'message.inbound', text: 'héllo' }));

const mac = (t: number | string, raw: Buffer, secret = SECRET) => createHmac('sha256', secret).update(`${t}.`).update(raw).digest('hex');
const header = (t: number | string, raw: Buffer = body, secret = SECRET) => `t=${t},v1=${mac(t, raw, secret)}`;

test('accepts a correctly signed body', () => {
  assert.equal(verifyPigeonSignature(header(NOW), body, SECRET, NOW), 'ok');
});

test('accepts uppercase hex and extra unknown keys', () => {
  assert.equal(verifyPigeonSignature(`t=${NOW},v1=${mac(NOW, body).toUpperCase()},v0=zz`, body, SECRET, NOW), 'ok');
});

test('rejects a wrong secret', () => {
  assert.equal(verifyPigeonSignature(header(NOW, body, 'not-the-secret'), body, SECRET, NOW), 'bad');
});

test('rejects a tampered body', () => {
  const tampered = Buffer.from(body.toString().replace('hello', 'HELLO').replace('evt_1', 'evt_2'));
  assert.equal(verifyPigeonSignature(header(NOW), tampered, SECRET, NOW), 'bad');
});

test('rejects a signature made for a different timestamp', () => {
  assert.equal(verifyPigeonSignature(`t=${NOW + 1},v1=${mac(NOW, body)}`, body, SECRET, NOW), 'bad');
});

test('missing header is bad, not an error', () => {
  assert.equal(verifyPigeonSignature(undefined, body, SECRET, NOW), 'bad');
  assert.equal(verifyPigeonSignature('', body, SECRET, NOW), 'bad');
});

test('malformed headers are bad and never throw', () => {
  const junk = ['garbage', 't=', 'v1=', ',', ',,,', `t=${NOW}`, `v1=${mac(NOW, body)}`, `t${NOW},v1${mac(NOW, body)}`, '=', 't=1,v1', '\u0000\u0001', 'a'.repeat(100_000)];
  for (const h of junk) assert.equal(verifyPigeonSignature(h, body, SECRET, NOW), 'bad', h.slice(0, 20));
  for (const h of [null, 42, {}, ['t=1'], true]) assert.equal(verifyPigeonSignature(h, body, SECRET, NOW), 'bad');
});

test('wrong-length or non-hex v1 is bad', () => {
  const good = mac(NOW, body);
  for (const v1 of [good.slice(0, 62), good.slice(0, 63), good + '00', good + '0', 'zz'.repeat(32), good.slice(0, 63) + 'g', '']) {
    assert.equal(verifyPigeonSignature(`t=${NOW},v1=${v1}`, body, SECRET, NOW), 'bad', v1);
  }
});

test('non-numeric, negative, fractional and oversized t is bad', () => {
  for (const t of ['abc', '-5', '1.5', '1e9', '0x10', ' ', '9'.repeat(40)]) {
    assert.equal(verifyPigeonSignature(`t=${t},v1=${mac(t, body)}`, body, SECRET, NOW), 'bad', t);
  }
});

test('repeated keys are bad', () => {
  assert.equal(verifyPigeonSignature(`${header(NOW)},v1=${mac(NOW, body)}`, body, SECRET, NOW), 'bad');
  assert.equal(verifyPigeonSignature(`${header(NOW)},v1=${'0'.repeat(64)}`, body, SECRET, NOW), 'bad');
  assert.equal(verifyPigeonSignature(`t=${NOW},${header(NOW)}`, body, SECRET, NOW), 'bad');
});

test('a validly signed old timestamp is stale', () => {
  assert.equal(verifyPigeonSignature(header(NOW - 3600), body, SECRET, NOW), 'stale');
  assert.equal(verifyPigeonSignature(header(NOW - 301), body, SECRET, NOW), 'stale');
});

test('a validly signed timestamp far in the future is stale', () => {
  assert.equal(verifyPigeonSignature(header(NOW + 3600), body, SECRET, NOW), 'stale');
  assert.equal(verifyPigeonSignature(header(NOW + 301), body, SECRET, NOW), 'stale');
});

test('timestamps up to five minutes either way are genuine', () => {
  assert.equal(verifyPigeonSignature(header(NOW - 300), body, SECRET, NOW), 'ok');
  assert.equal(verifyPigeonSignature(header(NOW + 300), body, SECRET, NOW), 'ok');
  assert.equal(verifyPigeonSignature(header(NOW - 299), body, SECRET, NOW), 'ok');
});

test('a forged signature with an old timestamp is bad, not stale', () => {
  assert.equal(verifyPigeonSignature(header(NOW - 3600, body, 'not-the-secret'), body, SECRET, NOW), 'bad');
});

test('verifies the exact bytes, including an empty body', () => {
  const empty = Buffer.alloc(0);
  assert.equal(verifyPigeonSignature(header(NOW, empty), empty, SECRET, NOW), 'ok');
  assert.equal(verifyPigeonSignature(header(NOW, empty), body, SECRET, NOW), 'bad');
});

test('status only ever moves forward', () => {
  const rank = (s: string) => statusRank(s)!;
  assert.ok(rank('sent') > rank('queued'));
  assert.ok(rank('delivered') > rank('sent'));
  assert.ok(rank('failed') > rank('sent'));
  assert.equal(rank('delivered'), rank('failed'));
  assert.equal(statusRank('constructor'), undefined);
  assert.equal(statusRank(undefined), undefined);
  assert.equal(statusRank('teleported'), undefined);
});
