import type { Document } from 'mongodb';
import { appendFrame } from './feed.js';
import { cols, isDuplicateKey, upsertConversation, type OutStatus } from './store.js';
import type { Role } from './session.js';

export class BadRequest extends Error {
  readonly status = 400;
}

export const canRelease = (role: Role, sub: string, assignee: string | null): boolean => assignee === null || assignee === sub || role === 'admin';

export interface ReplyInput {
  workspace: string;
  contact: string;
  text: string;
  clientRef: string;
  authorSub: string | null;
}

export async function queueReply({ workspace, contact, text, clientRef, authorSub }: ReplyInput): Promise<void> {
  const now = new Date();
  await upsertConversation(workspace, contact, now);
  const { outbound } = await cols();
  try {
    await outbound.insertOne({
      workspace,
      contact,
      text,
      clientRef,
      authorSub,
      status: 'queued',
      statusRank: 0,
      sendState: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      leaseUntil: null,
      pigeonId: null,
      createdAt: now,
    });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
  await appendFrame(workspace, `out:${clientRef}`, { type: 'message.outbound', contact, client_ref: clientRef });
}

export async function claimConversation(workspace: string, contact: string, agent: string): Promise<{ held: true } | { heldBy: string }> {
  const { conversations } = await cols();

  const claimPipeline: Document[] = [
    {
      $set: {
        assignVersion: { $cond: [{ $eq: ['$assignee', { $literal: agent }] }, '$assignVersion', { $add: [{ $ifNull: ['$assignVersion', 0] }, 1] }] },
        assignee: { $literal: agent },
        status: { $ifNull: ['$status', 'open'] },
        createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
        lastActivityAt: { $ifNull: ['$lastActivityAt', '$$NOW'] },
      },
    },
  ];

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const after = await conversations.findOneAndUpdate({ workspace, contact, $or: [{ assignee: null }, { assignee: agent }] }, claimPipeline, { upsert: true, returnDocument: 'after' });
      if (!after) throw new Error('claim upsert returned nothing');
      await appendFrame(workspace, `asg:${contact}:${after.assignVersion}`, { type: 'conversation.assigned', contact, assignee: agent });
      return { held: true };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const holder = await conversations.findOne({ workspace, contact });
      if (holder?.assignee && holder.assignee !== agent) return { heldBy: holder.assignee };
    }
  }
  throw new Error('claim did not settle');
}

export async function releaseConversation(workspace: string, contact: string, actor: { sub: string; role: Role }): Promise<'released' | 'forbidden' | 'not_found'> {
  const { conversations } = await cols();
  for (let attempt = 0; attempt < 3; attempt++) {
    const conv = await conversations.findOne({ workspace, contact });
    if (!conv) return 'not_found';
    if (!canRelease(actor.role, actor.sub, conv.assignee)) return 'forbidden';
    if (conv.assignee === null) {
      if (conv.assignVersion > 0) await appendFrame(workspace, `asg:${contact}:${conv.assignVersion}`, { type: 'conversation.assigned', contact, assignee: null });
      return 'released';
    }
    const after = await conversations.findOneAndUpdate({ workspace, contact, assignee: conv.assignee }, { $set: { assignee: null }, $inc: { assignVersion: 1 } }, { returnDocument: 'after' });
    if (after) {
      await appendFrame(workspace, `asg:${contact}:${after.assignVersion}`, { type: 'conversation.assigned', contact, assignee: null });
      return 'released';
    }
  }
  throw new Error('release did not settle');
}

export async function setConversationStatus(workspace: string, contact: string, status: 'open' | 'closed'): Promise<boolean> {
  const { conversations } = await cols();
  const changed = await conversations.findOneAndUpdate({ workspace, contact, status: { $ne: status } }, { $set: { status }, $inc: { statusVersion: 1 } }, { returnDocument: 'after' });
  const conv = changed ?? (await conversations.findOne({ workspace, contact }));
  if (!conv) return false;
  if (conv.statusVersion && conv.status === status) {
    await appendFrame(workspace, `sts:${contact}:${conv.statusVersion}`, { type: 'conversation.status', contact, status });
  }
  return true;
}

