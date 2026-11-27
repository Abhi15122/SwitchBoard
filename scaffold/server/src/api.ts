import express, { Router, type Request, type Response } from 'express';
import { csrfGuard, requireMember, requireSession } from './access.js';
import { claimConversation, conversationDetail, listConversations, queueReply, releaseConversation, setConversationStatus } from './conversations.js';
import { ah, isRecord, isString } from './util.js';

export const api = Router();

const MAX_TEXT = 2000;
const MAX_REF = 200;

api.use('/api', express.json({ limit: '16kb' }), csrfGuard);

api.get('/api/me', requireSession, (req, res) => {
  const { sub, name, workspaces } = req.session!;
  res.json({ sub, name, workspaces });
});

api.get(
  '/api/conversations',
  requireMember,
  ah(async (req, res) => {
    const cursor = isString(req.query.cursor) && req.query.cursor !== '' ? req.query.cursor : undefined;
    res.json(await listConversations(req.auth!.workspace, cursor));
  }),
);

api.get(
  '/api/conversations/:contact',
  requireMember,
  ah(async (req, res) => {
    const detail = await conversationDetail(req.auth!.workspace, req.params.contact!);
    if (!detail) return res.status(404).json({ error: 'no such conversation' });
    res.json(detail);
  }),
);

api.post(
  '/api/conversations/:contact/reply',
  requireMember,
  ah(async (req, res) => {
    const { text, client_ref: clientRef } = isRecord(req.body) ? req.body : {};
    if (!isString(text) || text.trim() === '' || !isString(clientRef) || clientRef === '') return res.status(400).json({ error: 'text and client_ref must be non-empty strings' });
    if (text.length > MAX_TEXT || clientRef.length > MAX_REF) return res.status(400).json({ error: 'text or client_ref too long' });
    const { user, workspace } = req.auth!;
    await queueReply({ workspace, contact: req.params.contact!, text, clientRef, authorSub: user.sub });
    res.status(202).json({ ok: true });
  }),
);

const action = (path: string, run: (req: Request, res: Response) => Promise<unknown>) => api.post(`/api/conversations/:contact/${path}`, requireMember, ah(run));

action('claim', async (req, res) => {
  const { user, workspace } = req.auth!;
  const result = await claimConversation(workspace, req.params.contact!, user.sub);
  if ('heldBy' in result) return res.status(409).json({ error: 'already claimed', assignee: result.heldBy });
  res.json({ ok: true, assignee: user.sub });
});

action('release', async (req, res) => {
  const { user, workspace, role } = req.auth!;
  const result = await releaseConversation(workspace, req.params.contact!, { sub: user.sub, role });
  if (result === 'not_found') return res.status(404).json({ error: 'no such conversation' });
  if (result === 'forbidden') return res.status(403).json({ error: 'only the holder or an admin can release' });
  res.json({ ok: true });
});

for (const [path, status] of [['close', 'closed'], ['reopen', 'open']] as const) {
  action(path, async (req, res) => {
    if (!(await setConversationStatus(req.auth!.workspace, req.params.contact!, status))) return res.status(404).json({ error: 'no such conversation' });
    res.json({ ok: true, status });
  });
}
