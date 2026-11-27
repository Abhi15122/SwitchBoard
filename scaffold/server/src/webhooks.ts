import express, { Router } from 'express';
import { config } from './config.js';
import { appendFrame } from './feed.js';
import { advanceStatus } from './outbound.js';
import { verifyPigeonSignature } from './signature.js';
import { cols, isDuplicateKey, upsertConversation } from './store.js';
import { ah, isRecord, isString, known } from './util.js';

export const webhooks = Router();

webhooks.post(
  '/webhooks/pigeon',
  express.raw({ type: '*/*', limit: '1mb' }),
  ah(async (req, res) => {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const verdict = verifyPigeonSignature(req.header('x-pigeon-signature'), raw, config.pigeon.webhookSecret, Math.floor(Date.now() / 1000));
    if (verdict !== 'ok') return res.status(401).json({ error: verdict });

    let event: unknown;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'body is not JSON' });
    }
    if (!isRecord(event)) return res.status(400).json({ error: 'body is not an object' });

    const { type, workspace, data } = event;
    if ((type !== 'message.inbound' && type !== 'message.status') || !known(config.pigeon.apiKeys, workspace)) {
      return res.json({ ok: true, ignored: true });
    }

    if (type === 'message.inbound') {
      const occurredAt = isString(event.occurred_at) ? new Date(event.occurred_at) : null;
      if (!isRecord(data) || !isString(data.message_id) || !isString(data.from) || !isString(data.text) || !occurredAt || Number.isNaN(occurredAt.getTime())) {
        return res.status(400).json({ error: 'invalid message.inbound' });
      }
      await storeInbound(workspace, data.from, data.message_id, data.text, occurredAt);
      return res.json({ ok: true });
    }

    if (isRecord(data) && isString(data.client_ref) && isString(data.status)) await advanceStatus(workspace, data.client_ref, data.status);
    return res.json({ ok: true });
  }),
);

async function storeInbound(workspace: string, contact: string, messageId: string, text: string, occurredAt: Date) {
  const { messages } = await cols();
  try {
    await messages.insertOne({ workspace, contact, messageId, text, occurredAt, receivedAt: new Date() });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
  await upsertConversation(workspace, contact, occurredAt);
  await appendFrame(workspace, `in:${messageId}`, { type: 'message.inbound', contact, message_id: messageId });
}