export interface ConversationHead {
  contact: string;
  assignee: string | null;
  status: 'open' | 'closed';
}

export interface ConversationItem extends ConversationHead {
  lastActivityAt: string;
  lastText: string | null;
}

export type ApiMessage =
  | { kind: 'inbound'; id: string; text: string; at: string }
  | { kind: 'outbound'; id: string; text: string; at: string; status: OutStatus; authorSub: string | null };

const PAGE_SIZE = 20;

const encodeCursor = (at: Date, contact: string) => Buffer.from(JSON.stringify([at.toISOString(), contact])).toString('base64url');

function decodeCursor(cursor: string): { at: Date; contact: string } {
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') {
      const at = new Date(v[0]);
      if (!Number.isNaN(at.getTime())) return { at, contact: v[1] };
    }
  } catch {
    // falls through to the error below
  }
  throw new BadRequest('invalid cursor');
}

export async function listConversations(workspace: string, cursor: string | undefined): Promise<{ items: ConversationItem[]; nextCursor: string | null }> {
  const { conversations, messages, outbound } = await cols();
  const filter: Document = { workspace };
  if (cursor) {
    const c = decodeCursor(cursor);
    filter.$or = [{ lastActivityAt: { $lt: c.at } }, { lastActivityAt: c.at, contact: { $gt: c.contact } }];
  }
  const rows = await conversations.find(filter).sort({ lastActivityAt: -1, contact: 1 }).limit(PAGE_SIZE + 1).toArray();
  const page = rows.slice(0, PAGE_SIZE);

  const items = await Promise.all(
    page.map(async (conv): Promise<ConversationItem> => {
      const [inbound, reply] = await Promise.all([
        messages.findOne({ workspace, contact: conv.contact }, { sort: { occurredAt: -1, messageId: -1 }, projection: { text: 1, occurredAt: 1 } }),
        outbound.findOne({ workspace, contact: conv.contact }, { sort: { createdAt: -1 }, projection: { text: 1, createdAt: 1 } }),
      ]);
      const lastText = reply && (!inbound || reply.createdAt > inbound.occurredAt) ? reply.text : (inbound?.text ?? null);
      return { contact: conv.contact, assignee: conv.assignee ?? null, status: conv.status, lastActivityAt: conv.lastActivityAt.toISOString(), lastText };
    }),
  );
  const last = rows.length > PAGE_SIZE ? page[page.length - 1] : undefined;
  return { items, nextCursor: last ? encodeCursor(last.lastActivityAt, last.contact) : null };
}

export async function conversationDetail(workspace: string, contact: string): Promise<{ conversation: ConversationHead; messages: ApiMessage[] } | null> {
  const { conversations, messages, outbound } = await cols();
  const conv = await conversations.findOne({ workspace, contact });
  if (!conv) return null;
  const [inbound, replies] = await Promise.all([
    messages.find({ workspace, contact }).sort({ occurredAt: 1, messageId: 1 }).toArray(),
    outbound.find({ workspace, contact }).sort({ createdAt: 1 }).toArray(),
  ]);

  const merged: ApiMessage[] = [];
  let i = 0;
  let j = 0;
  while (i < inbound.length || j < replies.length) {
    const m = inbound[i];
    const r = replies[j];
    if (m && (!r || m.occurredAt.getTime() <= r.createdAt.getTime())) {
      merged.push({ kind: 'inbound', id: m.messageId, text: m.text, at: m.occurredAt.toISOString() });
      i++;
    } else if (r) {
      merged.push({ kind: 'outbound', id: r.clientRef, text: r.text, at: r.createdAt.toISOString(), status: r.status, authorSub: r.authorSub });
      j++;
    }
  }
  return { conversation: { contact: conv.contact, assignee: conv.assignee ?? null, status: conv.status }, messages: merged };
}
