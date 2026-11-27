import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAP_GRACE_MS, planSend } from '../src/ws.js';

const T0 = 1_000_000;

test('consecutive seqs go out at once, in order', () => {
  assert.deepEqual(planSend(10, [11, 12, 13], null, T0), { send: [11, 12, 13], lastSent: 13, gapSince: null });
});

test('seqs at or below lastSent are never sent again', () => {
  assert.deepEqual(planSend(10, [8, 9, 10], null, T0), { send: [], lastSent: 10, gapSince: null });
});

test('a late lower seq is held until it arrives, then both go out in order', () => {
  const first = planSend(10, [12], null, T0);
  assert.deepEqual(first, { send: [], lastSent: 10, gapSince: T0 });
  const second = planSend(10, [11, 12], first.gapSince, T0 + 50);
  assert.deepEqual(second, { send: [11, 12], lastSent: 12, gapSince: null });
});

test('a real gap is skipped only after the grace period', () => {
  const held = planSend(10, [12, 13], null, T0);
  assert.deepEqual(held.send, []);
  const stillHeld = planSend(10, [12, 13], held.gapSince, T0 + GAP_GRACE_MS - 1);
  assert.deepEqual(stillHeld.send, []);
  const skipped = planSend(10, [12, 13], held.gapSince, T0 + GAP_GRACE_MS);
  assert.deepEqual(skipped, { send: [12, 13], lastSent: 13, gapSince: null });
});

test('after skipping a gap a second gap gets its own grace period', () => {
  const plan = planSend(10, [12, 15], T0 - 1000, T0);
  assert.deepEqual(plan, { send: [12], lastSent: 12, gapSince: T0 });
});

test('the sent sequence never goes backwards across successive passes', () => {
  let state = { lastSent: 0, gapSince: null as number | null };
  const sent: number[] = [];
  const passes: [number[], number][] = [[[1, 2, 4], 0], [[3, 4], 10], [[4, 6], 20], [[6], 20 + GAP_GRACE_MS + 1], [[5, 6, 7], 1000]];
  for (const [visible, dt] of passes) {
    const plan = planSend(state.lastSent, visible, state.gapSince, T0 + dt);
    sent.push(...plan.send);
    state = plan;
  }
  assert.deepEqual(sent, [1, 2, 3, 4, 6, 7]);
});
