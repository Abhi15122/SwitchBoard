import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { memberRole, originAllowed } from './access.js';
import { getRedis } from './redis.js';
import { sessionExists, sessionFromCookie, sessionIdFrom } from './session.js';
import { cols } from './store.js';

export const GAP_GRACE_MS = 300;
const POLL_MS = 1500;
const PING_MS = 25_000;
const BATCH = 500;
const RESET_CLOSE_CODE = 4000;
const FEED_PREFIX = 'sb:feed:';

export interface SendPlan {
  send: number[];
  lastSent: number;
  gapSince: number | null;
}

/**
 * Decides which of the visible seqs (ascending, may contain gaps) go out now.
 * A seq is sent when it directly follows lastSent, or when the missing seq before it
 * has been missing for GAP_GRACE_MS, which means it was never written. Never goes backwards.
 */
export function planSend(lastSent: number, visible: number[], gapSince: number | null, now: number, graceMs = GAP_GRACE_MS): SendPlan {
  const send: number[] = [];
  let last = lastSent;
  let since = gapSince;
  for (const seq of visible) {
    if (seq <= last) continue;
    if (seq !== last + 1) {
      since ??= now;
      if (now - since < graceMs) break;
    }
    send.push(seq);
    last = seq;
    since = null;
  }
  return { send, lastSent: last, gapSince: since };
}

interface Client {
  ws: WebSocket;
  workspace: string;
  sid: string;
  alive: boolean;
  wake: () => void;
}

const refuse = (socket: Duplex, status: number, reason: string) => {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
};

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const clients = new Set<Client>();

  const subscriber = getRedis().duplicate();
  subscriber.on('error', () => {});
  void subscriber.psubscribe(`${FEED_PREFIX}*`);
  void subscriber.subscribe('sb:reset');
  subscriber.on('pmessage', (_pattern, channel) => {
    const workspace = channel.slice(FEED_PREFIX.length);
    for (const c of clients) if (c.workspace === workspace) c.wake();
  });
  subscriber.on('message', (channel) => {
    if (channel !== 'sb:reset') return;
    for (const c of clients) c.ws.close(RESET_CLOSE_CODE, 'reset');
  });

  setInterval(() => {
    for (const c of clients) c.wake();
  }, POLL_MS).unref();

  setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
      void sessionExists(c.sid).then((exists) => {
        if (!exists) c.ws.close(4401, 'signed out');
      }, () => {});
    }
  }, PING_MS).unref();

  async function start(ws: WebSocket, workspace: string, sid: string, after: number | undefined) {
    const { feed } = await cols();
    let lastSent = after ?? (await feed.find({ workspace }, { projection: { seq: 1 } }).sort({ seq: -1 }).limit(1).next())?.seq ?? 0;
    let gapSince: number | null = null;
    let busy = false;
    let dirty = false;
    let timer: NodeJS.Timeout | undefined;

    async function pump() {
      if (busy) {
        dirty = true;
        return;
      }
      busy = true;
      try {
        do {
          dirty = false;
          if (ws.readyState !== WebSocket.OPEN) return;
          const docs = await feed.find({ workspace, seq: { $gt: lastSent } }).sort({ seq: 1 }).limit(BATCH).toArray();
          const plan = planSend(lastSent, docs.map((d) => d.seq), gapSince, Date.now());
          const bySeq = new Map(docs.map((d) => [d.seq, d.frame]));
          for (const seq of plan.send) ws.send(JSON.stringify(bySeq.get(seq)));
          lastSent = plan.lastSent;
          gapSince = plan.gapSince;
          clearTimeout(timer);
          if (gapSince !== null) timer = setTimeout(() => void pump(), Math.max(20, GAP_GRACE_MS - (Date.now() - gapSince) + 20));
          else if (docs.length === BATCH) dirty = true;
        } while (dirty);
      } catch {
        // the next wake-up or poll retries
      } finally {
        busy = false;
      }
    }

    const client: Client = { ws, workspace, sid, alive: true, wake: () => void pump() };
    clients.add(client);
    ws.on('pong', () => (client.alive = true));
    ws.on('error', () => ws.terminate());
    ws.on('close', () => {
      clients.delete(client);
      clearTimeout(timer);
    });
    void pump();
  }

  async function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') return refuse(socket, 404, 'Not Found');
    if (!originAllowed(req.headers.origin, `http://${req.headers.host ?? ''}`)) return refuse(socket, 403, 'Forbidden');

    const session = await sessionFromCookie(req.headers.cookie);
    const sid = sessionIdFrom(req.headers.cookie);
    if (!session || !sid) return refuse(socket, 401, 'Unauthorized');
    const workspace = url.searchParams.get('workspace');
    if (workspace === null || memberRole(session, workspace) === null) return refuse(socket, 403, 'Forbidden');

    const afterParam = url.searchParams.get('after');
    if (afterParam !== null && !/^\d{1,15}$/.test(afterParam)) return refuse(socket, 400, 'Bad Request');

    wss.handleUpgrade(req, socket, head, (ws) => {
      start(ws, workspace, sid, afterParam === null ? undefined : Number(afterParam)).catch(() => ws.close(1011, 'internal error'));
    });
  }

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    upgrade(req, socket, head).catch(() => refuse(socket, 500, 'Internal Server Error'));
  });
}
