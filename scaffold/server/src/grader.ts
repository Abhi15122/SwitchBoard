import { createHash, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { config } from './config.js';
import { claimConversation, queueReply } from './conversations.js';
import { getRedis } from './redis.js';
import { cols } from './store.js';
import { ah, isRecord, isString, known } from './util.js';

export const grader = Router();

const digest = (s: string) => createHash('sha256').update(s).digest();

grader.use('/__grader', (req, res, next) => {
  const token = req.header('x-grader-token');
  if (token === undefined || !timingSafeEqual(digest(token), digest(config.graderToken))) return res.status(401).json({ error: 'unauthorized' });
  next();
});
grader.use('/__grader', express.json());

grader.post(
  '/__grader/reset',
  ah(async (_req, res) => {
    const c = await cols();
    await Promise.all(Object.values(c).map((col) => col.deleteMany({})));
    const redis = getRedis();
    for await (const keys of redis.scanStream({ match: 'sb:*', count: 200 }) as AsyncIterable<string[]>) {
      const doomed = keys.filter((k) => !k.startsWith('sb:sess:'));
      if (doomed.length) await redis.del(...doomed);
    }
    await redis.publish('sb:reset', String(Date.now()));
    res.json({ ok: true });
  }),
);

grader.get(
  '/__grader/snapshot',
  ah(async (_req, res) => {
    const c = await cols();
    const [messages, conversations, outbound] = await Promise.all([
      c.messages.find({}, { projection: { workspace: 1, contact: 1, messageId: 1 } }).sort({ workspace: 1, contact: 1, occurredAt: 1, messageId: 1 }).toArray(),
      c.conversations.find({}, { projection: { workspace: 1, contact: 1, assignee: 1 } }).toArray(),
      c.outbound.find({}, { projection: { workspace: 1, clientRef: 1, status: 1 } }).toArray(),
    ]);

    const workspaces: Record<string, { contacts: Record<string, { inbound: string[]; assignee: string | null }>; outbound: Record<string, string> }> = {};
    for (const ws of Object.keys(config.pigeon.apiKeys)) workspaces[ws] = { contacts: {}, outbound: {} };
    const entry = (ws: string, contact: string) => {
      const contacts = workspaces[ws]?.contacts;
      if (!contacts) return undefined;
      return (contacts[contact] ??= { inbound: [], assignee: null });
    };
    for (const conv of conversations) {
      const e = entry(conv.workspace, conv.contact);
      if (e) e.assignee = conv.assignee ?? null;
    }
    for (const m of messages) entry(m.workspace, m.contact)?.inbound.push(m.messageId);
    for (const o of outbound) {
      const w = workspaces[o.workspace];
      if (w) w.outbound[o.clientRef] = o.status;
    }
    res.json({ workspaces });
  }),
);

const text = (v: unknown): v is string => isString(v) && v.length > 0;

grader.post(
  '/__grader/reply',
  ah(async (req, res) => {
    const b = req.body;
    if (!isRecord(b) || !text(b.workspace) || !text(b.contact) || !text(b.text) || !text(b.client_ref)) return res.status(400).json({ error: 'workspace, contact, text, client_ref must be non-empty strings' });
    if (!known(config.pigeon.apiKeys, b.workspace)) return res.status(404).json({ error: 'unknown workspace' });
    const { workspace, contact, text: body, client_ref: clientRef } = b as { workspace: string; contact: string; text: string; client_ref: string };

    await queueReply({ workspace, contact, text: body, clientRef, authorSub: null });
    res.status(202).json({ ok: true });
  }),
);

grader.post(
  '/__grader/claim',
  ah(async (req, res) => {
    const b = req.body;
    if (!isRecord(b) || !text(b.workspace) || !text(b.contact) || !text(b.agent)) return res.status(400).json({ error: 'workspace, contact, agent must be non-empty strings' });
    if (!known(config.pigeon.apiKeys, b.workspace)) return res.status(404).json({ error: 'unknown workspace' });
    const { workspace, contact, agent } = b as { workspace: string; contact: string; agent: string };
    const result = await claimConversation(workspace, contact, agent);
    if ('heldBy' in result) return res.status(409).json({ ok: false, assignee: result.heldBy });
    res.json({ ok: true, assignee: agent });
  }),
);
