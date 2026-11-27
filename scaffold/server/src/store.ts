import type { Collection, Db } from 'mongodb';
import { getDb } from './db.js';

export type OutStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface MessageDoc {
  workspace: string;
  contact: string;
  messageId: string;
  text: string;
  occurredAt: Date;
  receivedAt: Date;
}

export interface ConversationDoc {
  workspace: string;
  contact: string;
  assignee: string | null;
  assignVersion: number;
  status: 'open' | 'closed';
  lastActivityAt: Date;
  createdAt: Date;
}

export interface OutboundDoc {
  workspace: string;
  contact: string;
  text: string;
  clientRef: string;
  authorSub: string | null;
  status: OutStatus;
  statusRank: number;
  sendState: 'pending';
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil: Date | null;
  pigeonId: string | null;
  createdAt: Date;
}

export type Frame =
  | { seq: number; type: 'message.inbound'; contact: string; message_id: string }
  | { seq: number; type: 'message.status'; contact: string; client_ref: string; status: OutStatus }
  | { seq: number; type: 'conversation.assigned'; contact: string; assignee: string }
  | { seq: number; type: 'message.outbound'; contact: string; client_ref: string };

export interface FeedDoc {
  workspace: string;
  seq: number;
  dedupeKey: string;
  frame: Frame;
  createdAt: Date;
}

export interface CounterDoc {
  _id: string;
  seq: number;
}

const RANKS: Record<string, number> = { queued: 0, sent: 1, delivered: 2, failed: 2 };

export function statusRank(status: unknown): number | undefined {
  return typeof status === 'string' && Object.hasOwn(RANKS, status) ? RANKS[status] : undefined;
}

export interface Cols {
  messages: Collection<MessageDoc>;
  conversations: Collection<ConversationDoc>;
  outbound: Collection<OutboundDoc>;
  feed: Collection<FeedDoc>;
  counters: Collection<CounterDoc>;
}

function colsOf(db: Db): Cols {
  return {
    messages: db.collection<MessageDoc>('messages'),
    conversations: db.collection<ConversationDoc>('conversations'),
    outbound: db.collection<OutboundDoc>('outbound'),
    feed: db.collection<FeedDoc>('feed'),
    counters: db.collection<CounterDoc>('counters'),
  };
}

export async function cols(): Promise<Cols> {
  return colsOf(await getDb());
}

export async function ensureIndexes(): Promise<void> {
  const c = await cols();
  await Promise.all([
    c.messages.createIndex({ workspace: 1, messageId: 1 }, { unique: true }),
    c.messages.createIndex({ workspace: 1, contact: 1, occurredAt: 1, messageId: 1 }),
    c.conversations.createIndex({ workspace: 1, contact: 1 }, { unique: true }),
    c.conversations.createIndex({ workspace: 1, lastActivityAt: -1 }),
    c.outbound.createIndex({ workspace: 1, clientRef: 1 }, { unique: true }),
    c.outbound.createIndex({ sendState: 1, nextAttemptAt: 1 }),
    c.feed.createIndex({ workspace: 1, seq: 1 }, { unique: true }),
    c.feed.createIndex({ workspace: 1, dedupeKey: 1 }, { unique: true }),
  ]);
}

export function isDuplicateKey(err: unknown): err is { code: 11000; keyPattern?: Record<string, number> } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

export async function retryDuplicate<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isDuplicateKey(err) || i >= attempts) throw err;
    }
  }
}

export async function upsertConversation(workspace: string, contact: string, activityAt: Date): Promise<void> {
  const { conversations } = await cols();
  await retryDuplicate(() =>
    conversations.updateOne(
      { workspace, contact },
      {
        $setOnInsert: { assignee: null, assignVersion: 0, createdAt: new Date() },
        $max: { lastActivityAt: activityAt },
        $set: { status: 'open' },
      },
      { upsert: true },
    ),
  );
}
