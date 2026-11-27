import { config } from './config.js';
import { backoffMs, clearFailures, penalize, recordFailure, take } from './gate.js';
import { advanceStatus } from './outbound.js';
import { sendToPigeon } from './pigeon.js';
import { cols, type OutboundDoc } from './store.js';
import type { WithId } from 'mongodb';

const TICK_MS = 250;
const LEASE_MS = 15_000;
const MAX_IN_FLIGHT = 4;

type Row = WithId<OutboundDoc>;

let loop: Promise<void> | undefined;
let stopped = false;
let inFlight = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logError = (what: string, err: unknown) => console.error(`worker ${what}:`, err instanceof Error ? err.message : String(err));

export function startWorker(): void {
  if (loop) return;
  stopped = false;
  loop = run();
}

export async function stopWorker(): Promise<void> {
  stopped = true;
  await loop;
  loop = undefined;
}

async function run(): Promise<void> {
  for (let tick = 0; !stopped; tick++) {
    const workspaces = Object.keys(config.pigeon.apiKeys);
    for (let i = 0; i < workspaces.length && !stopped; i++) {
      const workspace = workspaces[(tick + i) % workspaces.length]!;
      try {
        await drain(workspace);
      } catch (err) {
        logError(workspace, err);
      }
    }
    await sleep(TICK_MS);
  }
}

async function drain(workspace: string): Promise<void> {
  const { outbound } = await cols();
  while (!stopped && inFlight < MAX_IN_FLIGHT) {
    const now = new Date();
    const row = await outbound.findOneAndUpdate(
      { workspace, sendState: 'pending', nextAttemptAt: { $lte: now }, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] },
      { $set: { leaseUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' },
    );
    if (!row) return;

    if (row.statusRank >= 1) {
      await settle(row, { sendState: 'accepted', leaseUntil: null });
      continue;
    }
    if ((await take(workspace)) > 0) {
      await outbound.updateOne({ _id: row._id, sendState: 'pending' }, { $set: { leaseUntil: null }, $inc: { attempts: -1 } });
      return;
    }
    inFlight++;
    send(row)
      .catch((err) => logError(workspace, err))
      .finally(() => inFlight--);
  }
}

async function settle(row: Row, set: Partial<OutboundDoc>): Promise<void> {
  const { outbound } = await cols();
  await outbound.updateOne({ _id: row._id, sendState: 'pending' }, { $set: set });
}

async function retryAt(row: Row, ms: number): Promise<void> {
  await settle(row, { leaseUntil: null, nextAttemptAt: new Date(Date.now() + ms) });
}

async function send(row: Row): Promise<void> {
  const { workspace, clientRef } = row;
  const outcome = await sendToPigeon({ workspace, to: row.contact, text: row.text, clientRef });
  switch (outcome.kind) {
    case 'accepted':
      await settle(row, { sendState: 'accepted', pigeonId: outcome.id, leaseUntil: null });
      await clearFailures(workspace);
      return;
    case 'rateLimited':
      await penalize(workspace, outcome.retryAfterMs);
      return retryAt(row, outcome.retryAfterMs);
    case 'transient': {
      const ms = backoffMs(await recordFailure(workspace));
      await penalize(workspace, ms);
      return retryAt(row, ms);
    }
    case 'permanent':
      console.error(`worker permanent failure ${workspace} ${clientRef}`);
      await advanceStatus(workspace, clientRef, 'failed');
      await settle(row, { sendState: 'dead', leaseUntil: null });
      return;
  }
}
