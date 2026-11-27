import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backoffMs } from '../src/gate.js';
import { classify } from '../src/pigeon.js';

test('200 is accepted and carries the Pigeon id', () => {
  assert.deepEqual(classify({ status: 200, id: 'pm_1' }), { kind: 'accepted', id: 'pm_1' });
});

test('429 waits Retry-After seconds plus a 200 ms margin', () => {
  assert.deepEqual(classify({ status: 429, retryAfter: '2' }), { kind: 'rateLimited', retryAfterMs: 2200 });
  assert.deepEqual(classify({ status: 429, retryAfter: '1.5' }), { kind: 'rateLimited', retryAfterMs: 1700 });
});

test('429 without a usable Retry-After waits 2 seconds', () => {
  assert.deepEqual(classify({ status: 429 }), { kind: 'rateLimited', retryAfterMs: 2000 });
  assert.deepEqual(classify({ status: 429, retryAfter: null }), { kind: 'rateLimited', retryAfterMs: 2000 });
  assert.deepEqual(classify({ status: 429, retryAfter: 'soon' }), { kind: 'rateLimited', retryAfterMs: 2000 });
});

test('503 and other 5xx are transient', () => {
  for (const status of [500, 502, 503, 504]) assert.deepEqual(classify({ status }), { kind: 'transient' });
});

test('timeouts, aborts and network errors are transient', () => {
  assert.deepEqual(classify({ error: new DOMException('timed out', 'TimeoutError') }), { kind: 'transient' });
  assert.deepEqual(classify({ error: new DOMException('aborted', 'AbortError') }), { kind: 'transient' });
  assert.deepEqual(classify({ error: new TypeError('fetch failed') }), { kind: 'transient' });
});

test('400, 401 and other 4xx are permanent', () => {
  for (const status of [400, 401, 403, 404, 422]) assert.deepEqual(classify({ status }), { kind: 'permanent' });
});

test('backoff doubles from 500 ms and stops at 5 s', () => {
  const top = () => 1;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 50].map((n) => backoffMs(n, top)), [500, 1000, 2000, 4000, 5000, 5000, 5000]);
});

test('backoff jitter stays between half and all of the base delay', () => {
  for (const fails of [1, 2, 3, 4, 5, 9]) {
    const full = backoffMs(fails, () => 1);
    assert.equal(backoffMs(fails, () => 0), Math.round(full / 2));
    for (let i = 0; i < 50; i++) {
      const ms = backoffMs(fails);
      assert.ok(ms >= full / 2 - 1 && ms <= full, `${ms} outside [${full / 2}, ${full}]`);
    }
  }
});
