import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Redis } from 'ioredis';
import { clearFailures, penalize, recordFailure, take } from '../src/gate.js';

const URL = 'redis://localhost:6379/2';
const open = () => new Redis(URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const a = open();
const b = open();
let up = true;
try {
  await a.connect();
  await b.connect();
} catch {
  up = false;
}

const WS = 'ws_gate_test';
const OTHER = 'ws_gate_other';
const flush = () => a.del(`sb:gate:${WS}`, `sb:gate:${WS}:fails`, `sb:gate:${OTHER}`);

before(async () => {
  if (up) await flush();
});
after(async () => {
  if (up) await flush();
  a.disconnect();
  b.disconnect();
});

const skip = up ? false : 'Redis is not reachable on localhost:6379';

test('concurrent takers on two connections get no more than burst plus refill', { skip }, async () => {
  await flush();
  const started = Date.now();
  const waits = await Promise.all(Array.from({ length: 300 }, (_, i) => take(WS, i % 2 ? a : b)));
  const elapsedSec = (Date.now() - started) / 1000;
  const granted = waits.filter((w) => w === 0).length;
  assert.ok(granted >= 4, `burst of 4 should be available, got ${granted}`);
  assert.ok(granted <= 4 + Math.ceil(elapsedSec * 3), `${granted} grants in ${elapsedSec}s exceeds burst + refill`);
  for (const w of waits.filter((w) => w > 0)) assert.ok(w <= 400, `wait ${w} ms should be about one refill interval`);
});

test('a denied taker is told how long to wait, and gets a token after it', { skip }, async () => {
  await flush();
  for (let i = 0; i < 4; i++) assert.equal(await take(WS, a), 0);
  const wait = await take(WS, b);
  assert.ok(wait > 0 && wait <= 400, `wait was ${wait}`);
  await sleep(wait + 50);
  assert.equal(await take(WS, a), 0);
});

test('penalize blocks every taker on every connection until it expires', { skip }, async () => {
  await flush();
  await penalize(WS, 1200, a);
  const waits = await Promise.all(Array.from({ length: 20 }, (_, i) => take(WS, i % 2 ? a : b)));
  for (const w of waits) assert.ok(w > 0 && w <= 1200, `wait ${w}`);
  assert.equal(await take(OTHER, a), 0, 'another workspace is unaffected');

  await penalize(WS, 100, b);
  assert.ok((await take(WS, a)) > 200, 'a shorter penalty does not shorten an existing one');

  await sleep(1300);
  assert.equal(await take(WS, a), 0);
});

test('a flushed key means a full bucket', { skip }, async () => {
  await flush();
  for (let i = 0; i < 4; i++) assert.equal(await take(WS, a), 0);
  assert.ok((await take(WS, a)) > 0);
  await flush();
  for (let i = 0; i < 4; i++) assert.equal(await take(WS, b), 0);
  assert.ok((await take(WS, b)) > 0);
});

test('the failure counter counts up and clears on success', { skip }, async () => {
  await flush();
  assert.deepEqual([await recordFailure(WS, a), await recordFailure(WS, b), await recordFailure(WS, a)], [1, 2, 3]);
  await clearFailures(WS, b);
  assert.equal(await recordFailure(WS, a), 1);
});
