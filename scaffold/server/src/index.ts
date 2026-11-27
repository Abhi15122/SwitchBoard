import express, { type ErrorRequestHandler } from 'express';
import { createServer } from 'node:http';
import { api } from './api.js';
import { auth } from './auth.js';
import { config } from './config.js';
import { getDb } from './db.js';
import { grader } from './grader.js';
import { getRedis } from './redis.js';
import { ensureIndexes } from './store.js';
import { webhooks } from './webhooks.js';
import { attachWebSocket } from './ws.js';
import { startWorker, stopWorker } from './worker.js';

const app = express();
let ready = false;

app.get('/healthz', (_req, res) => {
  if (!ready) return res.status(503).json({ ok: false });
  res.json({ ok: true });
});

app.use(webhooks);
app.use(grader);
app.use(auth);
app.use(api);

const onError: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) return res.status(status).json({ error: String(err.message ?? 'bad request') });
  console.error(`${req.method} ${req.path}`, err);
  res.status(500).json({ error: 'internal error' });
};
app.use(onError);

const server = createServer(app);
attachWebSocket(server);
server.listen(config.port, () => {
  console.log(`server on http://localhost:${config.port}`);
});

async function boot() {
  for (;;) {
    try {
      await getDb();
      await ensureIndexes();
      await getRedis().ping();
      ready = true;
      startWorker();
      return;
    } catch (err) {
      console.error('boot failed, retrying', err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
void boot();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void stopWorker().finally(() => process.exit(0));
  });
}
